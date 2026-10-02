import { useEffect, useState } from 'react';
import { getPosition } from '../../lib/geo';
import { api } from '../../api/client';
import { ActionButton, Card, DataTable, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { currentMonth, date, labels, time } from '../../lib/format';
import { AttendanceRecord, TimesheetRow } from '../../types/models';
import { Legend, daysOfMonth, isWeekendISO, statusLetter } from '../attendance/TimesheetPage';
import { SelfServiceError } from './MyProfilePage';

const hm = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

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
  const pub = useFetch<{ checkin: { mode: string } }>('/settings/public');
  const needGps = pub.data?.checkin.mode.includes('GPS') ?? false;
  const punch = async (kind: 'check-in' | 'check-out') => {
    const pos = needGps ? await getPosition() : null;
    return api.post(`/me/attendance/${kind}`, pos ?? {});
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
            <ActionButton label="Chấm công vào" className="btn btn-primary" disabled={!!t?.checkIn} run={() => punch('check-in')} success="Đã chấm công vào" onDone={reload} />
            <ActionButton label="Chấm công ra" className="btn btn-outline-secondary" disabled={!t?.checkIn || !!t?.checkOut} run={() => punch('check-out')} success="Đã chấm công ra" onDone={reload} />
          </div>
          {t && ((t.lateMinutes ?? 0) > 0 || (t.earlyMinutes ?? 0) > 0 || t.workedMinutes != null) && (
            <p className="small mb-2">
              {(t.lateMinutes ?? 0) > 0 && <span className="badge text-bg-warning me-1">Muộn {t.lateMinutes} phút</span>}
              {(t.earlyMinutes ?? 0) > 0 && <span className="badge text-bg-warning me-1">Về sớm {t.earlyMinutes} phút</span>}
              {t.workedMinutes != null && <span className="badge text-bg-light border">Làm {hm(t.workedMinutes)}</span>}
            </p>
          )}
          <p className="muted" style={{ marginBottom: 0, fontSize: 12 }}>
            Đi muộn / về sớm tính theo ca của bạn (không có ca thì theo giờ hành chính).
            {needGps && ' Cần cho phép trình duyệt truy cập vị trí khi chấm công.'}
          </p>
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
            { header: 'Muộn / sớm', cell: (r) => [r.lateMinutes ? `muộn ${r.lateMinutes}′` : '', r.earlyMinutes ? `sớm ${r.earlyMinutes}′` : ''].filter(Boolean).join(' · ') },
            { header: 'Giờ làm', cell: (r) => (r.workedMinutes != null ? hm(r.workedMinutes) : '') },
            { header: 'Giờ đêm', cell: (r) => (r.nightMinutes ? hm(r.nightMinutes) : '') },
            { header: 'Ghi chú', cell: (r) => r.note ?? '' },
          ]}
        />
      </Card>
    </>
  );
}
