import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { ErrorBox, Modal, useToast } from '../../components/ui';
import { date, money, todayISO } from '../../lib/format';

const TYPES: Record<string, string> = {
  RESIGN: 'Người lao động xin nghỉ',
  CONTRACT_END: 'Hết hạn hợp đồng',
  MUTUAL: 'Hai bên thoả thuận',
  REDUNDANCY: 'Mất việc (thay đổi cơ cấu, công nghệ, kinh tế)',
  DISMISS: 'Sa thải (kỷ luật)',
  RETIRE: 'Nghỉ hưu',
};

interface Figures {
  totalWorkedMonths: number;
  unemploymentInsuredMonths: number;
  avgSalary6Months: number;
  unusedLeaveDays: number;
}

interface Preview {
  employee: { fullName: string; codeEmp: string; dateHire: string };
  suggested: Figures & { remainingAdvance: number };
  settlement: {
    eligibility: { eligible: boolean; isRedundancy: boolean; reason: string | null };
    severanceYears: string;
    severanceAmount: string;
    unusedLeaveAmount: string;
    total: string;
  };
  account: { username: string; isActive: boolean } | null;
  period: { code: string; status: string } | null;
  lockedUntil: string | null;
  trainingRefunds: { items: Array<{ courseId: string; code: string; name: string; commitmentEnd: string; refund: number }>; total: number };
}

/**
 * Cho nghỉ việc: chọn ngày + lý do, xem trước quyết toán (sửa được số liệu),
 * xác nhận → hệ thống kết thúc vị trí, hợp đồng, phụ cấp, huỷ đơn sau ngày nghỉ,
 * khoá tài khoản và đưa quyết toán vào kỳ lương.
 */
export default function OffboardModal(props: { employmentId: string; onClose: () => void; onDone: () => void }) {
  const [dateTerminate, setDateTerminate] = useState(todayISO());
  const [type, setType] = useState('RESIGN');
  const [note, setNote] = useState('');
  const [figures, setFigures] = useState<Figures | null>(null);
  const [edited, setEdited] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lockAccount, setLockAccount] = useState(true);
  const [includeInPayroll, setIncludeInPayroll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Xem trước: đổi ngày / lý do → lấy lại số liệu gợi ý; sửa số liệu → tính lại theo số đã sửa.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams({ date: dateTerminate, type });
      if (edited && figures) for (const [k, v] of Object.entries(figures)) q.set(k, String(v));
      api
        .get<{ data: Preview }>(`/corehr/employments/${props.employmentId}/offboarding-preview?${q}`)
        .then((res) => {
          setPreview(res.data.data);
          if (!edited) setFigures(res.data.data.suggested);
          setError(null);
        })
        .catch((err) => setError(errorMessage(err)));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateTerminate, type, edited, figures && JSON.stringify(figures)]);

  const setFigure = (k: keyof Figures, v: string) => {
    setEdited(true);
    setFigures((f) => (f ? { ...f, [k]: Number(v) || 0 } : f));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!figures) return;
    if (!window.confirm('Xác nhận cho nhân viên nghỉ việc? Thao tác này kết thúc vị trí, hợp đồng và khoá tài khoản.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/corehr/employments/${props.employmentId}/offboard`, {
        dateTerminate,
        type,
        note: note || undefined,
        lockAccount,
        includeInPayroll,
        trainingRefund: p?.trainingRefunds.total ?? 0,
        ...figures,
      });
      const r = res.data.data;
      toast(`Đã cho nghỉ việc${r.paidIn ? ` · quyết toán vào kỳ ${r.paidIn}` : ''}${r.accountLocked ? ' · đã khoá tài khoản' : ''}`);
      props.onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const p = preview;
  const periodOpen = p?.period && p.period.status !== 'LOCKED' && p.period.status !== 'PAID';

  return (
    <Modal title={`Cho nghỉ việc${p ? `: ${p.employee.fullName}` : ''}`} onClose={props.onClose} width={760}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Ngày nghỉ việc (ngày làm cuối) <span className="text-danger">*</span></label>
            <input type="date" className="form-control" value={dateTerminate} onChange={(e) => setDateTerminate(e.target.value)} required />
          </div>
          <div className="col-md-8">
            <label className="form-label">Lý do <span className="text-danger">*</span></label>
            <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">Ghi chú</label>
            <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Số quyết định, lý do chi tiết…" />
          </div>
        </div>

        {figures && p && (
          <>
            <h3 className="h6 mt-4 mb-2">Quyết toán {edited && <span className="badge text-bg-warning ms-1">đã sửa số liệu</span>}</h3>
            <div className="row g-2 small">
              {([
                ['totalWorkedMonths', 'Tổng thời gian làm việc (tháng)'],
                ['unemploymentInsuredMonths', 'Đã đóng BHTN (tháng)'],
                ['avgSalary6Months', 'Lương bình quân 6 tháng'],
                ['unusedLeaveDays', 'Số ngày phép chưa nghỉ'],
              ] as Array<[keyof Figures, string]>).map(([k, label]) => (
                <div key={k} className="col-6 col-md-3">
                  <label className="form-label mb-1">{label}</label>
                  <input type="number" step="any" className="form-control form-control-sm" value={figures[k]} onChange={(e) => setFigure(k, e.target.value)} />
                </div>
              ))}
            </div>
            <p className="small text-body-secondary mt-1 mb-2">
              Số tháng đóng BHTN là ước tính (toàn bộ thời gian trừ thử việc) — đối chiếu sổ BHXH. Vào làm {date(p.employee.dateHire)}.
            </p>
            <table className="table table-sm mb-2">
              <tbody>
                <tr>
                  <td>
                    {p.settlement.eligibility.isRedundancy ? 'Trợ cấp mất việc (1 tháng lương/năm, tối thiểu 2 tháng)' : 'Trợ cấp thôi việc (½ tháng lương/năm)'}
                    <div className="small text-body-secondary">
                      {p.settlement.eligibility.eligible ? `${p.settlement.severanceYears} năm được tính (sau khi trừ thời gian đóng BHTN) · miễn thuế TNCN` : p.settlement.eligibility.reason}
                    </div>
                  </td>
                  <td className="num">{money(p.settlement.severanceAmount)}</td>
                </tr>
                <tr>
                  <td>
                    Tiền phép năm chưa nghỉ
                    <div className="small text-body-secondary">{figures.unusedLeaveDays} ngày × lương ngày (lương BQ / 26)</div>
                  </td>
                  <td className="num">{money(p.settlement.unusedLeaveAmount)}</td>
                </tr>
                <tr className="table-light fw-bold">
                  <td>Tổng quyết toán</td>
                  <td className="num">{money(p.settlement.total)}</td>
                </tr>
              </tbody>
            </table>
            {p.trainingRefunds.total > 0 && (
              <div className="alert alert-warning small py-2">
                Bồi hoàn chi phí đào tạo (chưa hết thời gian cam kết): <strong>{money(p.trainingRefunds.total)}đ</strong> — trừ vào kỳ lương cuối.
                <ul className="mb-0 mt-1">
                  {p.trainingRefunds.items.map((t) => (
                    <li key={t.courseId}>{t.code} · {t.name}: {money(t.refund)}đ (cam kết đến {date(t.commitmentEnd)})</li>
                  ))}
                </ul>
              </div>
            )}
            {p.suggested.remainingAdvance > 0 && (
              <div className="alert alert-warning small py-2">Còn {money(p.suggested.remainingAdvance)}đ tạm ứng chưa trừ — sẽ trừ hết trong kỳ lương cuối.</div>
            )}

            <div className="d-flex flex-column gap-1 small">
              <label className="form-check">
                <input type="checkbox" className="form-check-input" checked={includeInPayroll} disabled={!periodOpen} onChange={(e) => setIncludeInPayroll(e.target.checked)} />
                <span className="form-check-label">
                  {p.period
                    ? periodOpen
                      ? `Đưa quyết toán vào kỳ lương ${p.period.code} (tính lại kỳ sau khi xác nhận)`
                      : `Kỳ lương ${p.period.code} đã khoá — nhập quyết toán thủ công`
                    : 'Chưa có kỳ lương chứa ngày nghỉ việc — tạo kỳ rồi thêm khoản phát sinh'}
                </span>
              </label>
              <label className="form-check">
                <input type="checkbox" className="form-check-input" checked={lockAccount && !!p.account} disabled={!p.account} onChange={(e) => setLockAccount(e.target.checked)} />
                <span className="form-check-label">
                  {p.account ? `Khoá tài khoản đăng nhập "${p.account.username}"` : 'Nhân viên không có tài khoản đăng nhập'}
                </span>
              </label>
            </div>
          </>
        )}

        <div className="alert alert-light border small mt-3 mb-0">
          Khi xác nhận: trạng thái → <strong>Đã nghỉ việc</strong>, vị trí công việc kết thúc (vị trí trở về trống), hợp đồng lao động chấm dứt,
          phụ cấp cố định dừng, đơn nghỉ / làm thêm sau ngày nghỉ bị huỷ.
        </div>
        <div className="d-flex justify-content-end gap-2 mt-3">
          <button type="button" className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
          <button className="btn btn-danger" disabled={busy || !figures}>{busy ? 'Đang xử lý…' : 'Xác nhận nghỉ việc'}</button>
        </div>
      </form>
    </Modal>
  );
}
