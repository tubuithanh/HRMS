import { useState } from 'react';
import { api } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Badge, Card, DataTable, ErrorBox, FieldDef, FormModal, PageHeader, Tabs } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, labels, todayISO } from '../../lib/format';
import { Employment, LeaveRequest, LeaveType } from '../../types/models';

/** Trạng thái đơn; đơn đang chờ hiện rõ bước: chờ quản lý / chờ HR. */
export function LeaveStatusBadge({ status, stage }: { status: LeaveRequest['status']; stage?: 'MANAGER' | 'HR' }) {
  const tone = { PENDING: 'yellow', APPROVED: 'green', REJECTED: 'red', CANCELLED: undefined } as const;
  if (status === 'PENDING' && stage) {
    return <Badge tone={stage === 'MANAGER' ? 'blue' : 'yellow'}>{stage === 'MANAGER' ? 'Chờ quản lý' : 'Chờ HR'}</Badge>;
  }
  return <Badge tone={tone[status]}>{labels.leaveStatus[status]}</Badge>;
}

/** Ghi chú dưới trạng thái: người duyệt bước 1, ý kiến quản lý, ý kiến HR. */
export function ApprovalNote(props: { r: Pick<LeaveRequest, 'status' | 'approvalStage' | 'approverEmployment' | 'managerNote' | 'reviewNote'> }) {
  const r = props.r;
  return (
    <>
      {r.status === 'PENDING' && r.approvalStage === 'MANAGER' && r.approverEmployment && (
        <div className="muted small">Người duyệt: {r.approverEmployment.person.fullName}</div>
      )}
      {r.managerNote && <div className="muted small">Quản lý: {r.managerNote}</div>}
      {r.reviewNote && r.reviewNote !== r.managerNote && <div className="muted small">{r.reviewNote}</div>}
    </>
  );
}

export function leaveRange(r: Pick<LeaveRequest, 'fromDate' | 'toDate' | 'isHalfDay' | 'halfDayPart'>) {
  const part = r.isHalfDay ? (r.halfDayPart === 'AFTERNOON' ? ' (chiều)' : ' (sáng)') : '';
  return r.fromDate === r.toDate ? `${date(r.fromDate)}${part}` : `${date(r.fromDate)} – ${date(r.toDate)}`;
}

export const HALF_DAY_FIELD: FieldDef = {
  name: 'halfDayPart',
  label: 'Buổi (khi nghỉ nửa ngày)',
  type: 'select',
  options: [
    { value: 'MORNING', label: 'Buổi sáng' },
    { value: 'AFTERNOON', label: 'Buổi chiều' },
  ],
};

type Filter = 'PENDING' | 'APPROVED' | 'ALL';

const monthAsNumber = (b: Record<string, unknown>) => ({
  ...b,
  carryOverUntilMonth: b.carryOverUntilMonth === null || b.carryOverUntilMonth === undefined ? b.carryOverUntilMonth : Number(b.carryOverUntilMonth),
});

export default function LeaveAdminPage() {
  const [tab, setTab] = useState<Filter | 'types'>('PENDING');
  const [dialog, setDialog] = useState<'create' | 'type' | { review: LeaveRequest; approve: boolean } | { editType: LeaveType } | null>(null);
  const canWrite = useCanWrite('leave');
  const query = tab === 'ALL' || tab === 'types' ? '' : `?status=${tab}`;
  const requests = useFetch<LeaveRequest[]>(tab === 'types' ? null : `/leave/requests${query}`);
  const types = useFetch<LeaveType[]>('/leave/types');
  const employments = useFetch<Employment[]>(canWrite ? '/corehr/employments' : null);

  const createFields: FieldDef[] = [
    {
      name: 'employmentId',
      label: 'Nhân viên',
      type: 'select',
      required: true,
      options: (employments.data ?? [])
        .filter((e) => e.status !== 'TERMINATED')
        .map((e) => ({ value: e.id, label: `${e.codeEmp} · ${e.person?.fullName}` })),
    },
    { name: 'leaveTypeId', label: 'Loại nghỉ', type: 'select', required: true, options: (types.data ?? []).filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name })) },
    { name: 'fromDate', label: 'Từ ngày', type: 'date', required: true },
    { name: 'toDate', label: 'Đến ngày', type: 'date', required: true },
    { name: 'isHalfDay', label: 'Nghỉ nửa ngày', type: 'checkbox' },
    HALF_DAY_FIELD,
    { name: 'reason', label: 'Lý do', type: 'textarea' },
  ];
  const typeFields: FieldDef[] = [
    { name: 'code', label: 'Mã', required: true },
    { name: 'name', label: 'Tên loại nghỉ', required: true },
    { name: 'daysPerYear', label: 'Số ngày/năm (trống = không giới hạn)', type: 'number', nullable: true },
    { name: 'isPaid', label: 'Công ty trả lương', type: 'checkbox' },
    { name: 'seniorityBonus', label: 'Cộng 1 ngày mỗi 5 năm thâm niên', type: 'checkbox' },
    { name: 'carryOverMaxDays', label: 'Chuyển sang năm sau tối đa (ngày)', type: 'number', nullable: true },
    {
      name: 'carryOverUntilMonth',
      label: 'Phép chuyển dùng đến hết tháng',
      type: 'select',
      nullable: true,
      options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Tháng ${i + 1}` })),
    },
  ];

  return (
    <>
      <PageHeader
        title="Nghỉ phép"
        subtitle="Duyệt đơn nghỉ và quản lý loại nghỉ"
        actions={
          canWrite && (
            <>
              <button className="btn btn-outline-secondary" onClick={() => setDialog('type')}>+ Loại nghỉ</button>
              <button className="btn btn-primary" onClick={() => setDialog('create')}>+ Tạo đơn hộ</button>
            </>
          )
        }
      />
      <Tabs
        tabs={[
          { key: 'PENDING', label: 'Chờ duyệt' },
          { key: 'APPROVED', label: 'Đã duyệt' },
          { key: 'ALL', label: 'Tất cả' },
          { key: 'types', label: 'Loại nghỉ' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab !== 'types' && (
        <Card flush>
          <ErrorBox error={requests.error} />
          <DataTable
            rows={requests.data}
            loading={requests.loading}
            rowKey={(r) => r.id}
            empty="Không có đơn nào"
            columns={[
              { header: 'Nhân viên', cell: (r) => <>{r.employment?.person.fullName}<div className="muted">{r.employment?.codeEmp}</div></> },
              { header: 'Loại', cell: (r) => r.leaveType.name },
              { header: 'Thời gian', cell: (r) => leaveRange(r), className: 'nowrap' },
              { header: 'Số ngày', cell: (r) => r.days, className: 'num' },
              { header: 'Lý do', cell: (r) => r.reason ?? '—' },
              { header: 'Trạng thái', cell: (r) => <><LeaveStatusBadge status={r.status} stage={r.approvalStage} /><ApprovalNote r={r} /></> },
              {
                header: '',
                className: 'actions',
                cell: (r) =>
                  canWrite && (
                    <span className="toolbar" style={{ justifyContent: 'flex-end' }}>
                      {r.status === 'PENDING' && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => setDialog({ review: r, approve: true })}>Duyệt</button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => setDialog({ review: r, approve: false })}>Từ chối</button>
                        </>
                      )}
                      {(r.status === 'PENDING' || r.status === 'APPROVED') && (
                        <ActionButton label="Huỷ" confirm="Huỷ đơn nghỉ này?" run={() => api.post(`/leave/requests/${r.id}/cancel`)} success="Đã huỷ đơn" onDone={requests.reload} />
                      )}
                    </span>
                  ),
              },
            ]}
          />
        </Card>
      )}
      {tab === 'types' && (
        <Card flush>
          <DataTable
            rows={types.data}
            loading={types.loading}
            rowKey={(t) => t.id}
            columns={[
              { header: 'Mã', cell: (t) => t.code },
              { header: 'Tên', cell: (t) => t.name },
              { header: 'Số ngày/năm', cell: (t) => t.daysPerYear ?? 'Không giới hạn' },
              { header: 'Trả lương', cell: (t) => (t.isPaid ? 'Có' : 'Không') },
              { header: 'Thâm niên', cell: (t) => (t.seniorityBonus ? '+1 ngày / 5 năm' : '') },
              {
                header: 'Chuyển năm sau',
                cell: (t) => (t.carryOverMaxDays ? `tối đa ${Number(t.carryOverMaxDays)} ngày, dùng đến hết T${t.carryOverUntilMonth}` : ''),
              },
              { header: 'Trạng thái', cell: (t) => (t.isActive ? <Badge tone="green">Đang dùng</Badge> : <Badge>Ngừng</Badge>) },
              {
                header: '',
                className: 'actions',
                cell: (t) =>
                  canWrite && (
                    <span className="toolbar" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ editType: t })}>Sửa</button>
                      <ActionButton
                        label={t.isActive ? 'Ngừng dùng' : 'Dùng lại'}
                        run={() => api.patch(`/leave/types/${t.id}`, { isActive: !t.isActive })}
                        onDone={types.reload}
                      />
                    </span>
                  ),
              },
            ]}
          />
        </Card>
      )}

      {dialog === 'create' && (
        <FormModal
          title="Tạo đơn nghỉ hộ nhân viên"
          fields={createFields}
          initial={{ fromDate: todayISO(), toDate: todayISO() }}
          path="/leave/requests"
          successMessage="Đã tạo đơn (chờ duyệt)"
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); requests.reload(); }}
        />
      )}
      {dialog === 'type' && (
        <FormModal title="Thêm loại nghỉ" fields={typeFields} initial={{ isPaid: true }} transform={monthAsNumber} path="/leave/types" onClose={() => setDialog(null)} onSaved={() => { setDialog(null); types.reload(); }} />
      )}
      {dialog && typeof dialog === 'object' && 'editType' in dialog && (
        <FormModal
          title={`Sửa ${dialog.editType.name}`}
          fields={typeFields.filter((f) => f.name !== 'code')}
          initial={dialog.editType}
          transform={monthAsNumber}
          method="patch"
          path={`/leave/types/${dialog.editType.id}`}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); types.reload(); }}
        />
      )}
      {dialog && typeof dialog === 'object' && 'review' in dialog && (
        <FormModal
          title={dialog.approve ? 'Duyệt đơn nghỉ' : 'Từ chối đơn nghỉ'}
          fields={[{ name: 'note', label: 'Ghi chú', type: 'textarea' }]}
          path={`/leave/requests/${dialog.review.id}/review`}
          transform={(b) => ({ ...b, approve: dialog.approve })}
          submitLabel={dialog.approve ? 'Duyệt' : 'Từ chối'}
          successMessage={dialog.approve ? 'Đã duyệt đơn' : 'Đã từ chối đơn'}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); requests.reload(); }}
        >
          <p style={{ marginTop: 0 }}>
            <strong>{dialog.review.employment?.person.fullName}</strong> · {dialog.review.leaveType.name} · {leaveRange(dialog.review)} ({dialog.review.days} ngày)
          </p>
        </FormModal>
      )}
    </>
  );
}
