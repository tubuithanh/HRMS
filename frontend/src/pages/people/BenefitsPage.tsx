import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { ActionButton, Card, DataTable, ErrorBox, Modal, PageHeader, useToast } from '../../components/ui';
import { downloadFile, useFetch } from '../../lib/hooks';
import { currentMonth, date, money, todayISO } from '../../lib/format';
import { Employment } from '../../types/models';

export const REGIMES: Record<string, string> = {
  SICK: 'Ốm đau',
  CHILD_SICK: 'Chăm con ốm',
  BIRTH: 'Thai sản — sinh con',
  CHECKUP: 'Thai sản — khám thai',
  MISCARRIAGE: 'Thai sản — sảy thai, phá thai',
  PATERNITY: 'Thai sản — lao động nam khi vợ sinh',
  RECOVERY: 'Dưỡng sức, phục hồi sức khoẻ',
};
const STATUS: Record<string, [string, string]> = {
  DRAFT: ['Nháp', 'text-bg-light border'],
  SUBMITTED: ['Đã nộp BHXH', 'text-bg-info'],
  PAID: ['BHXH đã chi', 'text-bg-success'],
  REJECTED: ['Bị từ chối', 'text-bg-danger'],
};
export const ClaimStatus = ({ s }: { s: string }) => <span className={`badge ${STATUS[s]?.[1] ?? ''}`}>{STATUS[s]?.[0] ?? s}</span>;

export interface Claim {
  id: string;
  regime: string;
  fromDate: string;
  toDate: string;
  days: string;
  months: string | null;
  baseAmount: string;
  amount: string;
  lumpSum: string;
  status: string;
  note: string | null;
  periodElementId: string | null;
  detail: { formula?: string; warnings?: string[] } | null;
  employment?: { id: string; codeEmp: string; person: { id: string; fullName: string; socialInsNo: string | null } };
}

interface Preview {
  regimeLabel: string;
  fromDate: string;
  toDate: string;
  days: number;
  months: number | null;
  baseAmount: string;
  amount: string;
  lumpSum: string;
  formula: string;
  entitlement: { limit: number; used: number; remaining: number } | null;
  insuredYears: number;
  hazardous: boolean;
  warnings: string[];
}

function CreateClaim(props: { onClose: () => void; onDone: () => void }) {
  const emps = useFetch<Employment[]>('/corehr/employments');
  const [f, setF] = useState<Record<string, string | boolean>>({ regime: 'SICK', fromDate: todayISO(), toDate: todayISO(), childCount: '1' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const r = String(f.regime);
  const needTo = !['BIRTH', 'MISCARRIAGE'].includes(r);
  const needChild = ['CHILD_SICK', 'PATERNITY', 'BIRTH'].includes(r);

  const body = () => ({
    employmentId: f.employmentId,
    regime: r,
    fromDate: f.fromDate,
    ...(needTo ? { toDate: f.toDate } : {}),
    ...(needChild && f.childBirthDate ? { childBirthDate: f.childBirthDate } : {}),
    ...(['BIRTH', 'PATERNITY'].includes(r) ? { childCount: Number(f.childCount || 1) } : {}),
    ...(r === 'MISCARRIAGE' ? { pregnancyWeeks: Number(f.pregnancyWeeks || 0) } : {}),
    ...(r === 'PATERNITY' ? { surgery: !!f.surgery } : {}),
    ...(f.insuredYears ? { insuredYears: Number(f.insuredYears) } : {}),
    ...(f.note ? { note: f.note } : {}),
  });

  // Tính thử mỗi khi đổi dữ liệu
  useEffect(() => {
    if (!f.employmentId) return;
    const t = setTimeout(() => {
      api
        .post<{ data: Preview }>('/benefits/claims/preview', body())
        .then((x) => {
          setPreview(x.data.data);
          setError(null);
        })
        .catch((e) => {
          setPreview(null);
          setError(errorMessage(e));
        });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(f)]);

  async function save() {
    setBusy(true);
    try {
      const x = await api.post('/benefits/claims', body());
      toast('Đã lập hồ sơ — ngày nghỉ đã ghi vào bảng công (không lương công ty)');
      for (const w of (x.data.data.warnings as string[]) ?? []) toast(w, 'error');
      props.onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const input = (k: string, label: string, type = 'text', extra: Record<string, unknown> = {}) => (
    <div className="col-md-6">
      <label className="form-label">{label}</label>
      <input type={type} className="form-control" value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value)} {...extra} />
    </div>
  );

  return (
    <Modal title="Lập hồ sơ hưởng chế độ BHXH" onClose={props.onClose} width={900}>
      <div className="row g-3">
        <div className="col-lg-6">
          <div className="row g-2">
            <div className="col-12">
              <label className="form-label">Nhân viên</label>
              <select className="form-select" value={String(f.employmentId ?? '')} onChange={(e) => set('employmentId', e.target.value)}>
                <option value="">— chọn —</option>
                {(emps.data ?? []).filter((e) => e.status !== 'TERMINATED').map((e) => <option key={e.id} value={e.id}>{e.codeEmp} · {e.person?.fullName}</option>)}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label">Chế độ</label>
              <select className="form-select" value={r} onChange={(e) => set('regime', e.target.value)}>
                {Object.entries(REGIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {input('fromDate', r === 'BIRTH' ? 'Ngày bắt đầu nghỉ sinh' : 'Từ ngày', 'date')}
            {needTo && input('toDate', 'Đến ngày', 'date')}
            {needChild && input('childBirthDate', r === 'BIRTH' ? 'Ngày sinh con (dự kiến)' : 'Ngày sinh của con', 'date')}
            {['BIRTH', 'PATERNITY'].includes(r) && input('childCount', 'Số con sinh một lần', 'number', { min: 1, max: 6 })}
            {r === 'MISCARRIAGE' && input('pregnancyWeeks', 'Tuổi thai (tuần)', 'number', { min: 1, max: 42 })}
            {r === 'PATERNITY' && (
              <div className="col-12">
                <label className="form-check">
                  <input type="checkbox" className="form-check-input" checked={!!f.surgery} onChange={(e) => set('surgery', e.target.checked)} />
                  <span className="form-check-label">Vợ sinh phẫu thuật hoặc sinh con dưới 32 tuần</span>
                </label>
              </div>
            )}
            {r === 'SICK' && input('insuredYears', 'Số năm đóng BHXH (bỏ trống = ước tính)', 'number', { step: 'any' })}
            <div className="col-12">
              <label className="form-label">Ghi chú / giấy tờ</label>
              <input className="form-control" value={String(f.note ?? '')} onChange={(e) => set('note', e.target.value)} placeholder="Giấy ra viện, giấy chứng nhận nghỉ việc hưởng BHXH…" />
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <ErrorBox error={error} />
          {!f.employmentId && <div className="text-body-secondary small">Chọn nhân viên để tính thử.</div>}
          {preview && (
            <div className="card card-body bg-body-tertiary">
              <div className="fw-semibold mb-2">{preview.regimeLabel}</div>
              <dl className="kv small mb-2">
                <dt>Thời gian</dt>
                <dd>{date(preview.fromDate)} – {date(preview.toDate)}</dd>
                <dt>Số ngày hưởng</dt>
                <dd>{preview.months ? `${preview.months} tháng` : `${preview.days} ngày`}</dd>
                <dt>Căn cứ</dt>
                <dd>{money(preview.baseAmount)}đ</dd>
                <dt>Cách tính</dt>
                <dd>{preview.formula}</dd>
                {preview.entitlement && (
                  <>
                    <dt>Trong năm</dt>
                    <dd>đã hưởng {preview.entitlement.used} · tối đa {preview.entitlement.limit} · còn {preview.entitlement.remaining} ngày</dd>
                  </>
                )}
                {r === 'SICK' && (
                  <>
                    <dt>Năm đóng BHXH</dt>
                    <dd>{preview.insuredYears}{preview.hazardous ? ' · nghề nặng nhọc, độc hại (+10 ngày)' : ''}</dd>
                  </>
                )}
              </dl>
              <div className="fs-5 fw-semibold">{money(preview.amount)}đ{Number(preview.lumpSum) > 0 && <span className="fs-6 fw-normal"> + trợ cấp một lần {money(preview.lumpSum)}đ</span>}</div>
              {preview.warnings.map((w) => <div key={w} className="alert alert-warning small py-1 px-2 mt-2 mb-0">{w}</div>)}
            </div>
          )}
          <p className="small text-body-secondary mt-2 mb-0">
            Theo Luật BHXH 2024 — số tiền do cơ quan BHXH xét duyệt cuối cùng. Ngày nghỉ được ghi thành đơn nghỉ không lương công ty (loại Ốm / Thai sản).
          </p>
        </div>
      </div>
      <div className="d-flex justify-content-end gap-2 mt-3">
        <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
        <button className="btn btn-primary" disabled={busy || !preview} onClick={save}>{busy ? 'Đang lưu…' : 'Lập hồ sơ'}</button>
      </div>
    </Modal>
  );
}

function PayModal(props: { claim: Claim; onClose: () => void; onDone: () => void }) {
  const periods = useFetch<Array<{ id: string; code: string; status: string }>>('/payroll/periods');
  const open = (periods.data ?? []).filter((p) => !['LOCKED', 'PAID', 'CANCELLED'].includes(p.status));
  const [pid, setPid] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setPid((x) => x || open[0]?.id || ''), [open]);
  return (
    <Modal title="Đưa tiền BHXH vào kỳ lương" onClose={props.onClose} width={480}>
      <ErrorBox error={error} />
      <p className="small">
        {props.claim.employment?.person.fullName}: {money(Number(props.claim.amount) + Number(props.claim.lumpSum))}đ — khoản <em>Trợ cấp BHXH</em> (miễn thuế, không tính BH).
      </p>
      <select className="form-select" value={pid} onChange={(e) => setPid(e.target.value)}>
        {open.map((p) => <option key={p.id} value={p.id}>Kỳ {p.code}</option>)}
      </select>
      {open.length === 0 && <div className="small text-danger mt-2">Không có kỳ lương đang mở.</div>}
      <div className="d-flex justify-content-end gap-2 mt-3">
        <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
        <ActionButton
          className="btn btn-primary"
          label="Đưa vào lương"
          disabled={!pid}
          run={() => api.post(`/benefits/claims/${props.claim.id}/payroll`, { payPeriodId: pid }).catch((e) => { setError(errorMessage(e)); throw e; })}
          success="Đã thêm vào kỳ lương — tính lại lương để cập nhật"
          onDone={props.onDone}
        />
      </div>
    </Modal>
  );
}

export function ClaimsTable({ rows, loading, manage, onChanged }: { rows: Claim[] | null; loading?: boolean; manage?: boolean; onChanged?: () => void }) {
  const [paying, setPaying] = useState<Claim | null>(null);
  const st = (c: Claim, s: string, label: string, cls = 'btn btn-sm btn-outline-secondary') => (
    <ActionButton className={cls} label={label} run={() => api.post(`/benefits/claims/${c.id}/status`, { status: s })} onDone={onChanged} />
  );
  return (
    <>
      <DataTable
        rows={rows}
        loading={loading}
        rowKey={(c) => c.id}
        empty="Chưa có hồ sơ"
        columns={[
          ...(manage ? [{ header: 'Nhân viên', cell: (c: Claim) => <>{c.employment?.person.fullName}<div className="small text-body-secondary">{c.employment?.codeEmp}</div></> }] : []),
          { header: 'Chế độ', cell: (c: Claim) => REGIMES[c.regime] ?? c.regime },
          { header: 'Thời gian', cell: (c: Claim) => `${date(c.fromDate)} – ${date(c.toDate)}`, className: 'nowrap' },
          { header: 'Ngày / tháng', cell: (c: Claim) => (c.months ? `${Number(c.months)} tháng` : `${Number(c.days)} ngày`), className: 'num' },
          { header: 'Số tiền', cell: (c: Claim) => <span title={c.detail?.formula}>{money(c.amount)}{Number(c.lumpSum) > 0 && <div className="small text-body-secondary">+ {money(c.lumpSum)} một lần</div>}</span>, className: 'num' },
          { header: 'Trạng thái', cell: (c: Claim) => <><ClaimStatus s={c.status} />{c.periodElementId && <div className="small text-success">đã vào lương</div>}</> },
          ...(manage
            ? [{
                header: '',
                className: 'actions',
                cell: (c: Claim) => (
                  <div className="d-flex gap-1 justify-content-end flex-wrap">
                    {c.status === 'DRAFT' && st(c, 'SUBMITTED', 'Đã nộp BHXH', 'btn btn-sm btn-outline-primary')}
                    {c.status === 'SUBMITTED' && st(c, 'PAID', 'BHXH đã chi', 'btn btn-sm btn-outline-success')}
                    {c.status === 'SUBMITTED' && st(c, 'REJECTED', 'Bị từ chối', 'btn btn-sm btn-outline-danger')}
                    {c.status === 'PAID' && !c.periodElementId && <button className="btn btn-sm btn-primary" onClick={() => setPaying(c)}>Đưa vào lương</button>}
                    {c.status === 'DRAFT' && (
                      <ActionButton className="btn btn-sm btn-outline-danger" label={<i className="bi bi-trash" />} confirm="Xoá hồ sơ nháp? Đơn nghỉ đi kèm sẽ bị huỷ." run={() => api.delete(`/benefits/claims/${c.id}`)} onDone={onChanged} />
                    )}
                  </div>
                ),
              }]
            : []),
        ]}
      />
      {paying && <PayModal claim={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); onChanged?.(); }} />}
    </>
  );
}

export default function BenefitsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const list = useFetch<Claim[]>(`/benefits/claims?year=${year}${status ? `&status=${status}` : ''}`, [year, status]);
  const rows = list.data ?? [];
  const total = (s: string) => rows.filter((c) => c.status === s).reduce((n, c) => n + Number(c.amount) + Number(c.lumpSum), 0);
  return (
    <>
      <PageHeader
        title="Chế độ BHXH"
        subtitle="Ốm đau, thai sản, dưỡng sức phục hồi sức khoẻ — Luật BHXH 2024"
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}>+ Lập hồ sơ</button>}
      />
      <div className="row g-2 mb-3">
        {([
          ['Nháp', rows.filter((c) => c.status === 'DRAFT').length, total('DRAFT')],
          ['Đã nộp BHXH (chờ chi)', rows.filter((c) => c.status === 'SUBMITTED').length, total('SUBMITTED')],
          ['BHXH đã chi', rows.filter((c) => c.status === 'PAID').length, total('PAID')],
        ] as Array<[string, number, number]>).map(([k, n, v]) => (
          <div key={k} className="col-md-4">
            <div className="card card-body py-2">
              <div className="small text-body-secondary">{k}</div>
              <div className="fs-5 fw-semibold">{n} hồ sơ · {money(v)}đ</div>
            </div>
          </div>
        ))}
      </div>
      <Card
        flush
        title={`Hồ sơ năm ${year}`}
        actions={
          <div className="d-flex gap-2 flex-wrap">
            <input type="number" className="form-control form-control-sm" style={{ width: 90 }} value={year} onChange={(e) => setYear(Number(e.target.value))} />
            <select className="form-select form-select-sm w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Mọi trạng thái</option>
              {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input type="month" className="form-control form-control-sm w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
            <ActionButton className="btn btn-sm btn-success text-nowrap" label={<><i className="bi bi-file-earmark-excel me-1" />Danh sách đề nghị</>} run={() => downloadFile(`/benefits/claims/export?month=${month}`, `de-nghi-BHXH-${month}.xlsx`)} />
          </div>
        }
      >
        <ErrorBox error={list.error} />
        <ClaimsTable rows={list.data} loading={list.loading} manage onChanged={list.reload} />
      </Card>
      {creating && <CreateClaim onClose={() => setCreating(false)} onDone={() => { setCreating(false); list.reload(); }} />}
    </>
  );
}
