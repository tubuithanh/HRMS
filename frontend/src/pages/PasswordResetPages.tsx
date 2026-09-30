import { FormEvent, ReactNode, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { PASSWORD_RULE } from './ChangePasswordPage';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1 className="h3 fw-bold text-primary text-center">ATECH HRM</h1>
        <p className="muted text-center mt-1">{title}</p>
        <div className="card card-body shadow-sm p-4 mt-3">{children}</div>
        <div className="text-center mt-3 small">
          <Link to="/">← Quay lại đăng nhập</Link>
        </div>
      </div>
    </div>
  );
}

/** Quên mật khẩu: nhập tên đăng nhập, hệ thống gửi link qua email nhân sự. */
export function ForgotPasswordPage() {
  const [username, setUsername] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ data: { message: string } }>('/auth/forgot-password', { username });
      setSent(res.data.data.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Quên mật khẩu">
      {sent ? (
        <div className="alert alert-success mb-0">
          {sent} Link có hiệu lực 30 phút. Nếu không nhận được email, hãy liên hệ bộ phận nhân sự để được đặt lại mật khẩu.
        </div>
      ) : (
        <form className="d-flex flex-column gap-3" onSubmit={submit}>
          {error && <div className="alert alert-danger mb-0">{error}</div>}
          <label className="d-block">
            <span className="form-label d-block">Tên đăng nhập</span>
            <input className="form-control" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang gửi…' : 'Gửi link đặt lại mật khẩu'}
          </button>
          <div className="small text-body-secondary">Link được gửi tới email trong hồ sơ nhân sự gắn với tài khoản.</div>
        </form>
      )}
    </Shell>
  );
}

/** Đặt mật khẩu mới từ link trong email (?token=...). */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: next });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Shell title="Đặt lại mật khẩu">
        <div className="alert alert-danger mb-0">Link không hợp lệ. Hãy mở đúng link trong email.</div>
      </Shell>
    );
  }

  return (
    <Shell title="Đặt lại mật khẩu">
      {done ? (
        <>
          <div className="alert alert-success">Đã đặt mật khẩu mới.</div>
          <button className="btn btn-primary w-100" onClick={() => navigate('/')}>Đăng nhập</button>
        </>
      ) : (
        <form className="d-flex flex-column gap-3" onSubmit={submit}>
          {error && <div className="alert alert-danger mb-0">{error}</div>}
          <label className="d-block">
            <span className="form-label d-block">Mật khẩu mới</span>
            <input className="form-control" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={8} autoFocus />
          </label>
          <label className="d-block">
            <span className="form-label d-block">Nhập lại mật khẩu mới</span>
            <input className="form-control" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} />
          </label>
          <div className="small text-body-secondary">{PASSWORD_RULE}</div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Đặt mật khẩu mới'}
          </button>
        </form>
      )}
    </Shell>
  );
}
