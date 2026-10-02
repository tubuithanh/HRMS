import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { ErrorBox, Loading, Modal, useToast } from '../../components/ui';
import { date } from '../../lib/format';

export const RATING: Record<string, [string, string]> = {
  A: ['Xuất sắc', 'text-bg-success'],
  B: ['Tốt', 'text-bg-primary'],
  C: ['Đạt', 'text-bg-warning'],
  D: ['Chưa đạt', 'text-bg-danger'],
};
export const REVIEW_STATUS: Record<string, [string, string]> = {
  SELF: ['Chờ tự đánh giá', 'text-bg-light border'],
  MANAGER: ['Chờ quản lý chấm', 'text-bg-info'],
  DONE: ['Hoàn tất', 'text-bg-success'],
};
export const RatingBadge = ({ rating }: { rating: string | null }) =>
  rating ? <span className={`badge ${RATING[rating][1]}`}>{rating} · {RATING[rating][0]}</span> : <span className="text-body-tertiary">—</span>;
export const StatusBadge = ({ status }: { status: string }) => <span className={`badge ${REVIEW_STATUS[status]?.[1] ?? ''}`}>{REVIEW_STATUS[status]?.[0] ?? status}</span>;

interface Goal {
  title: string;
  weight: number;
  selfScore: number | null;
  managerScore: number | null;
  comment: string | null;
}
interface Review {
  id: string;
  status: string;
  goals: Goal[];
  selfComment: string | null;
  managerComment: string | null;
  selfScore: string | null;
  finalScore: string | null;
  rating: string | null;
  canSelf: boolean;
  canManage: boolean;
  employment: { codeEmp: string; person: { fullName: string } };
  reviewer: { person: { fullName: string } } | null;
  cycle: { name: string; dueDate: string; status: string };
}

const SCORES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const weighted = (goals: Goal[], key: 'selfScore' | 'managerScore') => {
  const w = goals.reduce((s, g) => s + g.weight, 0);
  if (!w || goals.some((g) => g[key] === null)) return null;
  return Math.round((goals.reduce((s, g) => s + (g[key] as number) * g.weight, 0) / w) * 100) / 100;
};

function ScoreSelect(props: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  return (
    <select className="form-select form-select-sm" style={{ width: 80 }} value={props.value ?? ''} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">—</option>
      {SCORES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

/** Phiếu đánh giá: base = '/me' (nhân viên, quản lý) hoặc '/people' (nhân sự). */
export default function ReviewForm(props: { id: string; base: '/me' | '/people'; onClose: () => void; onDone: () => void }) {
  const [r, setR] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    api.get<{ data: Review }>(`${props.base}/reviews/${props.id}`).then((x) => setR(x.data.data)).catch((e) => setError(errorMessage(e)));
  }, [props.id, props.base]);

  const setGoal = (i: number, patch: Partial<Goal>) => setR((x) => (x ? { ...x, goals: x.goals.map((g, k) => (k === i ? { ...g, ...patch } : g)) } : x));

  async function save(submit: boolean) {
    if (!r) return;
    setBusy(true);
    setError(null);
    try {
      if (r.canSelf) {
        await api.put(`${props.base}/reviews/${r.id}/self`, { goals: r.goals.map((g) => ({ selfScore: g.selfScore, comment: g.comment })), selfComment: r.selfComment, submit });
      } else {
        await api.put(`${props.base}/reviews/${r.id}/manager`, { goals: r.goals.map((g) => ({ managerScore: g.managerScore })), managerComment: r.managerComment, submit });
      }
      toast(submit ? (r.canSelf ? 'Đã nộp tự đánh giá' : 'Đã hoàn tất đánh giá') : 'Đã lưu nháp');
      props.onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const selfAvg = r ? weighted(r.goals, 'selfScore') : null;
  const mgrAvg = r ? weighted(r.goals, 'managerScore') : null;
  const showManager = r && (r.canManage || r.status === 'DONE' || r.goals.some((g) => g.managerScore !== null));

  return (
    <Modal title={r ? `${r.cycle.name} · ${r.employment.person.fullName}` : 'Phiếu đánh giá'} onClose={props.onClose} width={900}>
      <ErrorBox error={error} />
      {!r ? (
        !error && <Loading />
      ) : (
        <>
          <div className="d-flex flex-wrap gap-3 small mb-3">
            <span><StatusBadge status={r.status} /></span>
            <span>Quản lý chấm: <strong>{r.reviewer?.person.fullName ?? 'Nhân sự'}</strong></span>
            <span>Hạn: {date(r.cycle.dueDate)}</span>
            {r.rating && <span>Kết quả: <RatingBadge rating={r.rating} /> ({Number(r.finalScore)})</span>}
          </div>
          <table className="table table-sm align-middle">
            <thead className="table-light">
              <tr>
                <th>Mục tiêu</th>
                <th className="num" style={{ width: 80 }}>Trọng số</th>
                <th style={{ width: 90 }}>Tự chấm</th>
                {showManager && <th style={{ width: 90 }}>Quản lý</th>}
                <th>Nhận xét / kết quả đạt được</th>
              </tr>
            </thead>
            <tbody>
              {r.goals.map((g, i) => (
                <tr key={i}>
                  <td>{g.title}</td>
                  <td className="num">{g.weight}%</td>
                  <td>{r.canSelf ? <ScoreSelect value={g.selfScore} onChange={(v) => setGoal(i, { selfScore: v })} /> : g.selfScore ?? '—'}</td>
                  {showManager && <td>{r.canManage ? <ScoreSelect value={g.managerScore} onChange={(v) => setGoal(i, { managerScore: v })} /> : g.managerScore ?? '—'}</td>}
                  <td>
                    {r.canSelf ? (
                      <input className="form-control form-control-sm" value={g.comment ?? ''} onChange={(e) => setGoal(i, { comment: e.target.value })} />
                    ) : (
                      <span className="small">{g.comment ?? ''}</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="fw-semibold table-light">
                <td>Điểm bình quân (thang 5)</td>
                <td className="num">100%</td>
                <td>{selfAvg ?? '—'}</td>
                {showManager && <td>{mgrAvg ?? '—'}</td>}
                <td className="small fw-normal text-body-secondary">A ≥ 4,5 · B ≥ 3,5 · C ≥ 2,5 · D &lt; 2,5</td>
              </tr>
            </tbody>
          </table>
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label small">Ý kiến của người được đánh giá</label>
              <textarea className="form-control form-control-sm" rows={3} disabled={!r.canSelf} value={r.selfComment ?? ''} onChange={(e) => setR({ ...r, selfComment: e.target.value })} />
            </div>
            {showManager && (
              <div className="col-md-6">
                <label className="form-label small">Nhận xét của quản lý</label>
                <textarea className="form-control form-control-sm" rows={3} disabled={!r.canManage} value={r.managerComment ?? ''} onChange={(e) => setR({ ...r, managerComment: e.target.value })} />
              </div>
            )}
          </div>
          <div className="d-flex justify-content-end gap-2 mt-3">
            <button className="btn btn-outline-secondary" onClick={props.onClose}>Đóng</button>
            {(r.canSelf || r.canManage) && (
              <>
                <button className="btn btn-outline-primary" disabled={busy} onClick={() => save(false)}>Lưu nháp</button>
                <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>{r.canSelf ? 'Nộp tự đánh giá' : 'Hoàn tất đánh giá'}</button>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
