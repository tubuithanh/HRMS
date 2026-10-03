import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Card, DataTable, ErrorBox, Loading, Modal, PageHeader, Tabs, useToast } from '../../components/ui';
import { downloadFile, useFetch } from '../../lib/hooks';
import { currentMonth, labels, money } from '../../lib/format';

type Tab = 'bhxh' | 'pit' | 'qtt' | 'cert' | 'bank';

function Warnings({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="alert alert-warning small py-2">
      {items.map((w) => (
        <div key={w}><i className="bi bi-exclamation-triangle me-1" />{w}</div>
      ))}
    </div>
  );
}

function DownloadButton({ path, name, label = 'Tải Excel', icon = 'bi-file-earmark-excel' }: { path: string; name: string; label?: string; icon?: string }) {
  return (
    <ActionButton
      className="btn btn-success text-nowrap"
      label={<><i className={`bi ${icon} me-1`} />{label}</>}
      run={() => downloadFile(path, name)}
    />
  );
}

/** Tháng trước tháng hiện tại — kỳ thường phải nộp báo cáo. */
function lastMonth() {
  const [y, m] = currentMonth().split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ---------------- BHXH: D02-LT ----------------
interface InsChange {
  employmentId: string;
  kind: 'INCREASE' | 'DECREASE' | 'ADJUST_UP' | 'ADJUST_DOWN';
  codeEmp: string;
  fullName: string;
  socialInsNo: string | null;
  jobTitle: string | null;
  department: string | null;
  oldBase: number;
  newBase: number;
  reason: string;
}
const KIND: Record<InsChange['kind'], [string, string]> = {
  INCREASE: ['Tăng', 'text-bg-success'],
  ADJUST_UP: ['Điều chỉnh tăng', 'text-bg-info'],
  DECREASE: ['Giảm', 'text-bg-danger'],
  ADJUST_DOWN: ['Điều chỉnh giảm', 'text-bg-warning'],
};

function InsuranceTab() {
  const [month, setMonth] = useState(lastMonth());
  const { data, error, loading } = useFetch<{ changes: InsChange[]; totals: { increase: number; decrease: number; adjust: number }; warnings: string[] }>(
    `/reports/insurance-changes?month=${month}`,
    [month],
  );
  return (
    <Card
      title="Lao động tăng / giảm / điều chỉnh mức đóng BHXH (mẫu D02-LT)"
      actions={
        <div className="d-flex gap-2">
          <input type="month" className="form-control form-control-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
          <DownloadButton path={`/reports/insurance-changes?month=${month}&format=xlsx`} name={`D02-LT-${month}.xlsx`} />
        </div>
      }
    >
      <p className="small text-body-secondary">
        So sánh tiền lương đóng BH của kỳ lương tháng {month} với tháng trước. Cần chạy lương cả hai tháng trước khi lập.
      </p>
      <ErrorBox error={error} />
      {loading && <Loading />}
      {data && !error && (
        <>
          <Warnings items={data.warnings} />
          <div className="d-flex gap-3 mb-2 small">
            <span>Tăng: <strong>{data.totals.increase}</strong></span>
            <span>Giảm: <strong>{data.totals.decrease}</strong></span>
            <span>Điều chỉnh: <strong>{data.totals.adjust}</strong></span>
          </div>
          <DataTable
            rows={data.changes}
            rowKey={(r) => r.employmentId}
            empty="Không có biến động trong tháng"
            columns={[
              { header: 'Loại', cell: (r) => <span className={`badge ${KIND[r.kind][1]}`}>{KIND[r.kind][0]}</span> },
              { header: 'Mã NV', cell: (r) => r.codeEmp },
              { header: 'Họ tên', cell: (r) => r.fullName },
              { header: 'Mã BHXH', cell: (r) => r.socialInsNo ?? <span className="text-danger">thiếu</span> },
              { header: 'Chức danh', cell: (r) => r.jobTitle ?? '—' },
              { header: 'Lương cũ', cell: (r) => (r.oldBase ? money(r.oldBase) : '—'), className: 'num' },
              { header: 'Lương mới', cell: (r) => (r.newBase ? money(r.newBase) : '—'), className: 'num' },
              { header: 'Ghi chú', cell: (r) => r.reason },
            ]}
          />
        </>
      )}
    </Card>
  );
}

// ---------------- Thuế: 05/KK ----------------
const PIT_LINES: Array<[string, string, string]> = [
  ['21', 'Tổng số người lao động', 'n'],
  ['22', '— Cá nhân cư trú có hợp đồng lao động', 'n'],
  ['23', 'Tổng số cá nhân đã khấu trừ thuế', 'n'],
  ['24', '— Cá nhân cư trú', 'n'],
  ['25', '— Cá nhân không cư trú', 'n'],
  ['26', 'Tổng thu nhập chịu thuế trả cho cá nhân', 'm'],
  ['27', '— Cá nhân cư trú', 'm'],
  ['28', '— Cá nhân không cư trú', 'm'],
  ['29', 'TNCT được miễn theo Hiệp định', 'm'],
  ['30', 'Tổng TNCT trả cho cá nhân thuộc diện khấu trừ', 'm'],
  ['31', '— Cá nhân cư trú', 'm'],
  ['32', '— Cá nhân không cư trú', 'm'],
  ['33', 'Tổng số thuế TNCN đã khấu trừ', 'm'],
  ['34', '— Cá nhân cư trú', 'm'],
  ['35', '— Cá nhân không cư trú', 'm'],
];

function PitTab() {
  const [mode, setMode] = useState<'month' | 'quarter'>('month');
  const [month, setMonth] = useState(lastMonth());
  const [year, setYear] = useState(Number(lastMonth().slice(0, 4)));
  const [q, setQ] = useState(Math.ceil(Number(lastMonth().slice(5)) / 3));
  const period = mode === 'month' ? month : `${year}-Q${q}`;
  const { data, error, loading } = useFetch<{ label: string; periods: string[]; indicators: Record<string, number>; warnings: string[] }>(
    `/reports/pit-declaration?period=${period}`,
    [period],
  );
  return (
    <Card
      title="Tờ khai khấu trừ thuế TNCN (mẫu 05/KK-TNCN)"
      actions={
        <div className="d-flex gap-2 align-items-center">
          <select className="form-select form-select-sm" value={mode} onChange={(e) => setMode(e.target.value as 'month' | 'quarter')}>
            <option value="month">Theo tháng</option>
            <option value="quarter">Theo quý</option>
          </select>
          {mode === 'month' ? (
            <input type="month" className="form-control form-control-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
          ) : (
            <>
              <select className="form-select form-select-sm" value={q} onChange={(e) => setQ(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Quý {n}</option>)}
              </select>
              <input type="number" className="form-control form-control-sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </>
          )}
          <DownloadButton path={`/reports/pit-declaration?period=${period}&format=xlsx`} name={`05-KK-TNCN-${period}.xlsx`} />
        </div>
      }
    >
      <ErrorBox error={error} />
      {loading && <Loading />}
      {data && !error && (
        <>
          <p className="small text-body-secondary">Kỳ tính thuế: {data.label} · kỳ lương: {data.periods.join(', ')}</p>
          <Warnings items={data.warnings} />
          <table className="table table-sm">
            <thead><tr><th style={{ width: 70 }}>Mã</th><th>Chỉ tiêu</th><th className="num">Giá trị</th></tr></thead>
            <tbody>
              {PIT_LINES.map(([code, label, kind]) => (
                <tr key={code} className={label.startsWith('—') ? '' : 'fw-semibold'}>
                  <td>[{code}]</td>
                  <td>{label}</td>
                  <td className="num">{kind === 'n' ? data.indicators[`c${code}`] : money(data.indicators[`c${code}`])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

// ---------------- Thuế: quyết toán năm ----------------
interface Resident {
  employmentId: string;
  codeEmp: string;
  fullName: string;
  taxCode: string | null;
  canAuthorize: boolean;
  monthsPaid: number;
  taxableIncome: number;
  assessableIncome: number;
  taxDue: number;
  taxWithheld: number;
  difference: number;
}

function AnnualTab() {
  const [year, setYear] = useState(Number(lastMonth().slice(0, 4)));
  const { data, error, loading } = useFetch<{
    residents: Resident[];
    others: Array<{ employmentId: string }>;
    totals: { taxableIncome: number; taxDue: number; taxWithheld: number; payable: number; refundable: number };
    warnings: string[];
  }>(`/reports/pit-annual?year=${year}`, [year]);
  return (
    <Card
      title="Quyết toán thuế TNCN năm (05/QTT-TNCN, phụ lục 05-1, 05-2)"
      actions={
        <div className="d-flex gap-2">
          <input type="number" className="form-control form-control-sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))} />
          <DownloadButton path={`/reports/pit-annual?year=${year}&format=xlsx`} name={`QTT-TNCN-${year}.xlsx`} />
        </div>
      }
    >
      <ErrorBox error={error} />
      {loading && <Loading />}
      {data && !error && (
        <>
          <Warnings items={data.warnings} />
          <div className="row g-2 mb-3">
            {([
              ['Tổng TNCT', data.totals.taxableIncome],
              ['Thuế phải nộp (cư trú)', data.totals.taxDue],
              ['Thuế đã khấu trừ', data.totals.taxWithheld],
              ['Còn phải nộp', data.totals.payable],
              ['Nộp thừa (hoàn / bù trừ)', data.totals.refundable],
            ] as Array<[string, number]>).map(([label, v]) => (
              <div key={label} className="col-6 col-md">
                <div className="card card-body py-2">
                  <div className="small text-body-secondary">{label}</div>
                  <div className="fw-semibold">{money(v)}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="small text-body-secondary mb-2">
            {data.residents.length} người tính theo biểu lũy tiến · {data.others.length} người khấu trừ theo thuế suất toàn phần (xem file Excel).
          </p>
          <DataTable
            rows={data.residents}
            rowKey={(r) => r.employmentId}
            empty="Không có dữ liệu"
            columns={[
              { header: 'Mã NV', cell: (r) => r.codeEmp },
              { header: 'Họ tên', cell: (r) => r.fullName },
              { header: 'MST', cell: (r) => r.taxCode ?? <span className="text-danger">thiếu</span> },
              { header: 'Ủy quyền', cell: (r) => (r.canAuthorize ? <i className="bi bi-check-lg text-success" /> : <span className="small text-body-secondary">đã nghỉ</span>) },
              { header: 'Số kỳ', cell: (r) => r.monthsPaid, className: 'num' },
              { header: 'TNCT', cell: (r) => money(r.taxableIncome), className: 'num' },
              { header: 'TN tính thuế', cell: (r) => money(r.assessableIncome), className: 'num' },
              { header: 'Thuế phải nộp', cell: (r) => money(r.taxDue), className: 'num' },
              { header: 'Đã khấu trừ', cell: (r) => money(r.taxWithheld), className: 'num' },
              {
                header: 'Chênh lệch',
                cell: (r) => <span className={r.difference > 0 ? 'text-danger' : r.difference < 0 ? 'text-success' : ''}>{money(r.difference)}</span>,
                className: 'num',
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}

// ---------------- Chuyển lương ----------------
interface BankRow {
  codeEmp: string;
  fullName: string;
  beneficiary: string;
  accountNo: string | null;
  bank: string | null;
  branch: string | null;
  amount: number;
}

function BankTab() {
  const periods = useFetch<Array<{ id: string; code: string; status: string }>>('/payroll/periods');
  const [periodId, setPeriodId] = useState('');
  const [source, setSource] = useState('VCB');
  const templates = useFetch<BankTemplate[]>('/reports/bank-templates');
  const [templateId, setTemplateId] = useState('');
  const [editingTemplates, setEditingTemplates] = useState(false);
  const canWrite = useCanWrite('reports');
  const template = templates.data?.find((t) => t.id === templateId) ?? templates.data?.[0];
  useEffect(() => {
    if (!periodId && periods.data?.length) {
      const sorted = [...periods.data].sort((a, b) => (a.code < b.code ? 1 : -1));
      setPeriodId((sorted.find((p) => p.status === 'LOCKED' || p.status === 'PAID') ?? sorted[0]).id);
    }
  }, [periods.data, periodId]);
  const { data, error, loading } = useFetch<{
    period: { code: string };
    content: string;
    sameBank: BankRow[];
    otherBank: BankRow[];
    missing: BankRow[];
    totals: { count: number; amount: number; missing: number };
    warnings: string[];
  }>(periodId ? `/reports/bank-transfer?periodId=${periodId}&sourceBank=${source}` : null, [periodId, source]);
  const code = periods.data?.find((p) => p.id === periodId)?.code ?? '';
  const cols = [
    { header: 'Mã NV', cell: (r: BankRow) => r.codeEmp },
    { header: 'Người thụ hưởng', cell: (r: BankRow) => r.beneficiary },
    { header: 'Số tài khoản', cell: (r: BankRow) => r.accountNo ?? <span className="text-danger">thiếu</span> },
    { header: 'Ngân hàng', cell: (r: BankRow) => r.bank ?? <span className="text-danger">thiếu</span> },
    { header: 'Số tiền', cell: (r: BankRow) => money(r.amount), className: 'num' },
  ];
  return (
    <Card
      title="File chuyển lương ngân hàng"
      actions={
        <div className="d-flex gap-2">
          <select className="form-select form-select-sm" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {[...(periods.data ?? [])].sort((a, b) => (a.code < b.code ? 1 : -1)).map((p) => (
              <option key={p.id} value={p.id}>Kỳ {p.code}{p.status === 'LOCKED' || p.status === 'PAID' ? '' : ' (chưa khoá)'}</option>
            ))}
          </select>
          <select className="form-select form-select-sm" value={source} onChange={(e) => setSource(e.target.value)} title="Ngân hàng của công ty (tài khoản chi lương)">
            {Object.entries(labels.bank).map(([k, v]) => <option key={k} value={k}>Chi từ {v}</option>)}
          </select>
          <select className="form-select form-select-sm" value={template?.id ?? ''} onChange={(e) => setTemplateId(e.target.value)} title="Mẫu file">
            {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>Mẫu: {t.name} ({t.format.toUpperCase()})</option>)}
          </select>
          {canWrite && (
            <button className="btn btn-sm btn-outline-secondary text-nowrap" onClick={() => setEditingTemplates(true)}>
              <i className="bi bi-gear me-1" />Mẫu file
            </button>
          )}
          {periodId && template && <BankDownloads template={template} periodId={periodId} source={source} code={code} />}
        </div>
      }
    >
      <p className="small text-body-secondary">
        Cột, tên cột và định dạng (Excel / CSV) theo mẫu đã chọn — khai báo mỗi ngân hàng một mẫu theo file mẫu tải từ Internet Banking.
        Tên người hưởng đã viết hoa, bỏ dấu.
      </p>
      <ErrorBox error={error ?? periods.error ?? templates.error} />
      {editingTemplates && templates.data && (
        <TemplateEditor
          templates={templates.data}
          onClose={() => setEditingTemplates(false)}
          onSaved={() => {
            setEditingTemplates(false);
            templates.reload();
          }}
        />
      )}
      {loading && <Loading />}
      {data && !error && (
        <>
          <Warnings items={data.warnings} />
          <div className="d-flex gap-3 mb-2 small flex-wrap">
            <span>Số người: <strong>{data.totals.count}</strong></span>
            <span>Tổng tiền: <strong>{money(data.totals.amount)}</strong></span>
            <span>Nội dung: <code>{data.content}</code></span>
          </div>
          <h3 className="h6 mt-3">Cùng ngân hàng {labels.bank[source as keyof typeof labels.bank]} ({data.sameBank.length})</h3>
          <DataTable rows={data.sameBank} rowKey={(r) => r.codeEmp} empty="Không có" columns={cols} />
          <h3 className="h6 mt-3">Khác ngân hàng ({data.otherBank.length})</h3>
          <DataTable rows={data.otherBank} rowKey={(r) => r.codeEmp} empty="Không có" columns={cols} />
          {data.missing.length > 0 && (
            <>
              <h3 className="h6 mt-3 text-danger">Chưa có tài khoản ({data.missing.length}) — cập nhật trong hồ sơ nhân sự</h3>
              <DataTable rows={data.missing} rowKey={(r) => r.codeEmp} columns={[cols[0], { header: 'Họ tên', cell: (r: BankRow) => r.fullName }, cols[4]]} />
            </>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------- Mẫu file chuyển lương ----------------
interface BankTemplate {
  id: string;
  name: string;
  format: 'xlsx' | 'csv';
  splitByBank: boolean;
  headerRow: boolean;
  columns: Array<{ field: string; header: string }>;
}

const BANK_FIELDS: Record<string, string> = {
  stt: 'STT',
  accountNo: 'Số tài khoản',
  beneficiary: 'Tên người hưởng (in hoa, không dấu)',
  fullName: 'Họ tên (có dấu)',
  bankCode: 'Mã ngân hàng',
  bankName: 'Tên ngân hàng',
  branch: 'Chi nhánh',
  amount: 'Số tiền',
  content: 'Nội dung chuyển khoản',
  codeEmp: 'Mã nhân viên',
};

/** Nút tải theo mẫu: CSV tách ngân hàng thì hai file (CSV chỉ có một bảng). */
function BankDownloads(props: { template: BankTemplate; periodId: string; source: string; code: string }) {
  const t = props.template;
  const base = `/reports/bank-transfer?periodId=${props.periodId}&sourceBank=${props.source}&templateId=${encodeURIComponent(t.id)}&format=file`;
  const name = `chuyen-luong-${props.code}-${t.id}`;
  if (t.format === 'csv' && t.splitByBank) {
    return (
      <>
        <DownloadButton path={`${base}&part=same`} name={`${name}-cung-${props.source}.csv`} label={`CSV cùng ${props.source}`} icon="bi-filetype-csv" />
        <DownloadButton path={`${base}&part=other`} name={`${name}-khac-ngan-hang.csv`} label="CSV khác NH" icon="bi-filetype-csv" />
      </>
    );
  }
  return <DownloadButton path={base} name={`${name}.${t.format}`} label={`Tải ${t.format === 'csv' ? 'CSV' : 'Excel'}`} icon={t.format === 'csv' ? 'bi-filetype-csv' : 'bi-file-earmark-excel'} />;
}

function TemplateEditor(props: { templates: BankTemplate[]; onClose: () => void; onSaved: () => void }) {
  const [list, setList] = useState<BankTemplate[]>(() => structuredClone(props.templates));
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const t = list[idx];
  const update = (patch: Partial<BankTemplate>) => setList(list.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const setCol = (k: number, patch: Partial<BankTemplate['columns'][number]>) =>
    update({ columns: t.columns.map((c, i) => (i === k ? { ...c, ...patch } : c)) });
  const move = (k: number, d: -1 | 1) => {
    const cols = [...t.columns];
    const j = k + d;
    if (j < 0 || j >= cols.length) return;
    [cols[k], cols[j]] = [cols[j], cols[k]];
    update({ columns: cols });
  };
  function addTemplate() {
    let n = list.length + 1;
    while (list.some((x) => x.id === `mau${n}`)) n++;
    setList([...list, { ...structuredClone(t), id: `mau${n}`, name: `Mẫu ${n}` }]);
    setIdx(list.length);
  }
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.put('/reports/bank-templates', list);
      toast('Đã lưu mẫu file');
      props.onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Modal title="Mẫu file chuyển lương" onClose={props.onClose} width={820}>
      <ErrorBox error={error} />
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {list.map((x, i) => (
          <button key={i} className={`btn btn-sm ${i === idx ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setIdx(i)}>
            {x.name}
          </button>
        ))}
        <button className="btn btn-sm btn-outline-primary" onClick={addTemplate}>+ Thêm mẫu (sao chép mẫu đang chọn)</button>
      </div>
      <div className="row g-2 mb-3">
        <div className="col-md-3">
          <label className="form-label">Mã mẫu</label>
          <input className="form-control form-control-sm" value={t.id} onChange={(e) => update({ id: e.target.value.trim() })} />
        </div>
        <div className="col-md-5">
          <label className="form-label">Tên mẫu</label>
          <input className="form-control form-control-sm" value={t.name} onChange={(e) => update({ name: e.target.value })} placeholder="vd Vietcombank – chi lương" />
        </div>
        <div className="col-md-4">
          <label className="form-label">Định dạng</label>
          <select className="form-select form-select-sm" value={t.format} onChange={(e) => update({ format: e.target.value as 'xlsx' | 'csv' })}>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (UTF-8)</option>
          </select>
        </div>
        <div className="col-12 d-flex flex-wrap gap-4">
          <label className="form-check">
            <input type="checkbox" className="form-check-input" checked={t.splitByBank} onChange={(e) => update({ splitByBank: e.target.checked })} />
            <span className="form-check-label">Tách cùng ngân hàng / khác ngân hàng</span>
          </label>
          <label className="form-check">
            <input type="checkbox" className="form-check-input" checked={t.headerRow} onChange={(e) => update({ headerRow: e.target.checked })} />
            <span className="form-check-label">Có dòng tiêu đề</span>
          </label>
        </div>
      </div>
      <table className="table table-sm align-middle">
        <thead>
          <tr><th style={{ width: 40 }}>#</th><th>Dữ liệu</th><th>Tên cột trong file</th><th style={{ width: 120 }} /></tr>
        </thead>
        <tbody>
          {t.columns.map((c, k) => (
            <tr key={k}>
              <td>{k + 1}</td>
              <td>
                <select className="form-select form-select-sm" value={c.field} onChange={(e) => setCol(k, { field: e.target.value })}>
                  {Object.entries(BANK_FIELDS).map(([f, l]) => <option key={f} value={f}>{l}</option>)}
                </select>
              </td>
              <td><input className="form-control form-control-sm" value={c.header} onChange={(e) => setCol(k, { header: e.target.value })} /></td>
              <td className="text-nowrap">
                <button className="btn btn-sm btn-light" onClick={() => move(k, -1)} aria-label="Lên"><i className="bi bi-arrow-up" /></button>
                <button className="btn btn-sm btn-light" onClick={() => move(k, 1)} aria-label="Xuống"><i className="bi bi-arrow-down" /></button>
                <button className="btn btn-sm btn-light text-danger" onClick={() => update({ columns: t.columns.filter((_, i) => i !== k) })} aria-label="Xoá cột">
                  <i className="bi bi-x-lg" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-sm btn-outline-secondary" onClick={() => update({ columns: [...t.columns, { field: 'amount', header: 'Số tiền' }] })}>+ Thêm cột</button>
      <div className="d-flex justify-content-between mt-3">
        <button
          className="btn btn-outline-danger"
          disabled={list.length === 1}
          onClick={() => {
            setList(list.filter((_, i) => i !== idx));
            setIdx(0);
          }}
        >
          Xoá mẫu này
        </button>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Chứng từ khấu trừ thuế TNCN ----------------
interface Certificate {
  id: string;
  seq: number;
  symbol: string;
  fromMonth: number;
  toMonth: number;
  taxableIncome: string;
  taxWithheld: string;
  issuedAt: string;
  employment: { codeEmp: string; person: { fullName: string; personalTaxCode: string | null } };
}

function CertificatesTab() {
  const canWrite = useCanWrite('reports');
  const [year, setYear] = useState(Number(lastMonth().slice(0, 4)));
  const [fromMonth, setFrom] = useState(1);
  const [toMonth, setTo] = useState(12);
  const [includeZero, setIncludeZero] = useState(false);
  const list = useFetch<Certificate[]>(`/reports/pit-certificates?year=${year}`, [year]);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <Card
      title="Chứng từ khấu trừ thuế TNCN"
      actions={
        <div className="d-flex gap-2 align-items-center">
          <input type="number" className="form-control form-control-sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))} />
          {!!list.data?.length && (
            <DownloadButton path={`/reports/pit-certificates/pdf?year=${year}`} name={`chung-tu-TNCN-${year}.pdf`} label="In tất cả (PDF)" icon="bi-printer" />
          )}
        </div>
      }
    >
      {canWrite && (
        <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
          <div>
            <label className="form-label small mb-1">Từ tháng</label>
            <select className="form-select form-select-sm" value={fromMonth} onChange={(e) => setFrom(Number(e.target.value))}>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label small mb-1">Đến tháng</label>
            <select className="form-select form-select-sm" value={toMonth} onChange={(e) => setTo(Number(e.target.value))}>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <label className="form-check mb-1">
            <input type="checkbox" className="form-check-input" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />
            <span className="form-check-label small">Lập cả cho người không bị khấu trừ</span>
          </label>
          <ActionButton
            className="btn btn-sm btn-primary"
            label="Lập chứng từ"
            confirm={`Lập chứng từ tháng ${fromMonth}–${toMonth}/${year}? Người đã có chứng từ cùng kỳ được cập nhật số liệu, giữ nguyên số.`}
            run={() => api.post('/reports/pit-certificates', { year, fromMonth, toMonth, includeZeroTax: includeZero })}
            success="Đã lập chứng từ"
            onDone={list.reload}
          />
        </div>
      )}
      <p className="small text-body-secondary">
        Nội dung theo Điều 32 Nghị định 123/2020. File PDF để in, ký và đóng dấu; chứng từ điện tử còn cần ký số và đăng ký với cơ quan thuế.
        Nhân viên tự tải chứng từ của mình ở trang Phiếu lương.
      </p>
      <ErrorBox error={list.error} />
      <DataTable
        rows={list.data}
        loading={list.loading}
        rowKey={(c) => c.id}
        empty="Chưa lập chứng từ nào cho năm này"
        columns={[
          { header: 'Số', cell: (c) => `${c.symbol} · ${String(c.seq).padStart(7, '0')}`, className: 'nowrap' },
          { header: 'Mã NV', cell: (c) => c.employment.codeEmp },
          { header: 'Họ tên', cell: (c) => c.employment.person.fullName },
          { header: 'MST', cell: (c) => c.employment.person.personalTaxCode ?? <span className="text-danger">thiếu</span> },
          { header: 'Kỳ', cell: (c) => `T${c.fromMonth}–T${c.toMonth}` },
          { header: 'TNCT', cell: (c) => money(c.taxableIncome), className: 'num' },
          { header: 'Thuế đã khấu trừ', cell: (c) => money(c.taxWithheld), className: 'num' },
          {
            header: '',
            className: 'actions',
            cell: (c) => (
              <div className="d-flex gap-1 justify-content-end">
                <ActionButton label={<i className="bi bi-file-earmark-pdf" />} run={() => downloadFile(`/reports/pit-certificates/pdf?ids=${c.id}`, `chung-tu-${c.seq}.pdf`)} />
                {canWrite && (
                  <ActionButton
                    className="btn btn-sm btn-outline-danger"
                    label={<i className="bi bi-trash" />}
                    confirm="Xoá chứng từ này?"
                    run={() => api.delete(`/reports/pit-certificates/${c.id}`)}
                    onDone={list.reload}
                  />
                )}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('bhxh');
  return (
    <>
      <PageHeader title="Báo cáo BHXH – Thuế – Chuyển lương" />
      <Tabs
        tabs={[
          { key: 'bhxh', label: 'BHXH (D02-LT)' },
          { key: 'pit', label: 'Thuế TNCN (05/KK)' },
          { key: 'qtt', label: 'Quyết toán thuế năm' },
          { key: 'cert', label: 'Chứng từ khấu trừ thuế' },
          { key: 'bank', label: 'Chuyển lương ngân hàng' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'bhxh' && <InsuranceTab />}
      {tab === 'pit' && <PitTab />}
      {tab === 'qtt' && <AnnualTab />}
      {tab === 'cert' && <CertificatesTab />}
      {tab === 'bank' && <BankTab />}
    </>
  );
}
