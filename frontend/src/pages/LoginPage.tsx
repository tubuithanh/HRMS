import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth';

/**
 * Tài khoản dùng thử (tạo bởi `npm run seed` và `npm run seed:demo`).
 * Chỉ hiện khi chạy dev hoặc bật VITE_SHOW_DEMO_ACCOUNTS=true — không hiện ở bản build thật.
 */
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';
const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'Admin@123456', role: 'Quản trị', note: 'Toàn quyền, nhật ký thao tác' },
  { username: 'hr.demo', password: 'Demo@12345', role: 'Nhân sự', note: 'Hồ sơ, chấm công, duyệt nghỉ cuối' },
  { username: 'ketoan.demo', password: 'Demo@12345', role: 'Kế toán', note: 'Tính lương, phiếu lương' },
  { username: 'quanly.demo', password: 'Demo@12345', role: 'Quản lý', note: 'Trưởng phòng KD miền Nam — duyệt đơn bước 1' },
  { username: 'kinhdoanh.demo', password: 'Demo@12345', role: 'Nhân viên', note: 'Nhân viên KD miền Nam — xin nghỉ, làm thêm' },
  { username: 'nhanvien.demo', password: 'Demo@12345', role: 'Nhân viên', note: 'Công nhân xưởng lắp ráp' },
];

/** Màn hình đăng nhập. */
export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1 className="h3 fw-bold text-primary text-center">ATECH HRM</h1>
        <p className="muted text-center" style={{ marginTop: 4 }}>
          Đăng nhập để tiếp tục
        </p>
        <form className="card card-body shadow-sm d-flex flex-column gap-3 p-4" style={{ marginTop: 20 }} onSubmit={handleSubmit}>
          {error && <div className="alert alert-danger" style={{ margin: 0 }}>{error}</div>}
          <label className="d-block">
            <span className="form-label d-block">Tên đăng nhập</span>
            <input
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>
          <label className="d-block">
            <span className="form-label d-block">Mật khẩu</span>
            <input
              className="form-control"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
          <Link to="/forgot-password" className="small text-center">
            Quên mật khẩu?
          </Link>
        </form>

        {SHOW_DEMO && (
          <div className="card shadow-sm mt-3">
            <div className="card-header bg-body small fw-semibold">
              <i className="bi bi-info-circle me-1" />
              Tài khoản dùng thử — bấm để điền
            </div>
            <div className="list-group list-group-flush">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-2${username === a.username ? ' active' : ''}`}
                  onClick={() => {
                    setUsername(a.username);
                    setPassword(a.password);
                    setError(null);
                  }}
                >
                  <span>
                    <span className="font-monospace fw-semibold">{a.username}</span>
                    <span className={`small d-block ${username === a.username ? '' : 'text-body-secondary'}`}>{a.note}</span>
                  </span>
                  <span className="badge text-bg-light border">{a.role}</span>
                </button>
              ))}
            </div>
            <div className="card-footer bg-body small text-body-secondary">
              Mật khẩu admin: <code>Admin@123456</code> · các tài khoản khác: <code>Demo@12345</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
