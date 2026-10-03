import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { roleLabels, useAuth, can } from '../auth';
import { ActionButton, Badge, Card, PageHeader } from '../components/ui';
import { useFetch } from '../lib/hooks';
import { labels, money, time } from '../lib/format';
import { AttendanceRecord, LeaveBalance, LeaveRequest } from '../types/models';
import { leaveRange } from './leave/LeaveAdminPage';
import StaffDashboard from './dashboard/StaffDashboard';

const tabular = { fontVariantNumeric: 'tabular-nums' as const };

// ================= Dashboard nhân viên =================

interface MySlip {
  id: string;
  netPay: string;
  payPeriod: { code: string };
}

function EmployeeDashboard() {
  const today = useFetch<AttendanceRecord | null>('/me/attendance/today');
  const balances = useFetch<LeaveBalance[]>('/me/leave/balances');
  const requests = useFetch<LeaveRequest[]>('/me/leave/requests');
  const slips = useFetch<MySlip[]>('/me/payslips');

  if (today.error) return <div className="alert alert-info">{today.error}</div>;
  const t = today.data;
  const annual = balances.data?.find((b) => b.leaveType.code === 'PN');
  const pending = requests.data?.filter((r) => r.status === 'PENDING') ?? [];
  const latest = slips.data?.[0];

  return (
    <div className="row g-3">
      <div className="col-md-6 col-xl-4">
        <Card title="Chấm công hôm nay">
          <div className="d-flex justify-content-between mb-3">
            <div>
              <div className="small text-body-secondary">Giờ vào</div>
              <div className="fs-4 fw-bold">{time(t?.checkIn)}</div>
            </div>
            <div className="text-end">
              <div className="small text-body-secondary">Giờ ra</div>
              <div className="fs-4 fw-bold">{time(t?.checkOut)}</div>
            </div>
          </div>
          {t && (
            <div className="mb-2">
              <Badge tone={t.status === 'LATE' ? 'yellow' : 'green'}>{labels.attendance[t.status]}</Badge>
            </div>
          )}
          <div className="d-flex gap-2">
            <ActionButton label="Chấm công vào" className="btn btn-primary flex-fill" disabled={!!t?.checkIn} run={() => api.post('/me/attendance/check-in')} success="Đã chấm công vào" onDone={today.reload} />
            <ActionButton label="Chấm công ra" className="btn btn-outline-secondary flex-fill" disabled={!t?.checkIn || !!t?.checkOut} run={() => api.post('/me/attendance/check-out')} success="Đã chấm công ra" onDone={today.reload} />
          </div>
        </Card>
      </div>
      <div className="col-md-6 col-xl-4">
        <Card title="Phép năm" actions={<Link to="/me/leave" className="btn btn-sm btn-outline-primary">Xin nghỉ</Link>}>
          {annual ? (
            <>
              <div className="fs-2 fw-bold" style={tabular}>
                {annual.remaining}
                <span className="fs-6 fw-normal text-body-secondary"> / {annual.entitled} ngày còn lại</span>
              </div>
              <div className="small text-body-secondary">Đã nghỉ {annual.used} · chờ duyệt {annual.pending}</div>
            </>
          ) : (
            <div className="muted">Chưa có dữ liệu phép</div>
          )}
          {pending.length > 0 && (
            <div className="mt-3 small">
              <div className="fw-semibold mb-1">Đơn đang chờ duyệt</div>
              {pending.map((r) => (
                <div key={r.id}>{r.leaveType.name}: {leaveRange(r)}</div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <div className="col-md-6 col-xl-4">
        <Card title="Phiếu lương gần nhất" actions={<Link to="/me/payslips" className="btn btn-sm btn-outline-secondary">Tất cả</Link>}>
          {latest ? (
            <>
              <div className="small text-body-secondary">Kỳ {latest.payPeriod.code} · thực nhận</div>
              <div className="fs-2 fw-bold" style={tabular}>{money(latest.netPay)}đ</div>
            </>
          ) : (
            <div className="muted">Chưa có phiếu lương</div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ================= Trang =================

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  const isStaff = can(user, 'dashboard');
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 13 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${greet}, ${user.person?.fullName ?? user.username} · ${roleLabels[user.role]} · ${today}`}
      />
      {isStaff ? <StaffDashboard /> : <EmployeeDashboard />}
    </>
  );
}
