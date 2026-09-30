import { FormEvent, useState } from 'react';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth';
import { Card, PageHeader, useToast } from '../components/ui';

export const PASSWORD_RULE = 'Ít nhất 8 ký tự, có cả chữ và số, không chứa tên đăng nhập.';

/** forced: người dùng phải đổi mật khẩu trước khi dùng hệ thống. */
export default function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { changePassword, logout, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setSaving(true);
    try {
      await changePassword(current, next);
      toast('Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Đổi mật khẩu"
        subtitle={forced ? `Chào ${user?.person?.fullName ?? user?.username}, bạn cần đặt mật khẩu mới trước khi sử dụng hệ thống.` : undefined}
      />
      <div style={{ maxWidth: 420 }}>
        <Card>
          <form className="stack" onSubmit={submit}>
            {error && <div className="alert alert-danger" style={{ margin: 0 }}>{error}</div>}
            <label className="d-block">
              <span className="form-label d-block">Mật khẩu hiện tại</span>
              <input className="form-control" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </label>
            <label className="d-block">
              <span className="form-label d-block">Mật khẩu mới</span>
              <input className="form-control" type="password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
            </label>
            <label className="d-block">
              <span className="form-label d-block">Nhập lại mật khẩu mới</span>
              <input className="form-control" type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
            <div className="small text-body-secondary">{PASSWORD_RULE}</div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary" disabled={saving}>
                {saving ? 'Đang lưu…' : 'Đổi mật khẩu'}
              </button>
              {forced && (
                <button type="button" className="btn btn-outline-secondary" onClick={logout}>
                  Đăng xuất
                </button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
