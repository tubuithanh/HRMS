import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ActionButton, Card, DataTable, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { currentMonth, date, labels, time } from '../../lib/format';
import { AttendanceRecord, TimesheetRow } from '../../types/models';
import { Legend, daysOfMonth, isWeekendISO, statusLetter } from '../attendance/TimesheetPage';
import { SelfServiceError } from './MyProfilePage';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
      {now.toLocaleTimeString('vi-VN')}
    </div>
  );
}

export default function MyAttendancePage() {
  const [month, setMonth] = useState(currentMonth());
  const today = useFetch<AttendanceRecord | null>('/me/attendance/today');
  const sheet = useFetch<{ summary: TimesheetRow | null; records: AttendanceRecord[] }>(`/me/attendance?month=${month}`);
  const reload = () => {
    today.reload();
    sheet.reload();
  };
  const t = today.data;
  const s = sheet.data?.summary;

  if (today.error) {
    return (
      <>
        <PageHeader title="Chấm công" />
        <SelfServiceError error={today.error} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Chấm công" />
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card title={`Hôm nay · ${new Date().toLocaleDateString('vi-VN')}`}>
          <Clock />
          <p className="muted">
            Vào: <strong>{time(t?.checkIn)}</strong> · Ra: <strong>{time(t?.checkOut)}</strong>
            {t && <> · {labels.attendance[t.status]}</>}
          </p>
          <div className="toolbar">
            <ActionButton label="Chấm công vào" className="btn btn-primary" disabled={!!t?.checkIn} run={() => api.post('/me/attendance/check-in')} success="Đã chấm công vào" onDone={reload} />
            <ActionButton label="Chấm công ra" className="btn btn-outline-secondary" disabled={!t?.checkIn || !!t?.checkOut} run={() => api.post('/me/attendance/check-out')} success="Đã chấm công ra" onDone={reload} />
          </div>
          <p className="muted" style={{ marginBottom: 0, fontSize: 12 }}>Vào sau 8:30 được tính là đi muộn.</p>
        </Card>
        {s && (
          <Card title={`Tổng hợp tháng ${month.slice(5)}/${month.slice(0, 4)}`}>
            <dl className="kv">
              <dt>Ngày công chuẩn</dt><dd>{s.standardDays}</dd>
              <dt>Đi làm</dt><dd>{s.present + s.late + s.remote} (muộn {s.late}, từ xa {s.remote})</dd>
              <dt>Nghỉ phép có lương</dt><dd>{s.paidLeave}</dd>
              <dt>Nghỉ không lương</dt><dd>{s.unpaidLeave}</dd>
              <dt>Vắng</dt><dd>{s.absent}</dd>
              <dt>Công hưởng lương</dt><dd><strong>{s.paidDays}</strong></dd>
            </dl>
          </Card>
        )}
      </div>
      <Card
        title="Chi tiết"
        actions={<input type="month" className="form-control" style={{ width: 'auto' }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
        flush
      >
        {s && (
          <div className="card-body">
            <div className="toolbar" style={{ gap: 4, marginBottom: 10 }}>
              {daysOfMonth(month).map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11 }} className={isWeekendISO(d) ? 'muted' : ''}>
                  <div>{Number(d.slice(8))}</div>
                  <span className={`ts-cell${s.days[d] ? ` ts-${s.days[d]}` : isWeekendISO(d) ? ' ts-weekend' : ''}`} style={{ cursor: 'default' }}>
                    {s.days[d] ? statusLetter[s.days[d]] : ''}
                  </span>
                </div>
              ))}
            </div>
            <Legend />
          </div>
        )}
        <DataTable
          rows={sheet.data?.records ?? null}
          loading={sheet.loading}
          rowKey={(r) => r.id}
          empty="Chưa có dữ liệu chấm công trong tháng"
          columns={[
            { header: 'Ngày', cell: (r) => date(r.workDate) },
            { header: 'Vào', cell: (r) => time(r.checkIn) },
            { header: 'Ra', cell: (r) => time(r.checkOut) },
            { header: 'Trạng thái', cell: (r) => labels.attendance[r.status] },
            { header: 'Ghi chú', cell: (r) => r.note ?? '' },
          ]}
        />
      </Card>
    </>
  );
}
