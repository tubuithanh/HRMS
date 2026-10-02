import { useState } from 'react';
import { api } from '../../api/client';
import { ActionButton, Card, DataTable, FormModal, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, todayISO } from '../../lib/format';
import { OvertimeRequest } from '../../types/models';
import { OvertimeHint, OvertimeStatusBadge, otKind, useOvertimeRules } from '../attendance/OvertimeAdminPage';
import { ApprovalNote } from '../leave/LeaveAdminPage';
import { SelfServiceError } from './MyProfilePage';
import OvertimeSuggestions from '../../components/OvertimeSuggestions';

export default function MyOvertimePage() {
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useFetch<OvertimeRequest[]>('/me/overtime');
  const rules = useOvertimeRules();
  const month = todayISO().slice(0, 7);
  const monthHours = (data ?? [])
    .filter((o) => o.workDate.startsWith(month) && (o.status === 'APPROVED' || o.status === 'PENDING'))
    .reduce((s, o) => s + Number(o.hours), 0);

  return (
    <>
      <PageHeader
        title="Làm thêm giờ"
        subtitle={`Tháng này: ${monthHours}/${rules?.monthlyLimitHours ?? 40} giờ (đã duyệt + chờ duyệt)`}
        actions={!error && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Đăng ký làm thêm</button>}
      />
      <SelfServiceError error={error} />
      {!error && (
        <Card flush>
          <DataTable
            rows={data}
            loading={loading}
            rowKey={(o) => o.id}
            empty="Bạn chưa có đơn làm thêm giờ nào"
            columns={[
              { header: 'Ngày', cell: (o) => date(o.workDate), className: 'nowrap' },
              { header: 'Loại', cell: (o) => otKind(o) },
              { header: 'Giờ', cell: (o) => Number(o.hours), className: 'num' },
              { header: 'Nội dung', cell: (o) => o.reason ?? '—' },
              { header: 'Trạng thái', cell: (o) => <><OvertimeStatusBadge status={o.status} stage={o.approvalStage} /><ApprovalNote r={o} /></> },
              {
                header: '',
                className: 'actions',
                cell: (o) =>
                  o.status === 'PENDING' && (
                    <ActionButton label="Huỷ" confirm="Huỷ đơn này?" run={() => api.post(`/me/overtime/${o.id}/cancel`)} success="Đã huỷ" onDone={reload} />
                  ),
              },
            ]}
          />
        </Card>
      )}
      {!error && (
        <Card flush title="Gợi ý từ dữ liệu chấm công tháng này">
          <OvertimeSuggestions month={month} mode="me" onCreated={reload} />
        </Card>
      )}
      {creating && (
        <FormModal
          title="Đăng ký làm thêm giờ"
          fields={[
            { name: 'workDate', label: 'Ngày làm thêm', type: 'date', required: true },
            { name: 'hours', label: 'Số giờ', type: 'number', required: true },
            { name: 'isNight', label: 'Làm ban đêm (22h – 6h)', type: 'checkbox' },
            { name: 'reason', label: 'Nội dung công việc', type: 'textarea', required: true },
          ]}
          initial={{ workDate: todayISO(), hours: 2 }}
          path="/me/overtime"
          submitLabel="Gửi đơn"
          successMessage="Đã gửi đơn, chờ duyệt"
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); reload(); }}
        >
          <OvertimeHint />
        </FormModal>
      )}
    </>
  );
}
