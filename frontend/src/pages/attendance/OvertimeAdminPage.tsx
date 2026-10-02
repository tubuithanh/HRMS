import { useState } from 'react';
import { api } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Card, DataTable, ErrorBox, FieldDef, FormModal, PageHeader, Tabs } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { currentMonth, date, labels, todayISO } from '../../lib/format';
import { Employment, OvertimeRequest } from '../../types/models';
import { ApprovalNote, LeaveStatusBadge } from '../leave/LeaveAdminPage';
import OvertimeSuggestions from '../../components/OvertimeSuggestions';

export function OvertimeStatusBadge({ status, stage }: { status: OvertimeRequest['status']; stage?: 'MANAGER' | 'HR' }) {
  return <LeaveStatusBadge status={status} stage={stage} />;
}

/** "Ngày thường · 150%" hoặc "Ngày lễ · đêm · 390%". */
export function otKind(o: Pick<OvertimeRequest, 'otType' | 'isNight' | 'multiplier'>) {
  return `${labels.otType[o.otType]}${o.isNight ? ' · đêm' : ''} · ${Math.round(Number(o.multiplier) * 100)}%`;
}

export interface OvertimeRules {
  weekdayMaxHours: number;
  restDayMaxHours: number;
  monthlyLimitHours: number;
  weekday: number;
  weekend: number;
  holiday: number;
  weekdayNight: number;
  weekendNight: number;
  holidayNight: number;
  registerWindowDays: number;
}

/** Giới hạn và hệ số đang áp dụng (Cấu hình hệ thống → Làm thêm giờ). */
export function useOvertimeRules() {
  return useFetch<OvertimeRules>('/me/overtime-rules').data;
}

const p100 = (n: number) => `${Math.round(n * 100)}%`;

export function OvertimeHint() {
  const r = useOvertimeRules();
  if (!r) return null;
  return (
    <div className="alert alert-info small">
      Hệ số: ngày thường {p100(r.weekday)}, ngày nghỉ tuần {p100(r.weekend)}, ngày lễ {p100(r.holiday)} (ban đêm {p100(r.weekdayNight)} /{' '}
      {p100(r.weekendNight)} / {p100(r.holidayNight)}). Tối đa {r.weekdayMaxHours} giờ/ngày thường, {r.restDayMaxHours} giờ/ngày nghỉ,{' '}
      {r.monthlyLimitHours} giờ/tháng; đăng ký trong vòng {r.registerWindowDays} ngày. Phần trả cao hơn lương giờ bình thường được miễn thuế TNCN.
    </div>
  );
}

type Filter = 'PENDING' | 'APPROVED' | 'ALL' | 'SUGGEST';

export default function OvertimeAdminPage() {
  const [tab, setTab] = useState<Filter>('PENDING');
  const [month, setMonth] = useState(currentMonth());
  const [dialog, setDialog] = useState<'create' | { review: OvertimeRequest; approve: boolean } | null>(null);
  const canWrite = useCanWrite('attendance');
  const query = new URLSearchParams({ month, ...(tab === 'ALL' || tab === 'SUGGEST' ? {} : { status: tab }) }).toString();
  const { data, error, loading, reload } = useFetch<OvertimeRequest[]>(`/attendance/overtime?${query}`);
  const employments = useFetch<Employment[]>(canWrite ? '/corehr/employments' : null);
  const totalHours = (data ?? []).filter((o) => o.status === 'APPROVED').reduce((s, o) => s + Number(o.hours), 0);

  const createFields: FieldDef[] = [
    {
      name: 'employmentId',
      label: 'Nhân viên',
      type: 'select',
      required: true,
      options: (employments.data ?? []).filter((e) => e.status !== 'TERMINATED').map((e) => ({ value: e.id, label: `${e.codeEmp} · ${e.person?.fullName}` })),
    },
    { name: 'workDate', label: 'Ngày làm thêm', type: 'date', required: true },
    { name: 'hours', label: 'Số giờ', type: 'number', required: true },
    { name: 'isNight', label: 'Làm ban đêm (22h – 6h)', type: 'checkbox' },
    { name: 'reason', label: 'Nội dung công việc', type: 'textarea', required: true },
  ];

  return (
    <>
      <PageHeader
        title="Làm thêm giờ"
        subtitle="Duyệt đơn làm thêm giờ. Đơn đã duyệt được tính vào kỳ lương của tháng đó."
        actions={
          <>
            <input type="month" className="form-control" style={{ width: 'auto' }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            {canWrite && <button className="btn btn-primary" onClick={() => setDialog('create')}>+ Đăng ký hộ</button>}
          </>
        }
      />
      <Tabs
        tabs={[
          { key: 'PENDING', label: 'Chờ duyệt' },
          { key: 'APPROVED', label: 'Đã duyệt' },
          { key: 'ALL', label: 'Tất cả' },
          { key: 'SUGGEST', label: 'Gợi ý từ chấm công' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'SUGGEST' && (
        <Card flush title="Ở lại sau giờ ca / đi làm ngày nghỉ nhưng chưa có đơn làm thêm giờ">
          <OvertimeSuggestions month={month} mode="hr" onCreated={reload} />
        </Card>
      )}
      {tab !== 'SUGGEST' && <Card flush title={tab === 'APPROVED' ? `Tổng ${totalHours} giờ đã duyệt trong tháng` : undefined}>
        <ErrorBox error={error} />
        <DataTable
          rows={data}
          loading={loading}
          rowKey={(o) => o.id}
          empty="Không có đơn nào"
          columns={[
            { header: 'Nhân viên', cell: (o) => <>{o.employment?.person.fullName}<div className="muted small">{o.employment?.codeEmp}</div></> },
            { header: 'Ngày', cell: (o) => date(o.workDate), className: 'nowrap' },
            { header: 'Loại', cell: (o) => otKind(o) },
            { header: 'Giờ', cell: (o) => Number(o.hours), className: 'num' },
            { header: 'Nội dung', cell: (o) => o.reason ?? '—' },
            { header: 'Trạng thái', cell: (o) => <><OvertimeStatusBadge status={o.status} stage={o.approvalStage} /><ApprovalNote r={o} /></> },
            {
              header: '',
              className: 'actions',
              cell: (o) =>
                canWrite &&
                o.status === 'PENDING' && (
                  <span className="toolbar justify-content-end">
                    <button className="btn btn-sm btn-primary" onClick={() => setDialog({ review: o, approve: true })}>Duyệt</button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => setDialog({ review: o, approve: false })}>Từ chối</button>
                    <ActionButton label="Huỷ" confirm="Huỷ đơn làm thêm giờ này?" run={() => api.post(`/attendance/overtime/${o.id}/cancel`)} onDone={reload} />
                  </span>
                ),
            },
          ]}
        />
      </Card>}

      {dialog === 'create' && (
        <FormModal
          title="Đăng ký làm thêm giờ hộ nhân viên"
          fields={createFields}
          initial={{ workDate: todayISO(), hours: 2 }}
          path="/attendance/overtime"
          successMessage="Đã tạo đơn (chờ duyệt)"
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); reload(); }}
        >
          <OvertimeHint />
        </FormModal>
      )}
      {dialog && typeof dialog === 'object' && (
        <FormModal
          title={dialog.approve ? 'Duyệt làm thêm giờ' : 'Từ chối làm thêm giờ'}
          fields={[{ name: 'note', label: 'Ghi chú', type: 'textarea' }]}
          path={`/attendance/overtime/${dialog.review.id}/review`}
          transform={(b) => ({ ...b, approve: dialog.approve })}
          submitLabel={dialog.approve ? 'Duyệt' : 'Từ chối'}
          successMessage={dialog.approve ? 'Đã duyệt' : 'Đã từ chối'}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); reload(); }}
        >
          <p className="mt-0">
            <strong>{dialog.review.employment?.person.fullName}</strong> · {date(dialog.review.workDate)} · {Number(dialog.review.hours)} giờ ·{' '}
            {otKind(dialog.review)}
          </p>
        </FormModal>
      )}
    </>
  );
}
