import { useState } from 'react';
import { DataTable, FormModal } from './ui';
import { useFetch } from '../lib/hooks';
import { date, time } from '../lib/format';

interface Suggestion {
  employmentId: string;
  codeEmp: string;
  fullName: string;
  workDate: string;
  checkIn: string;
  checkOut: string;
  minutes: number;
  hours: number;
  offDay: boolean;
  reason: string;
}

/**
 * Gợi ý đơn làm thêm giờ từ dữ liệu chấm công (ở lại sau giờ ca ≥ 60 phút, đi làm ngày nghỉ / lễ, chưa có đơn).
 * mode 'hr': tạo đơn hộ; 'me': nhân viên tự tạo. Đơn tạo ra vẫn phải được duyệt.
 */
export default function OvertimeSuggestions({ month, mode, onCreated }: { month: string; mode: 'hr' | 'me'; onCreated?: () => void }) {
  const path = mode === 'hr' ? `/attendance/overtime-suggestions?month=${month}` : `/me/overtime-suggestions?month=${month}`;
  const { data, loading, reload, error } = useFetch<Suggestion[]>(path, [month]);
  const [creating, setCreating] = useState<Suggestion | null>(null);
  if (error) return <div className="p-3 small text-body-secondary">{error}</div>;
  return (
    <>
      <DataTable
        rows={data}
        loading={loading}
        rowKey={(s) => `${s.employmentId}-${s.workDate}`}
        empty="Không có gợi ý — chưa có ngày nào ở lại sau giờ ca từ 60 phút mà chưa có đơn"
        columns={[
          ...(mode === 'hr' ? [{ header: 'Nhân viên', cell: (s: Suggestion) => <>{s.fullName}<div className="small text-body-secondary">{s.codeEmp}</div></> }] : []),
          { header: 'Ngày', cell: (s: Suggestion) => date(s.workDate), className: 'nowrap' },
          { header: 'Chấm công', cell: (s: Suggestion) => `${time(s.checkIn)} – ${time(s.checkOut)}` },
          { header: 'Lý do', cell: (s: Suggestion) => s.reason },
          { header: 'Đề xuất', cell: (s: Suggestion) => `${s.hours} giờ`, className: 'num' },
          { header: '', className: 'actions', cell: (s: Suggestion) => <button className="btn btn-sm btn-outline-primary" onClick={() => setCreating(s)}>Tạo đơn</button> },
        ]}
      />
      {creating && (
        <FormModal
          title={`Đơn làm thêm giờ${mode === 'hr' ? `: ${creating.fullName}` : ''} · ${date(creating.workDate)}`}
          fields={[
            { name: 'hours', label: 'Số giờ', type: 'number', required: true },
            { name: 'isNight', label: 'Làm ban đêm (22h – 6h)', type: 'checkbox' },
            { name: 'reason', label: 'Nội dung công việc', type: 'textarea', required: true },
          ]}
          initial={{ hours: creating.hours, reason: `${creating.reason} (theo dữ liệu chấm công ${time(creating.checkIn)} – ${time(creating.checkOut)})` }}
          path={mode === 'hr' ? '/attendance/overtime' : '/me/overtime'}
          transform={(b) => ({ ...b, workDate: creating.workDate, ...(mode === 'hr' ? { employmentId: creating.employmentId } : {}) })}
          submitLabel="Tạo đơn"
          successMessage="Đã tạo đơn (chờ duyệt)"
          onClose={() => setCreating(null)}
          onSaved={() => {
            setCreating(null);
            reload();
            onCreated?.();
          }}
        />
      )}
    </>
  );
}
