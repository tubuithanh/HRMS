import { useState } from 'react';
import { api } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Badge, DataTable, ErrorBox, FieldDef, FormModal } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, labels, money, options, todayISO } from '../../lib/format';
import { Advance, EmployeeElement, LaborContract, PayElement } from '../../types/models';

function SectionHeader(props: { title: string; action?: React.ReactNode }) {
  return (
    <div className="d-flex justify-content-between align-items-center mb-2">
      <h3 className="h6 mb-0">{props.title}</h3>
      {props.action}
    </div>
  );
}

export function ContractWarning({ c }: { c: Pick<LaborContract, 'warning'> }) {
  if (c.warning === 'EXPIRED') return <Badge tone="red">Đã hết hạn</Badge>;
  if (c.warning === 'EXPIRING') return <Badge tone="yellow">Sắp hết hạn</Badge>;
  return null;
}

// ================= Hợp đồng lao động =================
export function ContractsSection({ employmentId }: { employmentId: string }) {
  const { data, error, reload } = useFetch<LaborContract[]>(`/corehr/employments/${employmentId}/contracts`);
  const [dialog, setDialog] = useState<'add' | { appendix: LaborContract } | { terminate: LaborContract } | null>(null);
  const canWrite = useCanWrite('corehr');
  const done = () => {
    setDialog(null);
    reload();
  };

  const fields: FieldDef[] = [
    { name: 'contractNo', label: 'Số hợp đồng', required: true },
    { name: 'contractType', label: 'Loại hợp đồng', type: 'select', required: true, options: options(labels.contractType) },
    { name: 'signDate', label: 'Ngày ký', type: 'date', required: true },
    { name: 'startDate', label: 'Hiệu lực từ', type: 'date', required: true },
    { name: 'endDate', label: 'Đến ngày (trống nếu không xác định thời hạn)', type: 'date' },
    { name: 'salaryAmount', label: 'Mức lương trên hợp đồng', type: 'number' },
    { name: 'jobTitle', label: 'Chức danh trên hợp đồng' },
    { name: 'filePath', label: 'Link file scan' },
    { name: 'note', label: 'Ghi chú', type: 'textarea' },
  ];

  return (
    <div>
      <SectionHeader
        title="Hợp đồng lao động"
        action={canWrite && <button className="btn btn-sm btn-outline-primary" onClick={() => setDialog('add')}>+ Hợp đồng</button>}
      />
      <ErrorBox error={error} />
      <DataTable
        rows={data}
        rowKey={(c) => c.id}
        empty="Chưa có hợp đồng lao động"
        columns={[
          {
            header: 'Số HĐ',
            cell: (c) => (
              <>
                {c.parentId ? <span className="muted">↳ Phụ lục </span> : null}
                <strong>{c.contractNo}</strong>
              </>
            ),
          },
          { header: 'Loại', cell: (c) => labels.contractType[c.contractType] },
          {
            header: 'Thời hạn',
            cell: (c) => `${date(c.startDate)} → ${c.endDate ? date(c.endDate) : 'không thời hạn'}`,
            className: 'nowrap',
          },
          { header: 'Lương HĐ', cell: (c) => (c.salaryAmount ? money(c.salaryAmount) : '—'), className: 'num' },
          {
            header: 'Trạng thái',
            cell: (c) =>
              c.terminatedDate ? (
                <span title={c.terminateReason ?? ''}>
                  <Badge tone="red">Chấm dứt {date(c.terminatedDate)}</Badge>
                </span>
              ) : c.endDate && c.endDate.slice(0, 10) < todayISO() ? (
                <Badge>Hết hạn</Badge>
              ) : c.startDate.slice(0, 10) > todayISO() ? (
                <Badge tone="blue">Chưa hiệu lực</Badge>
              ) : (
                <Badge tone="green">Hiệu lực</Badge>
              ),
          },
          {
            header: '',
            className: 'actions',
            cell: (c) =>
              canWrite && (
                <span className="toolbar justify-content-end">
                  {!c.parentId && (
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ appendix: c })}>Phụ lục</button>
                  )}
                  {!c.terminatedDate && !c.parentId && (
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ terminate: c })}>Chấm dứt</button>
                  )}
                  <ActionButton
                    label="Xoá"
                    className="btn btn-sm btn-outline-danger"
                    confirm={`Xoá hợp đồng ${c.contractNo}?`}
                    run={() => api.delete(`/corehr/contracts/${c.id}`)}
                    success="Đã xoá"
                    onDone={reload}
                  />
                </span>
              ),
          },
        ]}
      />

      {dialog === 'add' && (
        <FormModal
          title="Thêm hợp đồng lao động"
          fields={fields}
          initial={{ contractType: 'FIXED_TERM', signDate: todayISO(), startDate: todayISO() }}
          path={`/corehr/employments/${employmentId}/contracts`}
          onClose={() => setDialog(null)}
          onSaved={done}
        >
          <div className="alert alert-info small">
            Theo Bộ luật Lao động 2019: HĐ xác định thời hạn tối đa 36 tháng và chỉ ký tối đa 2 lần; thử việc tối đa 180 ngày.
          </div>
        </FormModal>
      )}
      {dialog && typeof dialog === 'object' && 'appendix' in dialog && (
        <FormModal
          title={`Phụ lục cho HĐ ${dialog.appendix.contractNo}`}
          fields={fields.filter((f) => f.name !== 'contractType' && f.name !== 'endDate')}
          initial={{ signDate: todayISO(), startDate: todayISO() }}
          path={`/corehr/employments/${employmentId}/contracts`}
          transform={(b) => ({ ...b, parentId: dialog.appendix.id, contractType: dialog.appendix.contractType })}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
      {dialog && typeof dialog === 'object' && 'terminate' in dialog && (
        <FormModal
          title={`Chấm dứt HĐ ${dialog.terminate.contractNo}`}
          fields={[
            { name: 'terminatedDate', label: 'Ngày chấm dứt', type: 'date', required: true },
            { name: 'terminateReason', label: 'Lý do', type: 'textarea' },
          ]}
          initial={{ terminatedDate: todayISO() }}
          path={`/corehr/contracts/${dialog.terminate.id}/terminate`}
          submitLabel="Chấm dứt"
          onClose={() => setDialog(null)}
          onSaved={done}
        >
          <p className="muted small">Muốn ghi nhận nhân viên nghỉ việc, hãy đổi cả trạng thái hợp đồng làm việc ở nút “Trạng thái”.</p>
        </FormModal>
      )}
    </div>
  );
}

// ================= Khoản cố định (phụ cấp) =================
export function ElementsSection({ employmentId }: { employmentId: string }) {
  const { data, error, reload } = useFetch<EmployeeElement[]>(`/payroll/employments/${employmentId}/elements`);
  const catalog = useFetch<PayElement[]>('/payroll/elements');
  const [dialog, setDialog] = useState<'add' | { end: EmployeeElement } | null>(null);
  const canWrite = useCanWrite('payroll');
  const done = () => {
    setDialog(null);
    reload();
  };

  return (
    <div>
      <SectionHeader
        title="Phụ cấp / khoản cố định hàng tháng"
        action={canWrite && <button className="btn btn-sm btn-outline-primary" onClick={() => setDialog('add')}>+ Khoản cố định</button>}
      />
      <ErrorBox error={error} />
      <DataTable
        rows={data}
        rowKey={(e) => e.id}
        empty="Không có phụ cấp cố định"
        columns={[
          { header: 'Khoản', cell: (e) => <>{e.payElement.name}{e.payElement.type === 'DEDUCTION' && <> <Badge tone="red">khấu trừ</Badge></>}</> },
          { header: 'Số tiền/tháng', cell: (e) => money(e.amount), className: 'num' },
          { header: 'Theo ngày công', cell: (e) => (e.payElement.isProrated ? 'Có' : '') },
          { header: 'Tính BH', cell: (e) => (e.payElement.isInsuranceBase ? 'Có' : '') },
          { header: 'Hiệu lực', cell: (e) => `${date(e.effectiveDate)} → ${e.endDate ? date(e.endDate) : 'nay'}`, className: 'nowrap' },
          {
            header: '',
            className: 'actions',
            cell: (e) =>
              canWrite && !e.endDate && (
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ end: e })}>Kết thúc</button>
              ),
          },
        ]}
      />
      {dialog === 'add' && (
        <FormModal
          title="Thêm khoản cố định"
          fields={[
            {
              name: 'payElementId',
              label: 'Khoản lương',
              type: 'select',
              required: true,
              options: (catalog.data ?? []).filter((e) => e.isActive).map((e) => ({ value: e.id, label: `${e.name} (${labels.elementType[e.type]})` })),
            },
            { name: 'amount', label: 'Số tiền mỗi tháng', type: 'number', required: true },
            { name: 'effectiveDate', label: 'Hiệu lực từ', type: 'date', required: true },
          ]}
          initial={{ effectiveDate: todayISO() }}
          path={`/payroll/employments/${employmentId}/elements`}
          onClose={() => setDialog(null)}
          onSaved={done}
        >
          <p className="muted small">Nếu đang có cùng khoản, mức cũ tự kết thúc vào ngày trước ngày hiệu lực mới.</p>
        </FormModal>
      )}
      {dialog && typeof dialog === 'object' && (
        <FormModal
          title={`Kết thúc ${dialog.end.payElement.name}`}
          fields={[{ name: 'endDate', label: 'Ngày kết thúc', type: 'date', required: true }]}
          initial={{ endDate: todayISO() }}
          path={`/payroll/employments/${employmentId}/elements/${dialog.end.id}/end`}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
    </div>
  );
}

// ================= Tạm ứng =================
export function AdvancesSection({ employmentId }: { employmentId: string }) {
  const { data, error, reload } = useFetch<Advance[]>(`/payroll/advances/${employmentId}`);
  const [adding, setAdding] = useState(false);
  const canWrite = useCanWrite('payroll');

  return (
    <div>
      <SectionHeader
        title="Tạm ứng"
        action={canWrite && <button className="btn btn-sm btn-outline-primary" onClick={() => setAdding(true)}>+ Tạm ứng</button>}
      />
      <ErrorBox error={error} />
      <DataTable
        rows={data}
        rowKey={(a) => a.id}
        empty="Không có tạm ứng"
        columns={[
          { header: 'Ngày', cell: (a) => date(a.requestDate) },
          { header: 'Số tiền', cell: (a) => money(a.amount), className: 'num' },
          { header: 'Trả dần', cell: (a) => `${a.schedule.filter((s) => s.isDeducted).length}/${a.installments} kỳ` },
          { header: 'Mỗi kỳ', cell: (a) => money(a.schedule[0]?.amount), className: 'num' },
          { header: 'Lý do', cell: (a) => a.reason ?? '—' },
          {
            header: 'Trạng thái',
            cell: (a) => (
              <Badge tone={a.status === 'DONE' ? 'green' : a.status === 'DEDUCTING' ? 'blue' : 'yellow'}>
                {labels.advanceStatus[a.status as keyof typeof labels.advanceStatus] ?? a.status}
              </Badge>
            ),
          },
        ]}
      />
      {adding && (
        <FormModal
          title="Tạo tạm ứng"
          fields={[
            { name: 'amount', label: 'Số tiền', type: 'number', required: true },
            { name: 'installments', label: 'Trả dần trong số kỳ lương', type: 'number', required: true },
            { name: 'requestDate', label: 'Ngày tạm ứng', type: 'date', required: true },
            { name: 'reason', label: 'Lý do', type: 'textarea' },
          ]}
          initial={{ requestDate: todayISO(), installments: 1 }}
          path="/payroll/advances"
          transform={(b) => ({ ...b, employmentId })}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        >
          <p className="muted small">Mỗi kỳ lương sẽ tự trừ một phần, kỳ cuối gánh phần lẻ.</p>
        </FormModal>
      )}
    </div>
  );
}
