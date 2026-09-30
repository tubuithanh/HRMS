import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, DataTable, ErrorBox, FieldDef, FormModal, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, labels, options, todayISO } from '../../lib/format';
import { JobOpening, OrgUnit } from '../../types/models';

export function OpeningStatusBadge({ status }: { status: JobOpening['status'] }) {
  const tone = { DRAFT: undefined, OPEN: 'green', CLOSED: 'red' } as const;
  return <Badge tone={tone[status]}>{labels.openingStatus[status]}</Badge>;
}

export function openingFields(org: OrgUnit[], forEdit = false): FieldDef[] {
  return [
    ...(forEdit ? [] : [{ name: 'code', label: 'Mã tin', required: true } as FieldDef]),
    { name: 'title', label: 'Vị trí tuyển', required: true },
    { name: 'orgStructureId', label: 'Phòng ban', type: 'select', options: org.map((o) => ({ value: o.id, label: o.name })), nullable: forEdit },
    { name: 'quantity', label: 'Số lượng', type: 'number' },
    { name: 'status', label: 'Trạng thái', type: 'select', options: options(labels.openingStatus) },
    ...(forEdit ? [] : [{ name: 'openDate', label: 'Ngày mở', type: 'date', required: true } as FieldDef]),
    { name: 'closeDate', label: 'Hạn nộp', type: 'date', nullable: forEdit },
    { name: 'description', label: 'Mô tả công việc', type: 'textarea', nullable: forEdit },
  ];
}

export default function RecruitmentPage() {
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useFetch<JobOpening[]>('/recruitment/openings');
  const org = useFetch<OrgUnit[]>('/corehr/org');

  return (
    <>
      <PageHeader
        title="Tuyển dụng"
        subtitle="Tin tuyển dụng và hồ sơ ứng viên"
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}>+ Tin tuyển dụng</button>}
      />
      <Card flush>
        <ErrorBox error={error} />
        <DataTable
          rows={data}
          loading={loading}
          rowKey={(o) => o.id}
          empty="Chưa có tin tuyển dụng nào"
          columns={[
            { header: 'Vị trí', cell: (o) => <><Link to={`/recruitment/${o.id}`}>{o.title}</Link><div className="muted">{o.code}</div></> },
            { header: 'Phòng ban', cell: (o) => o.orgStructure?.name ?? '—' },
            { header: 'Cần tuyển', cell: (o) => o.quantity, className: 'num' },
            { header: 'Đã nhận', cell: (o) => o.stageCounts.HIRED ?? 0, className: 'num' },
            { header: 'Hồ sơ', cell: (o) => o.applicationCount, className: 'num' },
            { header: 'Phỏng vấn', cell: (o) => o.stageCounts.INTERVIEW ?? 0, className: 'num' },
            { header: 'Hạn nộp', cell: (o) => date(o.closeDate), className: 'nowrap' },
            { header: 'Trạng thái', cell: (o) => <OpeningStatusBadge status={o.status} /> },
          ]}
        />
      </Card>
      {creating && (
        <FormModal
          title="Tạo tin tuyển dụng"
          fields={openingFields(org.data ?? [])}
          initial={{ openDate: todayISO(), status: 'OPEN', quantity: 1 }}
          path="/recruitment/openings"
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); reload(); }}
        />
      )}
    </>
  );
}
