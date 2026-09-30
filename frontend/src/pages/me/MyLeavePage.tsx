import { useState } from 'react';
import { api } from '../../api/client';
import { ActionButton, Card, DataTable, FieldDef, FormModal, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, todayISO } from '../../lib/format';
import { LeaveBalance, LeaveRequest, LeaveType } from '../../types/models';
import { ApprovalNote, HALF_DAY_FIELD, LeaveStatusBadge, leaveRange } from '../leave/LeaveAdminPage';
import { SelfServiceError } from './MyProfilePage';

export default function MyLeavePage() {
  const year = new Date().getFullYear();
  const [creating, setCreating] = useState(false);
  const requests = useFetch<LeaveRequest[]>('/me/leave/requests');
  const balances = useFetch<LeaveBalance[]>(`/me/leave/balances?year=${year}`);
  const types = useFetch<LeaveType[]>('/me/leave/types');
  const reload = () => {
    requests.reload();
    balances.reload();
  };

  const fields: FieldDef[] = [
    { name: 'leaveTypeId', label: 'Loại nghỉ', type: 'select', required: true, options: (types.data ?? []).map((t) => ({ value: t.id, label: t.name })) },
    { name: 'fromDate', label: 'Từ ngày', type: 'date', required: true },
    { name: 'toDate', label: 'Đến ngày', type: 'date', required: true },
    { name: 'isHalfDay', label: 'Nghỉ nửa ngày', type: 'checkbox' },
    HALF_DAY_FIELD,
    { name: 'reason', label: 'Lý do', type: 'textarea' },
  ];
  const today = todayISO();

  return (
    <>
      <PageHeader
        title="Nghỉ phép"
        actions={!balances.error && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Xin nghỉ</button>}
      />
      <SelfServiceError error={balances.error} />
      {balances.data && (
        <div className="grid grid-stats" style={{ marginBottom: 16 }}>
          {balances.data
            .filter((b) => b.entitled !== null || Number(b.used) > 0 || Number(b.pending) > 0)
            .map((b) => (
              <div key={b.leaveType.id} className="card card-body stat">
                <div className="label">{b.leaveType.name} {year}</div>
                <div className="value">{b.remaining ?? b.used}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {b.entitled !== null ? `còn lại / ${b.entitled} ngày` : 'ngày đã nghỉ'} · đã nghỉ {b.used} · chờ duyệt {b.pending}
                </div>
                {b.carriedOver && (
                  <div className="small text-body-secondary">
                    + {b.carriedOver} ngày chuyển từ năm trước{b.carryExpiry && `, dùng đến ${date(b.carryExpiry)}`}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
      {!balances.error && (
        <Card title="Đơn nghỉ của tôi" flush>
          <DataTable
            rows={requests.data}
            loading={requests.loading}
            rowKey={(r) => r.id}
            empty="Bạn chưa có đơn nghỉ nào"
            columns={[
              { header: 'Loại', cell: (r) => r.leaveType.name },
              { header: 'Thời gian', cell: (r) => leaveRange(r), className: 'nowrap' },
              { header: 'Số ngày', cell: (r) => r.days, className: 'num' },
              { header: 'Lý do', cell: (r) => r.reason ?? '—' },
              { header: 'Trạng thái', cell: (r) => <><LeaveStatusBadge status={r.status} stage={r.approvalStage} /><ApprovalNote r={r} /></> },
              {
                header: '',
                className: 'actions',
                cell: (r) =>
                  (r.status === 'PENDING' || (r.status === 'APPROVED' && r.fromDate.slice(0, 10) > today)) && (
                    <ActionButton label="Huỷ đơn" confirm="Huỷ đơn nghỉ này?" run={() => api.post(`/me/leave/requests/${r.id}/cancel`)} success="Đã huỷ đơn" onDone={reload} />
                  ),
              },
            ]}
          />
        </Card>
      )}
      {creating && (
        <FormModal
          title="Xin nghỉ"
          fields={fields}
          initial={{ fromDate: today, toDate: today }}
          path="/me/leave/requests"
          successMessage="Đã gửi đơn, chờ duyệt"
          submitLabel="Gửi đơn"
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); reload(); }}
        >
          <p className="muted" style={{ marginTop: 0 }}>Số ngày nghỉ chỉ tính thứ 2 – thứ 6.</p>
        </FormModal>
      )}
    </>
  );
}
