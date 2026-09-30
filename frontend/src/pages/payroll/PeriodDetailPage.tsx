import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Badge, Card, DataTable, ErrorBox, FieldDef, FormModal, Loading, PageHeader } from '../../components/ui';
import { downloadFile, useFetch } from '../../lib/hooks';
import { date, labels, money, sumMoney } from '../../lib/format';
import { Employment, PayElement, PayPeriod, PayrollResult, PeriodElement } from '../../types/models';
import { PeriodStatus } from './PayrollPage';
import PayslipView from '../../components/PayslipView';

type PeriodWithResults = PayPeriod & { results: PayrollResult[] };

interface RunResult {
  total: number;
  success: number;
  errorCount: number;
  errors: Array<{ employmentId: string; message: string }>;
  warnings: Array<{ employmentId: string; message: string }>;
  standardDays: number;
}

/** Khoản phát sinh trong kỳ: thưởng, phạt, truy lĩnh... */
function PeriodElementsCard(props: { periodId: string; locked: boolean; canWrite: boolean; employments: Employment[] }) {
  const { data, error, reload } = useFetch<PeriodElement[]>(`/payroll/periods/${props.periodId}/elements`);
  const catalog = useFetch<PayElement[]>('/payroll/elements');
  const [adding, setAdding] = useState(false);
  const editable = props.canWrite && !props.locked;

  const fields: FieldDef[] = [
    {
      name: 'employmentId',
      label: 'Nhân viên',
      type: 'select',
      required: true,
      options: props.employments
        .filter((e) => e.status !== 'TERMINATED' || e.dateTerminate)
        .map((e) => ({ value: e.id, label: `${e.codeEmp} · ${e.person?.fullName}` })),
    },
    {
      name: 'payElementId',
      label: 'Khoản',
      type: 'select',
      required: true,
      options: (catalog.data ?? []).filter((e) => e.isActive).map((e) => ({ value: e.id, label: `${e.name} (${labels.elementType[e.type]})` })),
    },
    { name: 'amount', label: 'Số tiền', type: 'number', required: true },
    { name: 'note', label: 'Ghi chú' },
  ];

  return (
    <Card
      flush
      title="Khoản phát sinh trong kỳ"
      actions={editable && <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>+ Thưởng / phạt</button>}
    >
      <ErrorBox error={error} />
      <DataTable
        rows={data}
        rowKey={(e) => e.id}
        empty="Không có khoản phát sinh"
        columns={[
          { header: 'Nhân viên', cell: (e) => `${e.employment.codeEmp} · ${e.employment.person.fullName}` },
          { header: 'Khoản', cell: (e) => <>{e.payElement.name} <Badge tone={e.payElement.type === 'EARNING' ? 'green' : 'red'}>{labels.elementType[e.payElement.type]}</Badge></> },
          { header: 'Số tiền', cell: (e) => money(e.amount), className: 'num' },
          { header: 'Ghi chú', cell: (e) => e.note ?? '' },
          {
            header: '',
            className: 'actions',
            cell: (e) =>
              editable && (
                <ActionButton
                  label="Xoá"
                  className="btn btn-sm btn-outline-danger"
                  run={() => api.delete(`/payroll/periods/${props.periodId}/elements/${e.id}`)}
                  onDone={reload}
                />
              ),
          },
        ]}
      />
      {adding && (
        <FormModal
          title="Thêm khoản phát sinh"
          fields={fields}
          path={`/payroll/periods/${props.periodId}/elements`}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </Card>
  );
}

export default function PeriodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error, loading, reload } = useFetch<PeriodWithResults>(`/payroll/periods/${id}/results`);
  const [region, setRegion] = useState('1');
  const pub = useFetch<{ payroll: { defaultRegion: number } }>('/settings/public');
  useEffect(() => {
    if (pub.data) setRegion(String(pub.data.payroll.defaultRegion));
  }, [pub.data]);
  const [run, setRun] = useState<RunResult | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const canWrite = useCanWrite('payroll');
  const employments = useFetch<Employment[]>('/corehr/employments');
  const nameOf = (employmentId: string) => {
    const e = employments.data?.find((x) => x.id === employmentId);
    return e ? `${e.codeEmp} · ${e.person?.fullName}` : employmentId.slice(0, 8);
  };

  if (loading && !p) return <Loading />;
  if (error || !p) return <ErrorBox error={error ?? 'Không tìm thấy'} />;

  const locked = p.status === 'LOCKED' || p.status === 'PAID';
  const sum = (k: 'grossIncome' | 'pitAmount' | 'netPay' | 'companyInsurance' | 'otherDeductions') => sumMoney(p.results.map((r) => r[k]));

  return (
    <>
      <div className="muted" style={{ marginBottom: 6 }}>
        <Link to="/payroll">← Tính lương</Link>
      </div>
      <PageHeader
        title={`Kỳ lương ${p.code}`}
        subtitle={<>{date(p.dateStart)} – {date(p.dateEnd)} · <PeriodStatus status={p.status} /></>}
        actions={
          <>
            {p.results.length > 0 && (
              <ActionButton label="Tải Excel" className="btn btn-outline-secondary" run={() => downloadFile(`/payroll/periods/${p.id}/report`, `bang-luong-${p.code}.xlsx`)} />
            )}
            {canWrite && !locked && (
              <>
                <select className="form-select" style={{ width: 'auto' }} value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Vùng lương tối thiểu">
                  {[1, 2, 3, 4].map((r) => <option key={r} value={r}>Vùng {r}</option>)}
                </select>
                <ActionButton
                  label={p.results.length ? 'Tính lại' : 'Chạy tính lương'}
                  className="btn btn-primary"
                  run={async () => {
                    const res = await api.post('/payroll/run', { payPeriodId: p.id, region: Number(region) });
                    setRun(res.data.data);
                  }}
                  success="Đã tính lương"
                  onDone={reload}
                />
                {p.status === 'CALCULATED' && (
                  <ActionButton
                    label="Khoá kỳ"
                    className="btn btn-outline-secondary"
                    confirm="Khoá kỳ lương? Sau khi khoá không tính lại được, nhân viên sẽ xem được phiếu lương."
                    run={() => api.post(`/payroll/periods/${p.id}/lock`)}
                    success="Đã khoá kỳ lương"
                    onDone={reload}
                  />
                )}
              </>
            )}
          </>
        }
      />
      {run && (
        <div className={`alert ${run.errorCount ? 'alert-danger' : 'alert-success'}`}>
          Công chuẩn kỳ này: {run.standardDays} ngày. Tính {run.success}/{run.total} nhân viên.
          {run.errorCount > 0 && (
            <ul className="mb-0 mt-1">
              {run.errors.map((e) => <li key={e.employmentId}>{nameOf(e.employmentId)}: {e.message}</li>)}
            </ul>
          )}
        </div>
      )}
      {run && run.warnings.length > 0 && (
        <div className="alert alert-warning">
          <ul className="mb-0">
            {run.warnings.map((w) => <li key={w.employmentId}>{nameOf(w.employmentId)}: {w.message}</li>)}
          </ul>
        </div>
      )}
      <Card flush title="Bảng lương">
        <DataTable
          rows={p.results}
          rowKey={(r) => r.id}
          empty="Chưa tính lương cho kỳ này"
          columns={[
            { header: 'Mã NV', cell: (r) => r.employment.codeEmp },
            { header: 'Họ tên', cell: (r) => r.employment.person.fullName },
            {
              header: 'Công',
              cell: (r) => (r.paidDays !== null ? `${Number(r.paidDays)}/${r.standardDays}` : '—'),
              className: 'num',
            },
            { header: 'Gross', cell: (r) => money(r.grossIncome), className: 'num' },
            { header: 'BH (NLĐ)', cell: (r) => money(r.empInsurance), className: 'num' },
            { header: 'Người PT', cell: (r) => r.dependantCount, className: 'num' },
            { header: 'Thuế TNCN', cell: (r) => money(r.pitAmount), className: 'num' },
            {
              header: 'Khấu trừ khác',
              cell: (r) => (
                <span title={Number(r.deferredDeduction) > 0 ? `Còn ${money(r.deferredDeduction)} vượt trần 30%` : undefined}>
                  {money(r.otherDeductions)}
                  {Number(r.deferredDeduction) > 0 && <span className="text-warning"> *</span>}
                </span>
              ),
              className: 'num',
            },
            { header: 'Thực nhận', cell: (r) => <strong>{money(r.netPay)}</strong>, className: 'num' },
            { header: 'BH (Cty)', cell: (r) => money(r.companyInsurance), className: 'num' },
            {
              header: '',
              className: 'actions',
              cell: (r) => (
                <span className="toolbar justify-content-end">
                  <button className="btn btn-sm btn-outline-primary" onClick={() => setViewing(r.id)}>Phiếu</button>
                  <ActionButton label="PDF" run={() => downloadFile(`/payroll/results/${r.id}/payslip.pdf`, `payslip-${r.employment.codeEmp}.pdf`)} />
                </span>
              ),
            },
          ]}
        />
        {p.results.length > 0 && (
          <div className="card-body border-top">
            <strong>Tổng:</strong> Gross {money(sum('grossIncome'))} · Thuế {money(sum('pitAmount'))} · Khấu trừ khác{' '}
            {money(sum('otherDeductions'))} · Thực nhận <strong>{money(sum('netPay'))}</strong> · BH công ty{' '}
            {money(sum('companyInsurance'))}
          </div>
        )}
      </Card>

      {viewing && <PayslipView path={`/payroll/results/${viewing}/payslip`} pdfPath={`/payroll/results/${viewing}/payslip.pdf`} onClose={() => setViewing(null)} />}

      <PeriodElementsCard periodId={p.id} locked={locked} canWrite={canWrite} employments={employments.data ?? []} />

      <p className="muted small">
        Cách tính: lương cơ bản và phụ cấp “theo công” × công hưởng lương / công chuẩn (công hưởng lương = công chuẩn trong
        thời gian làm việc − nghỉ không lương − vắng). Bảo hiểm tính trên lương đóng BH + phụ cấp tính BH, không đóng nếu
        không làm việc từ 14 ngày trở lên. Tạm ứng tự trừ mỗi kỳ một phần. Sau khi thêm khoản phát sinh hoặc sửa bảng
        công, bấm “Tính lại”.
      </p>
    </>
  );
}
