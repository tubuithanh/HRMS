import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { Card, FieldDef, FormFields, toBody, useToast } from '../components/ui';
import { useFetch } from '../lib/hooks';

interface MailView {
  provider: 'ENV' | 'GMAIL' | 'SMTP' | 'OFF';
  fromName: string;
  gmailUser: string;
  clientId: string;
  hasClientSecret: boolean;
  hasRefreshToken: boolean;
  sendVia: 'smtp' | 'api';
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  hasSmtpPass: boolean;
  smtpFrom: string;
  redirectUri: string;
  status: { source: 'env' | 'web'; mode: string; host: string | null; from: string; configured: boolean };
  envHasGmail: boolean;
  appUrl: string;
}

const MODE_LABEL: Record<string, string> = {
  'gmail-smtp': 'Gmail OAuth2 (SMTP)',
  'gmail-api': 'Gmail OAuth2 (Gmail API)',
  smtp: 'SMTP',
  log: 'Không gửi — chỉ ghi log',
};

type Values = Record<string, string | boolean>;

/**
 * Gửi email: chọn Gmail OAuth2 / SMTP / biến môi trường, nhập Client ID + secret, bấm "Kết nối Gmail"
 * để Google cấp quyền (không cần dòng lệnh). Bí mật không bao giờ hiển thị lại — để trống là giữ nguyên.
 */
export default function MailSettingsCard() {
  const { data, reload } = useFetch<MailView>('/settings/mail');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState<string | null>(null);

  // Quay về từ Google: /settings?gmail=ok | error&msg=...
  useEffect(() => {
    const g = params.get('gmail');
    if (!g) return;
    if (g === 'ok') toast('Đã kết nối Gmail — hãy bấm Gửi thử để kiểm tra');
    else toast(`Kết nối Gmail thất bại: ${params.get('msg') ?? ''}`, 'error');
    params.delete('gmail');
    params.delete('msg');
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data) return;
    setValues({
      // Chưa cấu hình gì → mở sẵn phần Gmail OAuth2.
      provider: data.provider === 'ENV' && !data.status.configured ? 'GMAIL' : data.provider,
      fromName: data.fromName,
      gmailUser: data.gmailUser,
      clientId: data.clientId,
      clientSecret: '',
      sendVia: data.sendVia,
      smtpHost: data.smtpHost,
      smtpPort: String(data.smtpPort),
      smtpUser: data.smtpUser,
      smtpPass: '',
      smtpFrom: data.smtpFrom,
    });
  }, [data]);

  if (!data) return null;
  const provider = String(values.provider ?? data.provider);

  const common: FieldDef[] = [
    {
      name: 'provider',
      label: 'Cách gửi',
      type: 'select',
      required: true,
      full: true,
      options: [
        { value: 'GMAIL', label: 'Gmail OAuth2 (khuyên dùng — không cần mật khẩu Gmail)' },
        { value: 'SMTP', label: 'Máy chủ SMTP' },
        { value: 'ENV', label: 'Theo biến môi trường của server' },
        { value: 'OFF', label: 'Không gửi email (chỉ ghi log)' },
      ],
    },
    { name: 'fromName', label: 'Tên người gửi', required: true },
  ];
  const gmail: FieldDef[] = [
    { name: 'clientId', label: 'Client ID', full: true, placeholder: 'xxxxxxxx.apps.googleusercontent.com' },
    { name: 'clientSecret', label: data.hasClientSecret ? 'Client secret (đã lưu — để trống nếu giữ nguyên)' : 'Client secret', full: true },
    {
      name: 'sendVia',
      label: 'Gửi qua',
      type: 'select',
      required: true,
      options: [
        { value: 'smtp', label: 'SMTP smtp.gmail.com:465' },
        { value: 'api', label: 'Gmail API (HTTPS — khi hosting chặn cổng SMTP)' },
      ],
    },
    { name: 'gmailUser', label: 'Địa chỉ Gmail gửi (tự điền khi kết nối)' },
  ];
  const smtp: FieldDef[] = [
    { name: 'smtpHost', label: 'Máy chủ SMTP', placeholder: 'smtp.example.com' },
    { name: 'smtpPort', label: 'Cổng', type: 'number' },
    { name: 'smtpUser', label: 'Tài khoản' },
    { name: 'smtpPass', label: data.hasSmtpPass ? 'Mật khẩu (đã lưu — để trống nếu giữ nguyên)' : 'Mật khẩu', type: 'password' as FieldDef['type'] },
    { name: 'smtpFrom', label: 'Địa chỉ người gửi', placeholder: 'ATECH HRM <no-reply@congty.vn>', full: true },
  ];
  const fields = [...common, ...(provider === 'GMAIL' ? gmail : provider === 'SMTP' ? smtp : [])];

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = toBody(fields, values);
      await api.put('/settings/mail', body);
      toast('Đã lưu cấu hình gửi email');
      reload();
      return true;
    } catch (err) {
      const details = (err as { response?: { data?: { error?: { details?: Record<string, string[]> } } } }).response?.data?.error?.details;
      setError(details ? Object.values(details).flat().join(' · ') : errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    // Lưu Client ID / secret vừa nhập trước, rồi chuyển sang trang đăng nhập Google.
    if (!(await save())) return;
    try {
      const r = await api.post('/settings/mail/oauth/start');
      window.location.href = r.data.data.url;
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function disconnect() {
    if (!window.confirm('Ngắt kết nối Gmail? Hệ thống sẽ ngừng gửi email bằng tài khoản này.')) return;
    await api.post('/settings/mail/oauth/disconnect');
    toast('Đã ngắt kết nối Gmail');
    reload();
  }

  async function testEmail(e: FormEvent) {
    e.preventDefault();
    setTestMsg(null);
    try {
      const res = await api.post('/settings/test-email', { to: testTo });
      setTestMsg(res.data.data.configured ? `✅ Đã gửi email thử tới ${testTo}. Hãy kiểm tra hộp thư (cả mục Spam).` : 'Chưa cấu hình gửi email: nội dung đã được in ra log của server.');
    } catch (err) {
      setTestMsg(errorMessage(err));
    }
  }

  const st = data.status;
  return (
    <Card title={<h2 className="h6 mb-0"><i className="bi bi-envelope me-2 text-primary" />Gửi email — Gmail OAuth2 / SMTP</h2>}>
      <dl className="kv small mb-3">
        <dt>Đang dùng</dt>
        <dd>
          <span className={st.configured ? 'text-success' : 'text-warning-emphasis'}>{MODE_LABEL[st.mode] ?? st.mode}</span>
          {st.host && <> · {st.host}</>}
          <span className="text-body-secondary"> ({st.source === 'web' ? 'cấu hình trên web' : 'biến môi trường'})</span>
        </dd>
        {st.configured && (
          <>
            <dt>Người gửi</dt>
            <dd>{st.from}</dd>
          </>
        )}
      </dl>

      <form onSubmit={save}>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <FormFields fields={fields} values={values} onChange={(n, v) => setValues((s) => ({ ...s, [n]: v }))} />

        {provider === 'GMAIL' && (
          <div className="mt-3 p-2 rounded border small">
            <div className="d-flex flex-wrap align-items-center gap-2">
              {data.hasRefreshToken ? (
                <span className="text-success"><i className="bi bi-check-circle me-1" />Đã kết nối {data.gmailUser}</span>
              ) : (
                <span className="text-warning-emphasis"><i className="bi bi-exclamation-circle me-1" />Chưa kết nối Gmail</span>
              )}
              <span className="ms-auto d-flex gap-2">
                <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={connect}>
                  <i className="bi bi-google me-1" />{data.hasRefreshToken ? 'Kết nối lại' : 'Kết nối Gmail'}
                </button>
                {data.hasRefreshToken && (
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={disconnect}>Ngắt kết nối</button>
                )}
              </span>
            </div>
            <details className="mt-2">
              <summary>Cách lấy Client ID / Client secret (làm một lần)</summary>
              <ol className="mb-0 mt-2 ps-3">
                <li>Vào <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">console.cloud.google.com</a>, tạo project, bật <strong>Gmail API</strong> (APIs &amp; Services → Library).</li>
                <li><em>Google Auth Platform</em>: đối tượng <strong>External</strong> (hoặc Internal với Google Workspace); ở <em>Audience</em> bấm <strong>Publish app</strong> — để ở Testing thì kết nối hết hạn sau 7 ngày.</li>
                <li><em>Clients → Create client</em> → loại <strong>Web application</strong> → mục <em>Authorized redirect URIs</em> thêm đúng địa chỉ:
                  <div className="d-flex gap-1 my-1">
                    <code className="user-select-all text-break">{data.redirectUri}</code>
                    <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => { void navigator.clipboard?.writeText(data.redirectUri); toast('Đã sao chép'); }}>
                      <i className="bi bi-clipboard" />
                    </button>
                  </div>
                </li>
                <li>Chép Client ID, Client secret vào ô trên → bấm <strong>Kết nối Gmail</strong> → đăng nhập Gmail dùng để gửi → <strong>Cho phép</strong>.</li>
              </ol>
            </details>
          </div>
        )}
        {provider === 'ENV' && (
          <p className="small text-body-secondary mt-2 mb-0">
            Dùng biến môi trường của backend: <code>GMAIL_USER</code>, <code>GMAIL_CLIENT_ID</code>, <code>GMAIL_CLIENT_SECRET</code>,{' '}
            <code>GMAIL_REFRESH_TOKEN</code>, <code>GMAIL_SEND_VIA</code> hoặc <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>.
          </p>
        )}
        <div className="d-flex justify-content-end mt-3">
          <button className="btn btn-outline-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </form>

      <hr />
      <form className="d-flex gap-2" onSubmit={testEmail}>
        <input type="email" className="form-control" placeholder="email nhận thử" value={testTo} onChange={(e) => setTestTo(e.target.value)} required />
        <button className="btn btn-outline-primary text-nowrap">Gửi thử</button>
      </form>
      {testMsg && <div className="small mt-2">{testMsg}</div>}
      <p className="small text-body-secondary mb-0 mt-2">
        Client secret, refresh token và mật khẩu SMTP được mã hoá khi lưu và không hiển thị lại. Đổi <code>JWT_SECRET</code> của server thì phải nhập / kết nối lại.
      </p>
    </Card>
  );
}
