import { FormEvent, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { ActionButton, Card, ErrorBox, FormModal, Loading, Modal, PageHeader, useToast } from '../components/ui';
import { useFetch } from '../lib/hooks';
import { date, money, todayISO } from '../lib/format';

interface Row {
  id: string;
  paramCode: string;
  value: string;
  effectiveDate: string;
  legalDocument: string | null;
}
interface Bracket {
  bracketNo: number;
  fromAmount: string;
  toAmount: string | null;
  rate: string;
  quickDeduction: string;
}
interface Rate {
  id: string;
  insuranceType: 'SOCIAL' | 'HEALTH' | 'UNEMPLOYMENT';
  employeeRate: string;
  companyRate: string;
  capBase: 'BASE_SALARY' | 'MIN_WAGE_REGION';
  capMultiplier: number;
  effectiveDate: string;
}
interface Overview {
  lockedUntil: string | null;
  codes: Record<string, string>;
  parameters: Row[];
  bracketVersions: Array<{ effectiveDate: string; brackets: Bracket[] }>;
  insurance: Rate[];
}

const INS_LABEL = { SOCIAL: 'BHXH', HEALTH: 'BHYT', UNEMPLOYMENT: 'BHTN' } as const;
const ORDER = ['SOCIAL', 'HEALTH', 'UNEMPLOYMENT'];
const pct = (r: string | number) => `${(Number(r) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
const today = todayISO();

/** Mức đang áp dụng hôm nay trong danh sách (sắp xếp mới → cũ). */
const isCurrent = (rows: Array<{ effectiveDate: string }>, r: { effectiveDate: string }) =>
  rows.find((x) => x.effectiveDate.slice(0, 10) <= today) === r;

function EffectiveBadge({ current, future }: { current: boolean; future: boolean }) {
  if (future) return <span className="badge text-bg-info ms-2">Sắp áp dụng</span>;
  if (current) return <span className="badge text-bg-success ms-2">Đang áp dụng</span>;
  return null;
}

export default function LegalParamsPage() {
  const { data, error, loading, reload } = useFetch<Overview>('/settings/legal');
  const [addParam, setAddParam] = useState<string | null>(null);
  const [insOpen, setInsOpen] = useState(false);
  const [brOpen, setBrOpen] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const locked = data.lockedUntil ? date(data.lockedUntil) : null;

  // Nhóm bảo hiểm theo ngày hiệu lực
  const insVersions = [...new Set(data.insurance.map((r) => r.effectiveDate))].map((d) => ({
    effectiveDate: d,
    rates: data.insurance
      .filter((r) => r.effectiveDate === d)
      .sort((a, b) => ORDER.indexOf(a.insuranceType) - ORDER.indexOf(b.insuranceType)),
  }));

  return (
    <>
      <PageHeader
        title="Tham số pháp lý"
        subtitle="Mỗi tham số có nhiều mức theo ngày hiệu lực. Kỳ lương dùng mức hiệu lực vào ngày cuối kỳ và lưu lại, nên đổi luật không làm thay đổi kỳ đã tính."
      />
      <div className="alert alert-info small">
        <i className="bi bi-info-circle me-1" />
        Thêm mức mới khi có văn bản thay đổi (ví dụ lương cơ sở tăng từ 01/7). Không thể thêm hoặc xoá mức có hiệu lực
        {locked ? <> từ <strong>{locked}</strong> trở về trước (kỳ lương đã khoá)</> : ' rơi vào kỳ lương đã khoá'}.
        Sau khi thêm, tính lại các kỳ chưa khoá bị ảnh hưởng.
      </div>

      <div className="row g-3">
        <div className="col-xl-7">
          <Card title={<h2 className="h6 mb-0"><i className="bi bi-sliders me-2 text-primary" />Giảm trừ, lương cơ sở, lương tối thiểu vùng</h2>} flush>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr><th>Tham số</th><th className="num">Giá trị</th><th className="nowrap">Hiệu lực từ</th><th>Căn cứ</th><th /></tr>
                </thead>
                <tbody>
                  {Object.entries(data.codes).map(([code, label]) => {
                    const rows = data.parameters.filter((p) => p.paramCode === code);
                    return rows.map((r, i) => (
                      <tr key={r.id} className={i > 0 ? 'text-body-secondary' : ''}>
                        <td>
                          {i === 0 ? <strong>{label}</strong> : <span className="ps-3 small">↳ mức cũ</span>}
                          {i === 0 && (
                            <button className="btn btn-link btn-sm p-0 ms-2" onClick={() => setAddParam(code)}>+ mức mới</button>
                          )}
                        </td>
                        <td className="num">
                          {money(r.value)}
                          <EffectiveBadge current={isCurrent(rows, r)} future={r.effectiveDate.slice(0, 10) > today} />
                        </td>
                        <td className="nowrap">{date(r.effectiveDate)}</td>
                        <td className="small">{r.legalDocument ?? ''}</td>
                        <td className="actions">
                          {rows.length > 1 && (!data.lockedUntil || r.effectiveDate.slice(0, 10) > data.lockedUntil.slice(0, 10)) && (
                            <ActionButton
                              label={<i className="bi bi-trash" />}
                              className="btn btn-sm btn-outline-danger"
                              confirm={`Xoá mức ${money(r.value)} hiệu lực ${date(r.effectiveDate)}?`}
                              run={() => api.delete(`/settings/legal/parameters/${r.id}`)}
                              success="Đã xoá"
                              onDone={reload}
                            />
                          )}
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="col-xl-5">
          <Card
            title={<h2 className="h6 mb-0"><i className="bi bi-shield-plus me-2 text-primary" />Tỷ lệ bảo hiểm bắt buộc</h2>}
            actions={<button className="btn btn-sm btn-outline-primary" onClick={() => setInsOpen(true)}>+ Mức mới</button>}
          >
            {insVersions.map((v, i) => (
              <div key={v.effectiveDate} className={i > 0 ? 'mt-3 text-body-secondary' : ''}>
                <div className="small fw-semibold mb-1">
                  Từ {date(v.effectiveDate)}
                  <EffectiveBadge current={isCurrent(insVersions, v)} future={v.effectiveDate.slice(0, 10) > today} />
                </div>
                <table className="table table-sm small mb-0">
                  <thead><tr><th>Loại</th><th className="num">NLĐ</th><th className="num">DN</th><th className="ps-4">Trần</th></tr></thead>
                  <tbody>
                    {v.rates.map((r) => (
                      <tr key={r.id}>
                        <td>{INS_LABEL[r.insuranceType]}</td>
                        <td className="num">{pct(r.employeeRate)}</td>
                        <td className="num">{pct(r.companyRate)}</td>
                        <td className="ps-4">{r.capMultiplier} × {r.capBase === 'BASE_SALARY' ? 'lương cơ sở' : 'lương tối thiểu vùng'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Card>

          <Card
            title={<h2 className="h6 mb-0"><i className="bi bi-bar-chart-steps me-2 text-primary" />Biểu thuế TNCN lũy tiến</h2>}
            actions={<button className="btn btn-sm btn-outline-primary" onClick={() => setBrOpen(true)}>+ Biểu mới</button>}
          >
            {data.bracketVersions.map((v, i) => (
              <div key={v.effectiveDate} className={i > 0 ? 'mt-3 text-body-secondary' : ''}>
                <div className="small fw-semibold mb-1">
                  Từ {date(v.effectiveDate)}
                  <EffectiveBadge current={isCurrent(data.bracketVersions, v)} future={v.effectiveDate.slice(0, 10) > today} />
                </div>
                <table className="table table-sm small mb-0">
                  <thead><tr><th>Bậc</th><th>Thu nhập tính thuế/tháng</th><th className="num">Thuế suất</th><th className="num">Số trừ nhanh</th></tr></thead>
                  <tbody>
                    {v.brackets.map((b) => (
                      <tr key={b.bracketNo}>
                        <td>{b.bracketNo}</td>
                        <td>{b.toAmount ? `${money(b.fromAmount)} – ${money(b.toAmount)}` : `trên ${money(b.fromAmount)}`}</td>
                        <td className="num">{pct(b.rate)}</td>
                        <td className="num">{money(b.quickDeduction)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {addParam && (
        <FormModal
          title={`Mức mới: ${data.codes[addParam]}`}
          fields={[
            { name: 'value', label: 'Giá trị (đồng)', type: 'number', required: true },
            { name: 'effectiveDate', label: 'Hiệu lực từ', type: 'date', required: true },
            { name: 'legalDocument', label: 'Căn cứ (số văn bản)', full: true },
          ]}
          initial={{ effectiveDate: today }}
          path="/settings/legal/parameters"
          transform={(b) => ({ ...b, paramCode: addParam })}
          successMessage="Đã thêm mức mới"
          onClose={() => setAddParam(null)}
          onSaved={() => {
            setAddParam(null);
            reload();
          }}
        />
      )}
      {insOpen && <InsuranceForm current={insVersions[0]?.rates ?? []} onClose={() => setInsOpen(false)} onSaved={() => { setInsOpen(false); reload(); }} />}
      {brOpen && <BracketsForm current={data.bracketVersions[0]?.brackets ?? []} onClose={() => setBrOpen(false)} onSaved={() => { setBrOpen(false); reload(); }} />}
    </>
  );
}

// ---------- Form tỷ lệ bảo hiểm (3 dòng) ----------
function InsuranceForm(props: { current: Rate[]; onClose: () => void; onSaved: () => void }) {
  const types: Rate['insuranceType'][] = ['SOCIAL', 'HEALTH', 'UNEMPLOYMENT'];
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [rows, setRows] = useState(
    types.map((t) => {
      const c = props.current.find((r) => r.insuranceType === t);
      return {
        type: t,
        employeeRate: c ? String(Number(c.employeeRate) * 100) : '',
        companyRate: c ? String(Number(c.companyRate) * 100) : '',
        capBase: c?.capBase ?? (t === 'UNEMPLOYMENT' ? 'MIN_WAGE_REGION' : 'BASE_SALARY'),
        capMultiplier: String(c?.capMultiplier ?? 20),
      };
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const set = (i: number, k: string, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/settings/legal/insurance', {
        effectiveDate,
        rates: rows.map((r) => ({
          type: r.type,
          employeeRate: Number(r.employeeRate) / 100,
          companyRate: Number(r.companyRate) / 100,
          capBase: r.capBase,
          capMultiplier: Number(r.capMultiplier),
        })),
      });
      toast('Đã lưu tỷ lệ bảo hiểm mới');
      props.onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Tỷ lệ bảo hiểm mới" onClose={props.onClose} width={720}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <label className="form-label">Hiệu lực từ</label>
        <input type="date" className="form-control mb-3" style={{ maxWidth: 200 }} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
        <table className="table table-sm align-middle">
          <thead><tr><th>Loại</th><th>NLĐ (%)</th><th>DN (%)</th><th>Trần</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.type}>
                <td className="fw-semibold">{INS_LABEL[r.type]}</td>
                <td><input className="form-control form-control-sm" type="number" step="0.01" value={r.employeeRate} onChange={(e) => set(i, 'employeeRate', e.target.value)} required /></td>
                <td><input className="form-control form-control-sm" type="number" step="0.01" value={r.companyRate} onChange={(e) => set(i, 'companyRate', e.target.value)} required /></td>
                <td>
                  <div className="input-group input-group-sm">
                    <input className="form-control" type="number" style={{ maxWidth: 70 }} value={r.capMultiplier} onChange={(e) => set(i, 'capMultiplier', e.target.value)} required />
                    <select className="form-select" value={r.capBase} onChange={(e) => set(i, 'capBase', e.target.value)}>
                      <option value="BASE_SALARY">× lương cơ sở</option>
                      <option value="MIN_WAGE_REGION">× lương tối thiểu vùng</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
          <button className="btn btn-primary">Lưu</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Form biểu thuế (số bậc thay đổi được) ----------
function BracketsForm(props: { current: Bracket[]; onClose: () => void; onSaved: () => void }) {
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [rows, setRows] = useState(
    props.current.map((b) => ({ to: b.toAmount ? String(Number(b.toAmount)) : '', rate: String(Number(b.rate) * 100) })),
  );
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const set = (i: number, k: 'to' | 'rate', v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const from = (i: number) => (i === 0 ? 0 : Number(rows[i - 1].to || 0));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/settings/legal/brackets', {
        effectiveDate,
        brackets: rows.map((r, i) => ({ from: from(i), to: i === rows.length - 1 ? null : Number(r.to), rate: Number(r.rate) / 100 })),
      });
      toast('Đã lưu biểu thuế mới');
      props.onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Biểu thuế TNCN mới" onClose={props.onClose} width={640}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <label className="form-label">Hiệu lực từ</label>
        <input type="date" className="form-control mb-3" style={{ maxWidth: 200 }} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
        <table className="table table-sm align-middle">
          <thead><tr><th>Bậc</th><th>Từ</th><th>Đến (trống = không giới hạn)</th><th>Thuế suất (%)</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="small">{money(from(i))}</td>
                <td>
                  {i === rows.length - 1 ? (
                    <span className="small text-body-secondary">không giới hạn</span>
                  ) : (
                    <input className="form-control form-control-sm" type="number" value={r.to} onChange={(e) => set(i, 'to', e.target.value)} required />
                  )}
                </td>
                <td><input className="form-control form-control-sm" type="number" step="0.01" value={r.rate} onChange={(e) => set(i, 'rate', e.target.value)} required /></td>
                <td>
                  {rows.length > 1 && (
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Xoá bậc">
                      <i className="bi bi-x" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setRows((rs) => [...rs.slice(0, -1), { ...rs[rs.length - 1], to: '' }, { to: '', rate: '' }])}>
          + Thêm bậc
        </button>
        <p className="small text-body-secondary mt-2 mb-0">Số trừ dùng cho cách tính nhanh được hệ thống tự tính.</p>
        <div className="d-flex justify-content-end gap-2 mt-3">
          <button type="button" className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
          <button className="btn btn-primary">Lưu</button>
        </div>
      </form>
    </Modal>
  );
}
