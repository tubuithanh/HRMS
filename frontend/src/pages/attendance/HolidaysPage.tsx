import { useState } from 'react';
import { api } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Card, DataTable, ErrorBox, FormModal, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date } from '../../lib/format';
import { Holiday } from '../../types/models';

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export default function HolidaysPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const canWrite = useCanWrite('attendance');
  const { data, error, loading, reload } = useFetch<Holiday[]>(`/attendance/holidays?year=${year}`);

  return (
    <>
      <PageHeader
        title="Ngày nghỉ lễ, Tết"
        subtitle="Ngày lễ được tính là ngày có lương trên bảng công, không trừ phép; làm thêm vào ngày lễ hưởng 300%."
        actions={
          <>
            <div className="btn-group">
              <button className="btn btn-outline-secondary" onClick={() => setYear(year - 1)} aria-label="Năm trước">‹</button>
              <span className="btn btn-outline-secondary disabled">{year}</span>
              <button className="btn btn-outline-secondary" onClick={() => setYear(year + 1)} aria-label="Năm sau">›</button>
            </div>
            {canWrite && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Ngày lễ</button>}
          </>
        }
      />
      <Card flush>
        <ErrorBox error={error} />
        <DataTable
          rows={data}
          loading={loading}
          rowKey={(h) => h.id}
          empty={`Chưa có ngày lễ nào cho năm ${year}`}
          columns={[
            { header: 'Ngày', cell: (h) => date(h.date), className: 'nowrap' },
            { header: 'Thứ', cell: (h) => WEEKDAYS[new Date(h.date).getUTCDay()] },
            { header: 'Tên', cell: (h) => h.name },
            {
              header: '',
              className: 'actions',
              cell: (h) =>
                canWrite && (
                  <ActionButton
                    label="Xoá"
                    className="btn btn-sm btn-outline-danger"
                    confirm={`Xoá ngày lễ ${date(h.date)}?`}
                    run={() => api.delete(`/attendance/holidays/${h.id}`)}
                    onDone={reload}
                  />
                ),
            },
          ]}
        />
        <div className="card-body border-top small muted">
          Tết Âm lịch, Giỗ Tổ Hùng Vương và ngày nghỉ bù thay đổi theo từng năm — bổ sung theo thông báo của Bộ Lao động – Thương binh và Xã hội.
          Sau khi thêm ngày lễ của tháng đã tính lương, hãy tính lại kỳ lương đó.
        </div>
      </Card>
      {adding && (
        <FormModal
          title="Thêm ngày lễ"
          fields={[
            { name: 'date', label: 'Ngày', type: 'date', required: true },
            { name: 'name', label: 'Tên', required: true, placeholder: 'Tết Nguyên đán, Nghỉ bù…' },
          ]}
          initial={{ date: `${year}-01-01` }}
          path="/attendance/holidays"
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); reload(); }}
        />
      )}
    </>
  );
}
