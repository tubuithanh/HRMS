import { useState } from 'react';
import { Card, DataTable, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date } from '../../lib/format';
import ReviewForm, { RatingBadge, StatusBadge } from '../people/ReviewForm';
import { SelfServiceError } from './MyProfilePage';

interface Row {
  id: string;
  status: string;
  finalScore: string | null;
  rating: string | null;
  employment: { codeEmp: string; person: { fullName: string } };
  cycle: { name: string; dueDate: string; status: string };
}

/** Đánh giá của tôi (tự đánh giá) và phiếu tôi cần chấm (nếu là quản lý). */
export default function MyReviewsPage() {
  const { data, error, loading, reload } = useFetch<{ own: Row[]; toReview: Row[] }>('/me/reviews');
  const [open, setOpen] = useState<string | null>(null);
  const pending = data?.toReview.filter((r) => r.status === 'MANAGER' && r.cycle.status === 'OPEN') ?? [];
  return (
    <>
      <PageHeader title="Đánh giá hiệu suất" />
      <SelfServiceError error={error} />
      <Card flush title="Phiếu của tôi">
        <DataTable
          rows={data?.own ?? null}
          loading={loading}
          rowKey={(r) => r.id}
          empty="Chưa có kỳ đánh giá nào"
          columns={[
            { header: 'Kỳ đánh giá', cell: (r) => r.cycle.name },
            { header: 'Hạn', cell: (r) => date(r.cycle.dueDate) },
            { header: 'Trạng thái', cell: (r) => <StatusBadge status={r.status} /> },
            { header: 'Kết quả', cell: (r) => (r.status === 'DONE' ? <><RatingBadge rating={r.rating} /> <span className="small">({Number(r.finalScore)})</span></> : '—') },
            {
              header: '',
              className: 'actions',
              cell: (r) => (
                <button className={`btn btn-sm ${r.status === 'SELF' && r.cycle.status === 'OPEN' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setOpen(r.id)}>
                  {r.status === 'SELF' && r.cycle.status === 'OPEN' ? 'Tự đánh giá' : 'Xem'}
                </button>
              ),
            },
          ]}
        />
      </Card>
      {(data?.toReview.length ?? 0) > 0 && (
        <Card flush title={`Nhân viên cần đánh giá${pending.length ? ` (${pending.length} chờ chấm)` : ''}`}>
          <DataTable
            rows={data!.toReview}
            rowKey={(r) => r.id}
            columns={[
              { header: 'Kỳ', cell: (r) => r.cycle.name },
              { header: 'Nhân viên', cell: (r) => `${r.employment.codeEmp} · ${r.employment.person.fullName}` },
              { header: 'Trạng thái', cell: (r) => <StatusBadge status={r.status} /> },
              { header: 'Xếp loại', cell: (r) => <RatingBadge rating={r.rating} /> },
              {
                header: '',
                className: 'actions',
                cell: (r) => (
                  <button className={`btn btn-sm ${r.status === 'MANAGER' && r.cycle.status === 'OPEN' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setOpen(r.id)}>
                    {r.status === 'MANAGER' && r.cycle.status === 'OPEN' ? 'Chấm điểm' : 'Xem'}
                  </button>
                ),
              },
            ]}
          />
        </Card>
      )}
      {open && <ReviewForm id={open} base="/me" onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} />}
    </>
  );
}
