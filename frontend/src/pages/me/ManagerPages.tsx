import { useState } from 'react';
import { Badge, Card, DataTable, ErrorBox, FormModal, Loading, PageHeader, Tabs } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, labels, time } from '../../lib/format';
import { LeaveRequest, OvertimeRequest } from '../../types/models';
import { leaveRange } from '../leave/LeaveAdminPage';
import { otKind } from '../attendance/OvertimeAdminPage';

interface Pending {
  leave: LeaveRequest[];
  overtime: OvertimeRequest[];
}

type Review = { kind: 'leave' | 'overtime'; id: string; who: string; what: string; approve: boolean } | null;

/** Quản lý trực tiếp duyệt bước 1; đơn được duyệt chuyển tiếp tới nhân sự. */
export function MyApprovalsPage() {
  const [tab, setTab] = useState<'leave' | 'overtime'>('leave');
  const [review, setReview] = useState<Review>(null);
  const { data, error, loading, reload } = useFetch<Pending>('/me/approvals');

  const actions = (kind: 'leave' | 'overtime', id: string, who: string, what: string) => (
    <span className="toolbar justify-content-end">
      <button className="btn btn-sm btn-primary" onClick={() => setReview({ kind, id, who, what, approve: true })}>Duyệt</button>
      <button className="btn btn-sm btn-outline-danger" onClick={() => setReview({ kind, id, who, what, approve: false })}>Từ chối</button>
    </span>
  );

  return (
    <>
      <PageHeader title="Duyệt của tôi" subtitle="Đơn của nhân viên do bạn quản lý trực tiếp. Đơn bạn duyệt sẽ được chuyển tới phòng nhân sự duyệt cuối." />
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <Tabs
              tabs={[
                { key: 'leave', label: `Nghỉ phép (${data.leave.length})` },
                { key: 'overtime', label: `Làm thêm giờ (${data.overtime.length})` },
              ]}
              active={tab}
              onChange={setTab}
            />
            <Card flush>
              {tab === 'leave' ? (
                <DataTable
                  rows={data.leave}
                  rowKey={(r) => r.id}
                  empty="Không có đơn nghỉ nào chờ bạn duyệt"
                  columns={[
                    { header: 'Nhân viên', cell: (r) => <>{r.employment?.person.fullName}<div className="muted small">{r.employment?.codeEmp}</div></> },
                    { header: 'Loại', cell: (r) => r.leaveType.name },
                    { header: 'Thời gian', cell: (r) => leaveRange(r), className: 'nowrap' },
                    { header: 'Số ngày', cell: (r) => r.days, className: 'num' },
                    { header: 'Lý do', cell: (r) => r.reason ?? '—' },
                    {
                      header: '',
                      className: 'actions',
                      cell: (r) => actions('leave', r.id, r.employment?.person.fullName ?? '', `${r.leaveType.name} · ${leaveRange(r)} (${r.days} ngày)`),
                    },
                  ]}
                />
              ) : (
                <DataTable
                  rows={data.overtime}
                  rowKey={(o) => o.id}
                  empty="Không có đơn làm thêm giờ nào chờ bạn duyệt"
                  columns={[
                    { header: 'Nhân viên', cell: (o) => <>{o.employment?.person.fullName}<div className="muted small">{o.employment?.codeEmp}</div></> },
                    { header: 'Ngày', cell: (o) => date(o.workDate), className: 'nowrap' },
                    { header: 'Loại', cell: (o) => otKind(o) },
                    { header: 'Giờ', cell: (o) => Number(o.hours), className: 'num' },
                    { header: 'Nội dung', cell: (o) => o.reason ?? '—' },
                    {
                      header: '',
                      className: 'actions',
                      cell: (o) => actions('overtime', o.id, o.employment?.person.fullName ?? '', `${date(o.workDate)} · ${Number(o.hours)} giờ · ${otKind(o)}`),
                    },
                  ]}
                />
              )}
            </Card>
          </>
        )
      )}
      {review && (
        <FormModal
          title={review.approve ? 'Duyệt đơn' : 'Từ chối đơn'}
          fields={[{ name: 'note', label: review.approve ? 'Ý kiến (tuỳ chọn)' : 'Lý do từ chối', type: 'textarea', required: !review.approve }]}
          path={`/me/approvals/${review.kind}/${review.id}`}
          transform={(b) => ({ ...b, approve: review.approve })}
          submitLabel={review.approve ? 'Duyệt và chuyển nhân sự' : 'Từ chối'}
          successMessage={review.approve ? 'Đã duyệt, chuyển tới nhân sự' : 'Đã từ chối đơn'}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            reload();
          }}
        >
          <p className="mt-0">
            <strong>{review.who}</strong> · {review.what}
          </p>
        </FormModal>
      )}
    </>
  );
}

interface TeamMember {
  employmentId: string;
  codeEmp: string;
  status: string;
  person: { id: string; fullName: string; phone: string | null; email: string | null };
  job: string | null;
  org: string | null;
  today: { kind: string; label?: string; checkIn?: string | null; checkOut?: string | null };
}

function TodayStatus({ t }: { t: TeamMember['today'] }) {
  if (t.kind === 'LEAVE') return <Badge tone="blue">{t.label ? `Nghỉ: ${t.label.split(' đến ')[0]}` : 'Nghỉ phép'}</Badge>;
  if (t.kind === 'NONE') return <Badge>Chưa chấm công</Badge>;
  const tone = t.kind === 'LATE' ? 'yellow' : t.kind === 'ABSENT' ? 'red' : 'green';
  return (
    <span>
      <Badge tone={tone}>{labels.attendance[t.kind as keyof typeof labels.attendance] ?? t.kind}</Badge>
      {t.checkIn && <span className="muted small ms-2">vào {time(t.checkIn)}{t.checkOut && ` · ra ${time(t.checkOut)}`}</span>}
    </span>
  );
}

/** Danh sách nhân viên do mình quản lý trực tiếp và tình trạng hôm nay. */
export function MyTeamPage() {
  const { data, error, loading } = useFetch<TeamMember[]>('/me/team');
  const present = data?.filter((m) => ['PRESENT', 'LATE', 'REMOTE'].includes(m.today.kind)).length ?? 0;
  const onLeave = data?.filter((m) => m.today.kind === 'LEAVE').length ?? 0;
  return (
    <>
      <PageHeader
        title="Nhân viên của tôi"
        subtitle={data ? `${data.length} người · hôm nay ${present} đã chấm công, ${onLeave} nghỉ phép` : undefined}
      />
      <ErrorBox error={error} />
      <Card flush>
        <DataTable
          rows={data}
          loading={loading}
          rowKey={(m) => m.employmentId}
          empty="Bạn chưa quản lý trực tiếp ai"
          columns={[
            { header: 'Nhân viên', cell: (m) => <>{m.person.fullName}<div className="muted small">{m.codeEmp}</div></> },
            { header: 'Chức danh', cell: (m) => <>{m.job ?? '—'}<div className="muted small">{m.org}</div></> },
            { header: 'Liên hệ', cell: (m) => <span className="small">{m.person.phone ?? ''}{m.person.email && <div className="muted">{m.person.email}</div>}</span> },
            { header: 'Hôm nay', cell: (m) => <TodayStatus t={m.today} /> },
          ]}
        />
      </Card>
    </>
  );
}
