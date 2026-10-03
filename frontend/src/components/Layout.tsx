import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { can, Module, roleLabels, useAuth } from '../auth';
import { useFetch } from '../lib/hooks';
import NotificationBell from './NotificationBell';
import MobileNav from './MobileNav';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  perm?: Module; // cần quyền xem phân hệ này; bỏ trống = mọi tài khoản
  adminOnly?: boolean;
  managerOnly?: boolean; // chỉ hiện khi đang là quản lý trực tiếp của ai đó
}

interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

/** Menu chính. Mục có 1 trang hiện thẳng, nhiều trang thì thành dropdown. */
const menu: Array<NavItem | NavGroup> = [
  { to: '/dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
  {
    label: 'Nhân sự',
    icon: 'bi-people',
    items: [
      { to: '/persons', label: 'Hồ sơ nhân sự', icon: 'bi-person-vcard', perm: 'corehr' },
      { to: '/org', label: 'Tổ chức', icon: 'bi-diagram-3', perm: 'corehr' },
      { to: '/recruitment', label: 'Tuyển dụng', icon: 'bi-person-plus', perm: 'recruitment' },
      { to: '/rewards', label: 'Khen thưởng – kỷ luật', icon: 'bi-award', perm: 'people' },
      { to: '/trainings', label: 'Đào tạo', icon: 'bi-mortarboard', perm: 'people' },
      { to: '/reviews', label: 'Đánh giá hiệu suất', icon: 'bi-graph-up-arrow', perm: 'people' },
      { to: '/checklists', label: 'Tiếp nhận / nghỉ việc', icon: 'bi-list-check', perm: 'checklists' },
      { to: '/assets', label: 'Tài sản cấp phát', icon: 'bi-laptop', perm: 'assets' },
      { to: '/benefits', label: 'Chế độ BHXH', icon: 'bi-heart-pulse', perm: 'benefits' },
    ],
  },
  {
    label: 'Chấm công',
    icon: 'bi-calendar3',
    items: [
      { to: '/attendance', label: 'Bảng công', icon: 'bi-calendar3', perm: 'attendance' },
      { to: '/leave', label: 'Duyệt nghỉ phép', icon: 'bi-check2-square', perm: 'leave' },
      { to: '/overtime', label: 'Duyệt làm thêm giờ', icon: 'bi-moon-stars', perm: 'attendance' },
      { to: '/shifts', label: 'Ca làm việc', icon: 'bi-clock-history', perm: 'attendance' },
      { to: '/attendance/machine', label: 'Nhập máy chấm công', icon: 'bi-fingerprint', perm: 'attendance' },
      { to: '/holidays', label: 'Ngày lễ', icon: 'bi-calendar-heart', perm: 'attendance' },
    ],
  },
  {
    label: 'Tính lương',
    icon: 'bi-cash-coin',
    items: [
      { to: '/payroll', label: 'Kỳ lương', icon: 'bi-cash-coin', perm: 'payroll' },
      { to: '/reports', label: 'Báo cáo BHXH – Thuế – Chuyển lương', icon: 'bi-file-earmark-bar-graph', perm: 'reports' },
    ],
  },
  {
    label: 'Cá nhân',
    icon: 'bi-person-circle',
    items: [
      { to: '/me', label: 'Hồ sơ của tôi', icon: 'bi-person' },
      { to: '/me/attendance', label: 'Chấm công', icon: 'bi-clock' },
      { to: '/me/leave', label: 'Nghỉ phép', icon: 'bi-calendar2-x' },
      { to: '/me/overtime', label: 'Làm thêm giờ', icon: 'bi-moon-stars' },
      { to: '/me/approvals', label: 'Duyệt của tôi', icon: 'bi-inbox', managerOnly: true },
      { to: '/me/team', label: 'Nhân viên của tôi', icon: 'bi-people-fill', managerOnly: true },
      { to: '/me/reviews', label: 'Đánh giá', icon: 'bi-clipboard-check' },
      { to: '/me/tasks', label: 'Việc cần làm', icon: 'bi-check2-square' },
      { to: '/me/payslips', label: 'Phiếu lương', icon: 'bi-receipt' },
    ],
  },
  {
    label: 'Hệ thống',
    icon: 'bi-gear',
    items: [
      { to: '/import', label: 'Nhập / xuất Excel', icon: 'bi-file-earmark-spreadsheet', perm: 'import' },
      { to: '/users', label: 'Tài khoản', icon: 'bi-person-gear', perm: 'users' },
      { to: '/users/groups', label: 'Nhóm quyền', icon: 'bi-shield-lock', adminOnly: true },
      { to: '/audit', label: 'Nhật ký thao tác', icon: 'bi-journal-text', perm: 'audit' },
      { to: '/settings', label: 'Cấu hình hệ thống', icon: 'bi-sliders', perm: 'settings' },
      { to: '/settings/legal', label: 'Tham số pháp lý', icon: 'bi-bank', perm: 'settings' },
    ],
  },
];

const isGroup = (m: NavItem | NavGroup): m is NavGroup => 'items' in m;

/** Dropdown tự đóng khi bấm ra ngoài hoặc chuyển trang. */
function Dropdown(props: {
  label: React.ReactNode;
  active?: boolean;
  align?: 'end';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <li ref={ref} className="nav-item dropdown">
      <button
        className={`nav-link dropdown-toggle border-0 bg-transparent${props.active ? ' active' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {props.label}
      </button>
      <ul className={`dropdown-menu shadow-sm${props.align === 'end' ? ' dropdown-menu-lg-end' : ''}${open ? ' show' : ''}`}>
        {props.children}
      </ul>
    </li>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(true);
  const location = useLocation();
  useEffect(() => setCollapsed(true), [location.pathname]);
  // Là quản lý trực tiếp của ai không? Có bao nhiêu đơn chờ mình duyệt? (tải lại khi đổi trang)
  const team = useFetch<unknown[]>(user?.personId ? '/me/team' : null);
  const approvals = useFetch<{ leave: unknown[]; overtime: unknown[] }>(user?.personId ? '/me/approvals' : null, [location.pathname]);
  const tasks = useFetch<unknown[]>('/me/tasks', [location.pathname]);
  const isManager = (team.data?.length ?? 0) > 0;
  const pendingApprovals = (approvals.data?.leave.length ?? 0) + (approvals.data?.overtime.length ?? 0);
  if (!user) return null;

  const allowed = (i: NavItem) =>
    (!i.perm || can(user, i.perm)) && (!i.adminOnly || user.role === 'ADMIN') && (!i.managerOnly || isManager);
  const badgeFor = (to: string) =>
    to === '/me/approvals' && pendingApprovals > 0 ? pendingApprovals : to === '/me/tasks' ? (tasks.data?.length ?? 0) : 0;

  return (
    <div className="d-flex flex-column min-vh-100">
      <nav className="navbar navbar-expand-lg bg-body border-bottom shadow-sm sticky-top">
        <div className="container-fluid px-3 px-lg-4">
          <NavLink to="/" className="navbar-brand fw-bold text-primary">
            <i className="bi bi-building me-2" />
            ATECH HRM
          </NavLink>
          <button
            className="navbar-toggler"
            type="button"
            aria-label="Mở menu"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className={`navbar-collapse collapse${collapsed ? '' : ' show'}`}>
            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
              {menu.map((m) => {
                if (!isGroup(m)) {
                  if (!allowed(m)) return null;
                  return (
                    <li key={m.to} className="nav-item">
                      <NavLink to={m.to} className="nav-link">
                        <i className={`bi ${m.icon} me-1`} />
                        {m.label}
                      </NavLink>
                    </li>
                  );
                }
                const items = m.items.filter(allowed);
                if (items.length === 0) return null;
                const groupBadge = items.reduce((s, i) => s + badgeFor(i.to), 0);
                const active = items.some((i) =>
                  i.to === '/me' ? location.pathname === '/me' : location.pathname.startsWith(i.to),
                );
                return (
                  <Dropdown
                    key={m.label}
                    active={active}
                    label={
                      <>
                        <i className={`bi ${m.icon} me-1`} />
                        {m.label}
                        {groupBadge > 0 && <span className="badge rounded-pill text-bg-danger ms-1">{groupBadge}</span>}
                      </>
                    }
                  >
                    {items.map((i) => (
                      <li key={i.to}>
                        <NavLink to={i.to} end={i.to === '/me'} className="dropdown-item">
                          <i className={`bi ${i.icon} me-2`} />
                          {i.label}
                          {badgeFor(i.to) > 0 && <span className="badge rounded-pill text-bg-danger ms-2">{badgeFor(i.to)}</span>}
                        </NavLink>
                      </li>
                    ))}
                  </Dropdown>
                );
              })}
            </ul>

            <ul className="navbar-nav align-items-lg-center">
              {user.scopeOrgs && user.scopeOrgs.length > 0 && (
                <li className="nav-item me-lg-2">
                  <span className="badge text-bg-warning" title="Bạn chỉ thấy nhân viên thuộc các đơn vị này (và đơn vị con)">
                    <i className="bi bi-funnel me-1" />Phạm vi: {user.scopeOrgs.map((o) => o.name).join(', ')}
                  </span>
                </li>
              )}
              <NotificationBell />
              <Dropdown
                align="end"
                label={
                  <>
                    <i className="bi bi-person-circle me-1" />
                    {user.person?.fullName ?? user.username}
                  </>
                }
              >
                <li>
                  <div className="dropdown-header">
                    {user.username} · {roleLabels[user.role]}
                  </div>
                </li>
                <li>
                  <NavLink to="/change-password" className="dropdown-item">
                    <i className="bi bi-key me-2" />
                    Đổi mật khẩu
                  </NavLink>
                </li>
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <button className="dropdown-item text-danger" onClick={logout}>
                    <i className="bi bi-box-arrow-right me-2" />
                    Đăng xuất
                  </button>
                </li>
              </Dropdown>
            </ul>
          </div>
        </div>
      </nav>

      <main className="flex-grow-1 container-fluid px-3 px-lg-4 py-3 py-lg-4 has-mobile-nav">
        <Outlet />
      </main>
      {user.personId && <MobileNav tasks={tasks.data?.length ?? 0} />}
    </div>
  );
}
