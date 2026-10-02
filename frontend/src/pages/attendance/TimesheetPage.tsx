import { useState } from 'react';
import { useCanWrite } from '../../auth';
import { Card, ErrorBox, FieldDef, FormModal, Loading, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { currentMonth, date, labels, options } from '../../lib/format';
import { AttendanceStatus, TimesheetRow } from '../../types/models';

export const statusLetter: Record<AttendanceStatus, string> = {
  PRESENT: 'X',
  LATE: 'M',
  REMOTE: 'R',
  ABSENT: 'V',
  LEAVE: 'P',
  HOLIDAY: 'L',
};

export function Legend() {
  return (
    <div className="toolbar" style={{ fontSize: 12 }}>
      {(Object.keys(statusLetter) as AttendanceStatus[]).map((s) => (
        <span key={s} className="toolbar" style={{ gap: 4 }}>
          <span className={`ts-cell ts-${s}`} style={{ cursor: 'default', textAlign: 'center' }}>{statusLetter[s]}</span>
          {labels.attendance[s]}
        </span>
      ))}
    </div>
  );
}

/** Danh sách ngày YYYY-MM-DD của tháng. */
export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function isWeekendISO(d: string): boolean {
  const day = new Date(`${d}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

const recordFields: FieldDef[] = [
  { name: 'status', label: 'Trạng thái', type: 'select', required: true, options: options(labels.attendance) },
  { name: 'checkIn', label: 'Giờ vào', type: 'datetime', nullable: true },
  { name: 'checkOut', label: 'Giờ ra', type: 'datetime', nullable: true },
  { name: 'note', label: 'Ghi chú', nullable: true, full: true },
];

export default function TimesheetPage() {
  const [month, setMonth] = useState(currentMonth());
  const [editing, setEditing] = useState<{ row: TimesheetRow; day: string } | null>(null);
  const canWrite = useCanWrite('attendance');
  const { data, error, loading, reload } = useFetch<{ rows: TimesheetRow[] }>(`/attendance/timesheet?month=${month}`);
  const days = daysOfMonth(month);

  return (
    <>
      <PageHeader
        title="Bảng công"
        subtitle="Tổng hợp chấm công và nghỉ phép đã duyệt theo tháng"
        actions={<input type="month" className="form-control" style={{ width: 'auto' }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
      />
      <div style={{ marginBottom: 12 }}><Legend /></div>
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <Card flush>
          {data && data.rows.length === 0 ? (
            <div className="empty">Không có nhân viên nào làm việc trong tháng này</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-bordered table-sm ts-table mb-0">
                <thead>
                  <tr>
                    <th className="name">Nhân viên</th>
                    {days.map((d) => (
                      <th key={d} className={isWeekendISO(d) ? 'ts-weekend' : ''}>{Number(d.slice(8))}</th>
                    ))}
                    <th title="Ngày công chuẩn">Chuẩn</th>
                    <th title="Đi làm + muộn + từ xa">Làm</th>
                    <th title="Phép có lương">Phép</th>
                    <th title="Nghỉ không lương">KL</th>
                    <th title="Vắng không phép">Vắng</th>
                    <th title="Ngày công hưởng lương">Hưởng lương</th>
                    <th title="Giờ làm thêm đã duyệt">Giờ OT</th>
                    <th title="Tổng phút đi muộn / về sớm theo ca">Muộn/sớm</th>
                    <th title="Giờ làm ban đêm 22:00 – 06:00 (phụ cấp làm đêm)">Giờ đêm</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((r) => (
                    <tr key={r.employmentId}>
                      <td className="name">
                        {r.person.fullName}
                        <div className="muted">{r.codeEmp}</div>
                      </td>
                      {days.map((d) => {
                        const s = r.days[d];
                        return (
                          <td key={d} className={isWeekendISO(d) ? 'ts-weekend' : ''}>
                            <span
                              className={`ts-cell${s ? ` ts-${s}` : ''}`}
                              title={`${date(d)}${s ? ` · ${labels.attendance[s]}` : ''}`}
                              onClick={() => canWrite && setEditing({ row: r, day: d })}
                              style={{ cursor: canWrite ? 'pointer' : 'default' }}
                            >
                              {s ? statusLetter[s] : ''}
                            </span>
                          </td>
                        );
                      })}
                      <td>{r.standardDays}</td>
                      <td>{r.present + r.late + r.remote}</td>
                      <td>{r.paidLeave}</td>
                      <td>{r.unpaidLeave}</td>
                      <td>{r.absent}</td>
                      <td><strong>{r.paidDays}</strong></td>
                      <td>{r.overtimeHours || ''}</td>
                      <td title={`Muộn ${r.lateMinutes ?? 0} phút · sớm ${r.earlyMinutes ?? 0} phút`}>{(r.lateMinutes ?? 0) + (r.earlyMinutes ?? 0) || ''}</td>
                      <td>{r.nightHours || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {canWrite && <p className="muted">Bấm vào một ô để nhập hoặc sửa công của ngày đó.</p>}

      {editing && (
        <FormModal
          title={`${editing.row.person.fullName} · ${date(editing.day)}`}
          fields={recordFields}
          initial={{ status: editing.row.days[editing.day] ?? 'PRESENT' }}
          method="put"
          path="/attendance/records"
          transform={(b) => ({ ...b, employmentId: editing.row.employmentId, workDate: editing.day })}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </>
  );
}
