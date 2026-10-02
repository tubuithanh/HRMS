import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

/**
 * GỬI EMAIL — cấu hình lấy từ Cấu hình hệ thống (web) nếu quản trị đã khai báo, không thì từ biến môi trường:
 * 1. Gmail OAuth2 (địa chỉ Gmail + Client ID + Client secret + refresh token):
 *    - gửi qua smtp (mặc định): smtp.gmail.com:465, xác thực XOAUTH2 — không cần mật khẩu Gmail.
 *    - gửi qua api: Gmail API qua HTTPS (cổng 443) — dùng khi nhà cung cấp hosting chặn cổng SMTP.
 * 2. SMTP thường (máy chủ, cổng, tài khoản, mật khẩu).
 * 3. Chưa cấu hình / tắt: in nội dung ra log (tiện khi phát triển).
 * sendMail() không bao giờ ném lỗi làm hỏng thao tác chính; sendMailOrThrow() dùng cho nút "Gửi thử".
 */

export type MailMode = 'gmail-smtp' | 'gmail-api' | 'smtp' | 'log';

export interface MailConfig {
  /** Nguồn cấu hình — để hiển thị. */
  source: 'env' | 'web';
  /** Tắt hẳn (cấu hình web chọn "Không gửi"). */
  off?: boolean;
  gmailUser?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  sendVia: 'smtp' | 'api';
  smtpHost?: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  from: string;
}

function fromEnv(): MailConfig {
  return {
    source: 'env',
    gmailUser: env.GMAIL_USER,
    clientId: env.GMAIL_CLIENT_ID,
    clientSecret: env.GMAIL_CLIENT_SECRET,
    refreshToken: env.GMAIL_REFRESH_TOKEN,
    sendVia: env.GMAIL_SEND_VIA,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  };
}

// ---------- Nguồn cấu hình ----------
/** Trả cấu hình đã lưu trên web (null = dùng biến môi trường). Đăng ký bởi modules/settings/mail-config. */
type Provider = () => Promise<MailConfig | null>;
let provider: Provider | null = null;
let config: MailConfig | null = null;
let loadedAt = 0;
const CACHE_MS = 15_000;

export function setMailConfigProvider(p: Provider) {
  provider = p;
  resetMailCache();
}

/** Xoá cache (sau khi lưu cấu hình mới). */
export function resetMailCache() {
  loadedAt = 0;
  config = null;
  transport = undefined;
  accessToken = null;
}

/** Cấu hình hiện hành (tải lại sau 15 giây). */
export async function loadMailConfig(): Promise<MailConfig> {
  if (config && Date.now() - loadedAt < CACHE_MS) return config;
  const next = (provider ? await provider().catch(() => null) : null) ?? fromEnv();
  if (config && JSON.stringify(config) !== JSON.stringify(next)) {
    transport = undefined;
    accessToken = null;
  }
  config = next;
  loadedAt = Date.now();
  return config;
}

const cfg = () => config ?? fromEnv();

export function mailMode(c: MailConfig = cfg()): MailMode {
  if (c.off) return 'log';
  if (c.clientId && c.clientSecret && c.refreshToken && c.gmailUser) {
    return c.sendVia === 'api' ? 'gmail-api' : 'gmail-smtp';
  }
  return c.smtpHost ? 'smtp' : 'log';
}

/** Người gửi: Gmail luôn gửi bằng địa chỉ đã xác thực — giữ tên hiển thị trong "from". */
export function mailFrom(c: MailConfig = cfg()): string {
  const mode = mailMode(c);
  if (mode === 'gmail-smtp' || mode === 'gmail-api') {
    const name = /^\s*"?([^"<]+?)"?\s*</.exec(c.from)?.[1]?.trim() || (c.from.includes('@') ? '' : c.from.trim()) || 'ATECH HRM';
    return `"${name}" <${c.gmailUser}>`;
  }
  return c.from;
}

/** Mô tả ngắn để hiển thị trong Cấu hình hệ thống. */
export function mailHost(c: MailConfig = cfg()): string | null {
  const mode = mailMode(c);
  if (mode === 'gmail-api') return 'Gmail API (HTTPS)';
  if (mode === 'gmail-smtp') return 'smtp.gmail.com:465 (OAuth2)';
  return mode === 'smtp' ? `${c.smtpHost}:${c.smtpPort}` : null;
}

let transport: Transporter | null | undefined;
function smtpTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  const c = cfg();
  const mode = mailMode(c);
  transport =
    mode === 'gmail-smtp'
      ? nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            type: 'OAuth2',
            user: c.gmailUser,
            clientId: c.clientId,
            clientSecret: c.clientSecret,
            refreshToken: c.refreshToken,
          },
        })
      : mode === 'smtp'
        ? nodemailer.createTransport({
            host: c.smtpHost,
            port: c.smtpPort,
            secure: c.smtpPort === 465,
            auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
          })
        : null;
  return transport;
}

// ---------- Gmail API (HTTPS) ----------
let accessToken: { value: string; expiresAt: number } | null = null;

/** Đổi refresh token lấy access token (lưu tạm đến 1 phút trước khi hết hạn). */
export async function gmailAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessToken.expiresAt) return accessToken.value;
  const c = cfg();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId!,
      client_secret: c.clientSecret!,
      refresh_token: c.refreshToken!,
      grant_type: 'refresh_token',
    }),
  });
  const body = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !body.access_token) {
    throw new Error(
      body.error === 'invalid_grant'
        ? 'Refresh token Gmail không còn hiệu lực (bị thu hồi hoặc hết hạn) — bấm "Kết nối Gmail" trong Cấu hình hệ thống (hoặc chạy lại "npm run gmail:token") để lấy mới'
        : `Không lấy được access token Gmail: ${body.error_description ?? body.error ?? r.status}`,
    );
  }
  accessToken = { value: body.access_token, expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
  return accessToken.value;
}

/** Dựng thư MIME (UTF-8, tiêu đề có dấu) rồi mã hoá base64url cho Gmail API. */
export async function buildRawMessage(m: { from: string; to: string; subject: string; text: string }): Promise<string> {
  const builder = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const info = await builder.sendMail(m);
  return Buffer.from(info.message as Buffer).toString('base64url');
}

async function sendViaGmailApi(m: { from: string; to: string; subject: string; text: string }) {
  const token = await gmailAccessToken();
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: await buildRawMessage(m) }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Gmail API từ chối (${r.status}): ${body.error?.message ?? 'không rõ lý do'}`);
  }
}

/** Gửi và ném lỗi nếu thất bại (cho nút "Gửi thử"). */
export async function sendMailOrThrow(to: string, subject: string, text: string): Promise<{ mode: MailMode }> {
  await loadMailConfig();
  const mode = mailMode();
  const m = { from: mailFrom(), to, subject, text };
  if (mode === 'log') {
    console.log(`\n📧 [chưa cấu hình gửi email] Email tới ${to}\n   Tiêu đề: ${subject}\n   ${text.replace(/\n/g, '\n   ')}\n`);
  } else if (mode === 'gmail-api') {
    await sendViaGmailApi(m);
  } else {
    await smtpTransport()!.sendMail(m);
  }
  return { mode };
}

/** Gửi email; lỗi chỉ ghi log, không làm hỏng thao tác chính. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  try {
    await sendMailOrThrow(to, subject, text);
  } catch (e) {
    console.error('Gửi email thất bại:', e instanceof Error ? e.message : e);
  }
}
