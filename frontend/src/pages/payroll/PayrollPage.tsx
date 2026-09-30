import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useCanWrite } from '../../auth';
import { Badge, Card, DataTable, ErrorBox, FieldDef, FormModal, PageHeader, Tabs } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, labels, money } from '../../lib/format';
import { PayPeriod } from '../../types/models';
import ElementsCatalog from './ElementsCatalog';

export function PeriodStatus({ status }: { status: string }) {
  const tone = status === 'LOCKED' || status === 'PAID' ? 'green' : status === 'CALCULATED' ? 'blue' : 'yellow';
  return <Badge tone={tone}>{labels.periodStatus[status as keyof typeof labels.periodStatus] ?? status}</Badge>;
}

function monthDefaults(payDay = 5) {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(y, m, 0).getDate();
  const next = new Date(y, m, payDay);
  return {
    code: `${y}-${pad(m)}`,
    dateStart: `${y}-${pad(m)}-01`,
    dateEnd: `${y}-${pad(m)}-${last}`,
    payDate: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
  };
}

const periodFields: FieldDef[] = [
  { name: 'code', label: 'Mã kỳ', required: true, placeholder: '2026-09' },
  { name: 'dateStart', label: 'Từ ngày', type: 'date', required: true },
  { name: 'dateEnd', label: 'Đến ngày', type: 'date', required: true },
  { name: 'payDate', label: 'Ngày trả lương', type: 'date' },
];

/** Form nhỏ gọi một API tính toán và hiện kết quả. */
function Calculator(props: {
  title: string;
  path: string;
  fields: Array<{ name: string; label: string; def?: string; type?: 'number' | 'checkbox' }>;
  render: (r: Record<string, string>) => React.ReactNode;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(
    Object.fromEntries(props.fields.map((f) => [f.name, f.type === 'checkbox' ? false : (f.def ?? '')])),
  );
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body = Object.fromEntries(
        props.fields
          .filter((f) => values[f.name] !== '')
          .map((f) => [f.name, f.type === 'checkbox' ? values[f.name] : Number(values[f.name])]),
      );
      const res = await api.post(props.path, body);
      setResult(res.data.data);
    } catch (err) {
      setError(errorMessage(err));
      setResult(null);
    }
  }

  return (
    <Card title={props.title}>
      <form onSubmit={submit} className="stack">
        <div className="row g-3">
          {props.fields.map((f) =>
            f.type === 'checkbox' ? (
              <label key={f.name} className="col-md-6 d-flex gap-2 align-items-center">
                <input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))} />
                {f.label}
              </label>
            ) : (
              <label key={f.name} className="col-md-6 d-block">
                <span className="form-label d-block">{f.label}</span>
                <input className="form-control" type="number" step="any" value={String(values[f.name])} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
              </label>
            ),
          )}
        </div>
        <div><button className="btn btn-primary">Tính</button></div>
        <ErrorBox error={error} />
        {result && <div className="alert alert-info" style={{ margin: 0 }}>{props.render(result)}</div>}
      </form>
    </Card>
  );
}

export default function PayrollPage() {
  const [tab, setTab] = useState<'periods' | 'elements' | 'tools'>('periods');
  const [creating, setCreating] = useState(false);
  const canWrite = useCanWrite('payroll');
  const { data, error, loading, reload } = useFetch<PayPeriod[]>('/payroll/periods');
  const pub = useFetch<{ payroll: { payDay: number } }>('/settings/public');

  return (
    <>
      <PageHeader
        title="Tính lương"
        actions={canWrite && tab === 'periods' && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Kỳ lương</button>}
      />
      <Tabs
        tabs={[
          { key: 'periods', label: 'Kỳ lương' },
          { key: 'elements', label: 'Khoản lương' },
          { key: 'tools', label: 'Công cụ tính' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'periods' && (
        <Card flush>
          <ErrorBox error={error} />
          <DataTable
            rows={data}
            loading={loading}
            rowKey={(p) => p.id}
            empty="Chưa có kỳ lương nào"
            columns={[
              { header: 'Kỳ', cell: (p) => <Link to={`/payroll/${p.id}`}>{p.code}</Link> },
              { header: 'Từ ngày', cell: (p) => date(p.dateStart) },
              { header: 'Đến ngày', cell: (p) => date(p.dateEnd) },
              { header: 'Ngày trả', cell: (p) => date(p.payDate) },
              { header: 'Trạng thái', cell: (p) => <PeriodStatus status={p.status} /> },
            ]}
          />
        </Card>
      )}
      {tab === 'elements' && <ElementsCatalog />}
      {tab === 'tools' && (
        <div className="grid grid-2">
          <Calculator
            title="Quy đổi Net → Gross"
            path="/payroll/net-to-gross"
            fields={[
              { name: 'targetNet', label: 'Lương Net mong muốn', def: '20000000' },
              { name: 'region', label: 'Vùng (1–4)', def: '1' },
              { name: 'dependantCount', label: 'Số người phụ thuộc', def: '0' },
              { name: 'fixedInsuranceSalary', label: 'Lương đóng BH cố định (tuỳ chọn)' },
            ]}
            render={(r) => <>Gross cần trả: <strong>{money(r.gross)}</strong> (Net đạt được {money(r.achievedNet)})</>}
          />
          <Calculator
            title="Lương tháng 13"
            path="/payroll/thirteenth-month"
            fields={[
              { name: 'monthlySalary', label: 'Lương tháng', def: '15000000' },
              { name: 'monthsWorked', label: 'Số tháng làm việc trong năm', def: '12' },
            ]}
            render={(r) => <>Lương tháng 13: <strong>{money(r.amount)}</strong></>}
          />
          <Calculator
            title="Quyết toán khi nghỉ việc"
            path="/payroll/final-settlement"
            fields={[
              { name: 'totalWorkedMonths', label: 'Tổng số tháng làm việc', def: '36' },
              { name: 'unemploymentInsuredMonths', label: 'Số tháng đã đóng BHTN', def: '36' },
              { name: 'avgSalary6Months', label: 'Lương bình quân 6 tháng', def: '15000000' },
              { name: 'unusedLeaveDays', label: 'Số ngày phép chưa nghỉ', def: '0' },
              { name: 'isRedundancy', label: 'Mất việc làm (trợ cấp mất việc)', type: 'checkbox' },
            ]}
            render={(r) => (
              <>
                Trợ cấp: {money(r.severanceAmount)} ({r.severanceYears} năm) · Tiền phép: {money(r.unusedLeaveAmount)} ·{' '}
                <strong>Tổng: {money(r.total)}</strong>
              </>
            )}
          />
        </div>
      )}
      {creating && (
        <FormModal title="Tạo kỳ lương" fields={periodFields} initial={monthDefaults(pub.data?.payroll.payDay)} path="/payroll/periods" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      )}
    </>
  );
}
