import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { useFetch } from '../lib/hooks';

/**
 * Thanh điều hướng dưới đáy màn hình trên điện thoại (ẩn từ màn hình lớn):
 * các việc nhân viên dùng hằng ngày — chấm công, nghỉ phép, phiếu lương, việc cần làm, hồ sơ.
 */
export default function MobileNav({ tasks }: { tasks: number }) {
  const { user } = useAuth();
  const approvals = useFetch<{ leave: unknown[]; overtime: unknown[] }>(user?.personId ? '/me/approvals' : null);
  const pending = (approvals.data?.leave.length ?? 0) + (approvals.data?.overtime.length ?? 0);
  if (!user) return null;
  const items: Array<{ to: string; icon: string; label: string; badge?: number; end?: boolean }> = [
    { to: '/me/attendance', icon: 'bi-fingerprint', label: 'Chấm công' },
    { to: '/me/leave', icon: 'bi-calendar2-x', label: 'Nghỉ phép' },
    pending > 0 ? { to: '/me/approvals', icon: 'bi-inbox', label: 'Duyệt', badge: pending } : { to: '/me/payslips', icon: 'bi-receipt', label: 'Phiếu lương' },
    { to: '/me/tasks', icon: 'bi-check2-square', label: 'Việc', badge: tasks },
    { to: '/me', icon: 'bi-person-circle', label: 'Tôi', end: true },
  ];
  return (
    <nav className="mobile-nav d-lg-none border-top bg-body" aria-label="Điều hướng nhanh">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className="mobile-nav-item">
          <span className="position-relative">
            <i className={`bi ${i.icon}`} />
            {!!i.badge && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">{i.badge > 99 ? '99+' : i.badge}</span>}
          </span>
          <span className="mobile-nav-label">{i.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
