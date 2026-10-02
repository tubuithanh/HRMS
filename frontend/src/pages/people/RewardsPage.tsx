import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useCanWrite } from '../../auth';
import EmployeePicker from '../../components/EmployeePicker';
import { ActionButton, Card, DataTable, ErrorBox, Modal, PageHeader, Tabs, useToast } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, money, todayISO } from '../../lib/format';

export interface RewardRow {
  id: string;
  kind: 'REWARD' | 'DISCIPLINE';
  form: string;
  decisionNo: string | null;
  decisionDate: string;
  effectiveDate: string;
  reason: string;
  amount: string | null;
  expiryDate: string | null;
  periodElementId: string | null;
  employment?: { id: string; codeEmp: string; person: { id: string; fullName: string } };
}

export const REWARD_FORMS: Record<string, string> = { CASH: 'Thưởng tiền', CERTIFICATE: 'Giấy khen / bằng khen', OTHER: 'Hình thức khác' };
export const DISCIPLINE_FORMS: Record<string, string> = {
  REPRIMAND: 'Khiển trách',
  EXTEND_RAISE: 'Kéo dài thời hạn nâng lương (≤ 6 tháng)',
  DEMOTE: 'Cách chức',
  DISMISS: 'Sa thải',
};

/** Trạng thái kỷ luật: còn hiệu lực đến ngày xoá / đã xoá. */
export function DisciplineStatus({ r }: { r: RewardRow }) {
  if (r.kind !== 'DISCIPLINE') return null;
  if (!r.expiryDate) return <span className="badge text-bg-danger">Không xoá</span>;
  const active = r.expiryDate.slice(0, 10) > todayISO();
  return active ? (
    <span className="badge text-bg-warning">Hiệu lực đến {date(r.expiryDate)}</span>
  ) : (
    <span className="badge text-bg-light border">Đã xoá kỷ luật {date(r.expiryDate)}</span>
  );
}

function CreateModal(props: { onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<'REWARD' | 'DISCIPLINE'>('REWARD');
  const [form, setForm] = useState('CASH');
  const [ids, setIds] = useState<string[]>([]);
  const [decisionNo, setNo] = useState('');
  const [decisionDate, setDD] = useState(todayISO());
  const [effectiveDate, setED] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const forms = kind === 'REWARD' ? REWARD_FORMS : DISCIPLINE_FORMS;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/people/rewards', {
        employmentIds: ids,
        kind,
        form,
        decisionNo: decisionNo || undefined,
        decisionDate,
        effectiveDate,
        reason,
        amount: amount ? Number(amount) : undefined,
      });
      const d = r.data.data as { items: unknown[]; payPeriod: string | null; warnings: string[] };
      toast(`Đã lưu quyết định cho ${d.items.length} người${d.payPeriod ? ` · tiền vào kỳ lương ${d.payPeriod}` : ''}`);
      for (const w of d.warnings) toast(w, 'error');
      props.onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="Quyết định khen thưởng / kỷ luật" onClose={props.onClose} width={860}>
      <ErrorBox error={error} />
      <div className="row g-3">
        <div className="col-lg-6">
          <div className="btn-group w-100 mb-3" role="group">
            {(['REWARD', 'DISCIPLINE'] as const).map((k) => (
              <button key={k} type="button" className={`btn ${kind === k ? (k === 'REWARD' ? 'btn-success' : 'btn-danger') : 'btn-outline-secondary'}`} onClick={() => { setKind(k); setForm(k === 'REWARD' ? 'CASH' : 'REPRIMAND'); setAmount(''); }}>
                {k === 'REWARD' ? 'Khen thưởng' : 'Kỷ luật'}
              </button>
            ))}
          </div>
          <label className="form-label">Hình thức</label>
          <select className="form-select mb-2" value={form} onChange={(e) => setForm(e.target.value)}>
            {Object.entries(forms).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="row g-2 mb-2">
            <div className="col-4">
              <label className="form-label">Số quyết định</label>
              <input className="form-control" value={decisionNo} onChange={(e) => setNo(e.target.value)} placeholder="12/QĐ-…" />
            </div>
            <div className="col-4">
              <label className="form-label">Ngày quyết định</label>
              <input type="date" className="form-control" value={decisionDate} onChange={(e) => setDD(e.target.value)} />
            </div>
            <div className="col-4">
              <label className="form-label">Ngày hiệu lực</label>
              <input type="date" className="form-control" value={effectiveDate} onChange={(e) => setED(e.target.value)} />
            </div>
          </div>
          <label className="form-label">Lý do / hành vi vi phạm <span className="text-danger">*</span></label>
          <textarea className="form-control mb-2" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          {(kind === 'DISCIPLINE' || form === 'CASH') && (
            <>
              <label className="form-label">{kind === 'REWARD' ? 'Số tiền thưởng (mỗi người)' : 'Bồi thường thiệt hại (nếu có)'}</label>
              <input type="number" min={0} className="form-control" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <div className="form-text">
                {kind === 'REWARD'
                  ? 'Tự đưa vào kỳ lương đang mở chứa ngày hiệu lực (khoản Thưởng).'
                  : 'Không được phạt tiền thay kỷ luật (Điều 127 BLLĐ). Chỉ nhập khi người lao động phải bồi thường thiệt hại (Điều 129) — trừ dần tối đa 30% lương tháng.'}
              </div>
            </>
          )}
          {kind === 'DISCIPLINE' && (
            <div className="alert alert-light border small mt-2 mb-0">
              Tự xoá kỷ luật nếu không tái phạm: khiển trách sau 3 tháng, kéo dài nâng lương sau 6 tháng, cách chức sau 3 năm (Điều 126).
              Sa thải: dùng thêm chức năng <em>Cho nghỉ việc</em>.
            </div>
          )}
        </div>
        <div className="col-lg-6">
          <label className="form-label">Nhân viên <span className="text-danger">*</span></label>
          <EmployeePicker value={ids} onChange={setIds} height={340} />
        </div>
      </div>
      <div className="d-flex justify-content-end gap-2 mt-3">
        <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
        <button className={`btn ${kind === 'REWARD' ? 'btn-success' : 'btn-danger'}`} disabled={busy || ids.length === 0 || reason.trim().length < 3} onClick={submit}>
          {busy ? 'Đang lưu…' : `Lưu quyết định (${ids.length} người)`}
        </button>
      </div>
    </Modal>
  );
}

export default function RewardsPage() {
  const canWrite = useCanWrite('corehr');
  const [tab, setTab] = useState<'ALL' | 'REWARD' | 'DISCIPLINE'>('ALL');
  const [year, setYear] = useState(new Date().getFullYear());
  const [creating, setCreating] = useState(false);
  const list = useFetch<RewardRow[]>(`/people/rewards?year=${year}${tab === 'ALL' ? '' : `&kind=${tab}`}`, [year, tab]);
  const rows = list.data ?? [];
  const activeDisc = rows.filter((r) => r.kind === 'DISCIPLINE' && (!r.expiryDate || r.expiryDate.slice(0, 10) > todayISO())).length;
  return (
    <>
      <PageHeader
        title="Khen thưởng – kỷ luật"
        actions={canWrite && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Quyết định mới</button>}
      />
      <Tabs
        tabs={[
          { key: 'ALL', label: 'Tất cả' },
          { key: 'REWARD', label: 'Khen thưởng' },
          { key: 'DISCIPLINE', label: `Kỷ luật${activeDisc ? ` (${activeDisc} còn hiệu lực)` : ''}` },
        ]}
        active={tab}
        onChange={setTab}
      />
      <Card
        flush
        title={`Năm ${year}`}
        actions={<input type="number" className="form-control form-control-sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))} />}
      >
        <ErrorBox error={list.error} />
        <DataTable
          rows={list.data}
          loading={list.loading}
          rowKey={(r) => r.id}
          empty="Chưa có quyết định nào"
          columns={[
            { header: 'Loại', cell: (r) => (r.kind === 'REWARD' ? <span className="badge text-bg-success">Khen thưởng</span> : <span className="badge text-bg-danger">Kỷ luật</span>) },
            { header: 'Nhân viên', cell: (r) => <>{r.employment?.person.fullName}<div className="small text-body-secondary">{r.employment?.codeEmp}</div></> },
            { header: 'Hình thức', cell: (r) => (r.kind === 'REWARD' ? REWARD_FORMS : DISCIPLINE_FORMS)[r.form] ?? r.form },
            { header: 'Quyết định', cell: (r) => <>{r.decisionNo ?? '—'}<div className="small text-body-secondary">{date(r.decisionDate)}</div></>, className: 'nowrap' },
            { header: 'Lý do', cell: (r) => <span className="small">{r.reason}</span> },
            { header: 'Số tiền', cell: (r) => (r.amount ? money(r.amount) : '—'), className: 'num' },
            { header: 'Trạng thái', cell: (r) => <DisciplineStatus r={r} /> },
            {
              header: '',
              className: 'actions',
              cell: (r) =>
                canWrite && (
                  <ActionButton
                    className="btn btn-sm btn-outline-danger"
                    label={<i className="bi bi-trash" />}
                    confirm="Xoá quyết định này? Khoản tiền trong kỳ lương chưa khoá cũng bị xoá."
                    run={() => api.delete(`/people/rewards/${r.id}`)}
                    success="Đã xoá"
                    onDone={list.reload}
                  />
                ),
            },
          ]}
        />
      </Card>
      {creating && <CreateModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); list.reload(); }} />}
    </>
  );
}
