import { useState } from 'react';
import { api } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Badge, Card, DataTable, ErrorBox, FieldDef, FormModal } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { labels, money, options } from '../../lib/format';
import { PayElement } from '../../types/models';

const editFields: FieldDef[] = [
  { name: 'name', label: 'Tên khoản', required: true },
  { name: 'taxTreatment', label: 'Thuế TNCN', type: 'select', required: true, options: options(labels.taxTreatment) },
  { name: 'taxExemptLimit', label: 'Mức miễn thuế/tháng (khi miễn một phần)', type: 'number', nullable: true },
  { name: 'isInsuranceBase', label: 'Tính vào lương đóng BH', type: 'checkbox' },
  { name: 'isProrated', label: 'Chia theo ngày công (khoản cố định)', type: 'checkbox' },
];

const createFields: FieldDef[] = [
  { name: 'code', label: 'Mã', required: true },
  { name: 'type', label: 'Loại', type: 'select', required: true, options: options(labels.elementType) },
  ...editFields,
];

/** Danh mục khoản lương: phụ cấp, thưởng, khấu trừ. */
export default function ElementsCatalog() {
  const { data, error, loading, reload } = useFetch<PayElement[]>('/payroll/elements');
  const [dialog, setDialog] = useState<'add' | PayElement | null>(null);
  const canWrite = useCanWrite('payroll');
  const done = () => {
    setDialog(null);
    reload();
  };

  return (
    <Card
      flush
      title="Danh mục khoản lương"
      actions={canWrite && <button className="btn btn-sm btn-primary" onClick={() => setDialog('add')}>+ Khoản lương</button>}
    >
      <ErrorBox error={error} />
      <DataTable
        rows={data}
        loading={loading}
        rowKey={(e) => e.id}
        columns={[
          { header: 'Mã', cell: (e) => <code>{e.code}</code> },
          { header: 'Tên', cell: (e) => e.name },
          { header: 'Loại', cell: (e) => <Badge tone={e.type === 'EARNING' ? 'green' : 'red'}>{labels.elementType[e.type]}</Badge> },
          {
            header: 'Thuế TNCN',
            cell: (e) =>
              e.taxTreatment === 'PARTIAL_EXEMPT' ? `Miễn đến ${money(e.taxExemptLimit)}` : labels.taxTreatment[e.taxTreatment],
          },
          { header: 'Tính BH', cell: (e) => (e.isInsuranceBase ? 'Có' : '') },
          { header: 'Theo công', cell: (e) => (e.isProrated ? 'Có' : '') },
          { header: 'Trạng thái', cell: (e) => (e.isActive ? <Badge tone="green">Đang dùng</Badge> : <Badge>Ngừng</Badge>) },
          {
            header: '',
            className: 'actions',
            cell: (e) =>
              canWrite && (
                <span className="toolbar justify-content-end">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog(e)}>Sửa</button>
                  <ActionButton
                    label={e.isActive ? 'Ngừng dùng' : 'Dùng lại'}
                    run={() => api.patch(`/payroll/elements/${e.id}`, { isActive: !e.isActive })}
                    onDone={reload}
                  />
                </span>
              ),
          },
        ]}
      />
      <div className="card-body small muted border-top">
        “Theo công”: khoản cố định được nhân với công hưởng lương / công chuẩn. Khoản phát sinh trong kỳ (thưởng, phạt…) luôn giữ nguyên số tiền.
      </div>
      {dialog === 'add' && (
        <FormModal
          title="Thêm khoản lương"
          fields={createFields}
          initial={{ type: 'EARNING', taxTreatment: 'TAXABLE', isProrated: true }}
          path="/payroll/elements"
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
      {dialog && dialog !== 'add' && (
        <FormModal title={`Sửa ${dialog.name}`} fields={editFields} initial={dialog} method="patch" path={`/payroll/elements/${dialog.id}`} onClose={() => setDialog(null)} onSaved={done} />
      )}
    </Card>
  );
}
