import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { dateTime } from '../lib/format';

interface Notice {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 60_000;

/** Chuông thông báo: số chưa đọc (cập nhật mỗi phút / khi đổi trang), danh sách 30 thông báo gần nhất. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notice[] | null>(null);
  const ref = useRef<HTMLLIElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get<{ data: { unread: number } }>('/me/notifications/unread-count')
        .then((r) => alive && setUnread(r.data.data.unread))
        .catch(() => undefined);
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [location.pathname]);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    api.get<{ data: { items: Notice[]; unread: number } }>('/me/notifications').then((r) => {
      setItems(r.data.data.items);
      setUnread(r.data.data.unread);
    });
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function markRead(ids?: string[]) {
    await api.post('/me/notifications/read', ids ? { ids } : {});
    const now = new Date().toISOString();
    setItems((xs) => xs?.map((x) => (!ids || ids.includes(x.id) ? { ...x, readAt: x.readAt ?? now } : x)) ?? null);
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
  }

  function openItem(n: Notice) {
    if (!n.readAt) void markRead([n.id]);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <li ref={ref} className="nav-item dropdown">
      <button
        className="nav-link border-0 bg-transparent position-relative px-2"
        aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <i className="bi bi-bell fs-5" />
        {unread > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger" style={{ fontSize: 10, marginTop: 8, marginLeft: -6 }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <div className={`dropdown-menu dropdown-menu-lg-end shadow p-0${open ? ' show' : ''}`} style={{ width: 360, maxWidth: '92vw', right: 0, left: 'auto' }}>
        <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
          <strong>Thông báo</strong>
          {unread > 0 && (
            <button className="btn btn-link btn-sm p-0" onClick={() => markRead()}>
              Đánh dấu đã đọc tất cả
            </button>
          )}
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {items === null && <div className="p-3 text-body-secondary small">Đang tải…</div>}
          {items?.length === 0 && <div className="p-4 text-center text-body-secondary small">Chưa có thông báo</div>}
          {items?.map((n) => (
            <button
              key={n.id}
              className={`dropdown-item text-wrap border-bottom py-2 ${n.readAt ? '' : 'bg-primary-subtle'}`}
              onClick={() => openItem(n)}
            >
              <div className={`small ${n.readAt ? '' : 'fw-semibold'}`}>{n.title}</div>
              {n.body && <div className="small text-body-secondary">{n.body}</div>}
              <div className="text-body-tertiary" style={{ fontSize: 11 }}>{dateTime(n.createdAt)}</div>
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}
