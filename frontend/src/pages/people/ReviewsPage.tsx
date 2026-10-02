import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useCanWrite } from '../../auth';
import EmployeePicker from '../../components/EmployeePicker';
import { ActionButton, Card, DataTable, ErrorBox, Loading, Modal, PageHeader, useToast } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, todayISO } from '../../lib/format';
import ReviewForm, { RATING, RatingBadge, StatusBadge } from './ReviewForm';

interface Cycle {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
  dueDate: string;
  status: string;
  counts: Record<string, number>;
}

const DEFAULT_GOALS = [
  { title: 'Hoàn thành khối lượng, chất lượng công việc', weight: 50 },
  { title: 'Tiến độ, đúng hạn', weight: 20 },
  { title: 'Phối hợp, tinh thần làm việc', weight: 20 },
  { title: 'Tuân thủ nội quy, an toàn', weight: 10 },
];

function CreateCycle(props: { onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState('');
  const [fromDate, setFrom] = useState(todayISO().slice(0, 8) + '01');
  const [toDate, setTo] = useState(todayISO());
  const [dueDate, setDue] = useState(todayISO());
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [everyone, setEveryone] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const total = goals.reduce((s, g) => s + (Number(g.weight) || 0), 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/people/review-cycles', {
        name,
        fromDate,
        toDate,
        dueDate,
        goalTemplate: goals.map((g) => ({ title: g.title, weight: Number(g.weight) })),
        employmentIds: everyone ? undefined : ids,
      });
      toast(`Đã mở kỳ đánh giá cho ${r.data.data.reviewCount} người — đã gửi thông báo tự đánh giá`);
      props.onDone(r.data.data.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="Mở kỳ đánh giá" onClose={props.onClose} width={900}>
      <ErrorBox error={error} />
      <div className="row g-3">
        <div className="col-lg-7">
          <label className="form-label">Tên kỳ <span className="text-danger">*</span></label>
          <input className="form-control mb-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Đánh giá quý 4/2026" />
          <div className="row g-2 mb-3">
            <div className="col-4"><label className="form-label small">Từ ngày</label><input type="date" className="form-control" value={fromDate} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="col-4"><label className="form-label small">Đến ngày</label><input type="date" className="form-control" value={toDate} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="col-4"><label className="form-label small">Hạn hoàn thành</label><input type="date" className="form-control" value={dueDate} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          <label className="form-label">Mục tiêu đánh giá (tổng trọng số 100)</label>
          <table className="table table-sm align-middle mb-1">
            <tbody>
              {goals.map((g, i) => (
                <tr key={i}>
                  <td><input className="form-control form-control-sm" value={g.title} onChange={(e) => setGoals(goals.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} /></td>
                  <td style={{ width: 90 }}><input type="number" className="form-control form-control-sm" value={g.weight} onChange={(e) => setGoals(goals.map((x, k) => (k === i ? { ...x, weight: Number(e.target.value) } : x)))} /></td>
                  <td style={{ width: 40 }}><button className="btn btn-sm btn-light text-danger" onClick={() => setGoals(goals.filter((_, k) => k !== i))} aria-label="Xoá mục"><i className="bi bi-x-lg" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="d-flex justify-content-between small">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setGoals([...goals, { title: '', weight: 0 }])}>+ Thêm mục tiêu</button>
            <span className={total === 100 ? 'text-success' : 'text-danger'}>Tổng: {total}</span>
          </div>
        </div>
        <div className="col-lg-5">
          <label className="form-label">Người được đánh giá</label>
          <div className="mb-2">
            <label className="form-check form-check-inline"><input type="radio" className="form-check-input" checked={everyone} onChange={() => setEveryone(true)} /><span className="form-check-label">Tất cả nhân viên đang làm</span></label>
            <label className="form-check form-check-inline"><input type="radio" className="form-check-input" checked={!everyone} onChange={() => setEveryone(false)} /><span className="form-check-label">Chọn người</span></label>
          </div>
          {!everyone && <EmployeePicker value={ids} onChange={setIds} height={300} />}
          <div className="form-text">Quản lý chấm là quản lý trực tiếp theo sơ đồ tổ chức; người không có quản lý sẽ do nhân sự chấm.</div>
        </div>
      </div>
      <div className="d-flex justify-content-end gap-2 mt-3">
        <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
        <button className="btn btn-primary" disabled={busy || !name.trim() || total !== 100 || (!everyone && ids.length === 0)} onClick={submit}>{busy ? 'Đang tạo…' : 'Mở kỳ đánh giá'}</button>
      </div>
    </Modal>
  );
}

export default function ReviewsPage() {
  const canWrite = useCanWrite('corehr');
  const [creating, setCreating] = useState(false);
  const list = useFetch<Cycle[]>('/people/review-cycles');
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Đánh giá hiệu suất" actions={canWrite && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Mở kỳ đánh giá</button>} />
      <Card flush>
        <ErrorBox error={list.error} />
        <DataTable
          rows={list.data}
          loading={list.loading}
          rowKey={(c) => c.id}
          empty="Chưa có kỳ đánh giá"
          columns={[
            { header: 'Kỳ đánh giá', cell: (c) => <Link to={`/reviews/${c.id}`}>{c.name}</Link> },
            { header: 'Giai đoạn', cell: (c) => `${date(c.fromDate)} – ${date(c.toDate)}`, className: 'nowrap' },
            { header: 'Hạn', cell: (c) => date(c.dueDate) },
            {
              header: 'Tiến độ',
              cell: (c) => {
                const total = (c.counts.SELF ?? 0) + (c.counts.MANAGER ?? 0) + (c.counts.DONE ?? 0);
                const done = c.counts.DONE ?? 0;
                return (
                  <div style={{ minWidth: 180 }}>
                    <div className="progress" style={{ height: 8 }} role="progressbar" aria-valuenow={done} aria-valuemax={total}>
                      <div className="progress-bar bg-success" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                    </div>
                    <div className="small text-body-secondary">{done}/{total} hoàn tất · {c.counts.MANAGER ?? 0} chờ quản lý · {c.counts.SELF ?? 0} chờ tự đánh giá</div>
                  </div>
                );
              },
            },
            { header: 'Trạng thái', cell: (c) => (c.status === 'OPEN' ? <span className="badge text-bg-primary">Đang mở</span> : <span className="badge text-bg-secondary">Đã đóng</span>) },
          ]}
        />
      </Card>
      {creating && <CreateCycle onClose={() => setCreating(false)} onDone={(id) => navigate(`/reviews/${id}`)} />}
    </>
  );
}

interface ReviewRow {
  id: string;
  status: string;
  selfScore: string | null;
  finalScore: string | null;
  rating: string | null;
  employment: { codeEmp: string; person: { id: string; fullName: string } };
  reviewer: { person: { fullName: string } } | null;
}

export function ReviewCyclePage() {
  const { id } = useParams();
  const canWrite = useCanWrite('corehr');
  const cycle = useFetch<Cycle & { reviews: ReviewRow[]; distribution: Record<string, number> }>(`/people/review-cycles/${id}`);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();
  const c = cycle.data;
  if (cycle.error) return <ErrorBox error={cycle.error} />;
  if (!c) return <Loading />;
  const done = c.reviews.filter((r) => r.rating).length;
  const rows = c.reviews.filter((r) => !filter || r.status === filter);
  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={<><Link to="/reviews">← Kỳ đánh giá</Link> · {date(c.fromDate)} – {date(c.toDate)} · hạn {date(c.dueDate)}</>}
        actions={
          canWrite && (
            <>
              <ActionButton
                className="btn btn-outline-secondary"
                label={c.status === 'OPEN' ? 'Đóng kỳ' : 'Mở lại kỳ'}
                confirm={c.status === 'OPEN' ? 'Đóng kỳ đánh giá? Không ai sửa được phiếu nữa.' : undefined}
                run={() => api.post(`/people/review-cycles/${c.id}/close`, { close: c.status === 'OPEN' })}
                onDone={cycle.reload}
              />
              <ActionButton
                className="btn btn-outline-danger"
                label="Xoá kỳ"
                confirm="Xoá kỳ đánh giá? (chỉ khi chưa ai nộp)"
                run={() => api.delete(`/people/review-cycles/${c.id}`)}
                onDone={() => navigate('/reviews')}
              />
            </>
          )
        }
      />
      <div className="row g-3 mb-3">
        {Object.entries(RATING).map(([k, [label]]) => {
          const n = c.distribution[k] ?? 0;
          return (
            <div key={k} className="col-6 col-md-3">
              <div className="card card-body py-2">
                <div className="small text-body-secondary"><RatingBadge rating={k} /></div>
                <div className="fs-4 fw-semibold">{n} <span className="fs-6 text-body-secondary">người · {done ? Math.round((n / done) * 100) : 0}%</span></div>
                <div className="small text-body-tertiary">{label}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Card
        flush
        title={`Phiếu đánh giá (${c.reviews.length})`}
        actions={
          <select className="form-select form-select-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Mọi trạng thái</option>
            <option value="SELF">Chờ tự đánh giá</option>
            <option value="MANAGER">Chờ quản lý chấm</option>
            <option value="DONE">Hoàn tất</option>
          </select>
        }
      >
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: 'Mã NV', cell: (r) => r.employment.codeEmp },
            { header: 'Họ tên', cell: (r) => r.employment.person.fullName },
            { header: 'Quản lý chấm', cell: (r) => r.reviewer?.person.fullName ?? <span className="text-body-secondary">Nhân sự</span> },
            { header: 'Trạng thái', cell: (r) => <StatusBadge status={r.status} /> },
            { header: 'Tự chấm', cell: (r) => (r.selfScore ? Number(r.selfScore) : '—'), className: 'num' },
            { header: 'Điểm cuối', cell: (r) => (r.finalScore ? Number(r.finalScore) : '—'), className: 'num' },
            { header: 'Xếp loại', cell: (r) => <RatingBadge rating={r.rating} /> },
            {
              header: '',
              className: 'actions',
              cell: (r) => (
                <div className="d-flex gap-1 justify-content-end">
                  <button className="btn btn-sm btn-outline-primary" onClick={() => setOpen(r.id)}>{!r.reviewer && r.status === 'MANAGER' && canWrite ? 'Chấm' : 'Xem'}</button>
                  {canWrite && r.status !== 'SELF' && c.status === 'OPEN' && (
                    <ActionButton label="Mở lại" confirm="Trả phiếu về bước tự đánh giá?" run={() => api.post(`/people/reviews/${r.id}/reopen`)} onDone={cycle.reload} />
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {open && <ReviewForm id={open} base="/people" onClose={() => setOpen(null)} onDone={() => { setOpen(null); cycle.reload(); }} />}
    </>
  );
}
