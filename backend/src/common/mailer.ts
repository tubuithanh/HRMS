import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

/**
 * GỬI EMAIL — chọn cách gửi theo biến môi trường:
 * 1. Gmail OAuth2 (GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN + GMAIL_USER):
 *    - GMAIL_SEND_VIA=smtp (mặc định): smtp.gmail.com:465, xác thực XOAUTH2 — không cần mật khẩu Gmail.
 *    - GMAIL_SEND_VIA=api: Gmail API qua HTTPS (cổng 443) — dùng khi nhà cung cấp hosting chặn cổng SMTP.
 * 2. SMTP thường (SMTP_HOST, SMTP_USER, SMTP_PASS).
 * 3. Chưa cấu hình: in nội dung ra log (tiện khi phát triển).
 * sendMail() không bao giờ ném lỗi làm hỏng thao tác chính; sendMailOrThrow() dùng cho nút "Gửi thử".
 */

export type MailMode = 'gmail-smtp' | 'gmail-api' | 'smtp' | 'log';

export function mailMode(): MailMode {
  if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && env.GMAIL_USER) {
    return env.GMAIL_SEND_VIA === 'api' ? 'gmail-api' : 'gmail-smtp';
  }
  return env.SMTP_HOST ? 'smtp' : 'log';
}

/** Người gửi: Gmail luôn gửi bằng địa chỉ đã xác thực — giữ tên hiển thị trong SMTP_FROM. */
export function mailFrom(): string {
  const mode = mailMode();
  if (mode === 'gmail-smtp' || mode === 'gmail-api') {
    const name = /^\s*"?([^"<]+?)"?\s*</.exec(env.SMTP_FROM)?.[1]?.trim() || 'ATECH HRM';
    return `"${name}" <${env.GMAIL_USER}>`;
  }
  return env.SMTP_FROM;
}

let transport: Transporter | null | undefined;
function smtpTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  const mode = mailMode();
  transport =
    mode === 'gmail-smtp'
      ? nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            type: 'OAuth2',
            user: env.GMAIL_USER,
            clientId: env.GMAIL_CLIENT_ID,
            clientSecret: env.GMAIL_CLIENT_SECRET,
            refreshToken: env.GMAIL_REFRESH_TOKEN,
          },
        })
      : mode === 'smtp'
        ? nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
          })
        : null;
  return transport;
}

// ---------- Gmail API (HTTPS) ----------
let accessToken: { value: string; expiresAt: number } | null = null;

/** Đổi refresh token lấy access token (lưu tạm đến 1 phút trước khi hết hạn). */
export async function gmailAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessToken.expiresAt) return accessToken.value;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      refresh_token: env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const body = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !body.access_token) {
    throw new Error(
      body.error === 'invalid_grant'
        ? 'Refresh token Gmail không còn hiệu lực (bị thu hồi hoặc hết hạn) — chạy lại "npm run gmail:token" để lấy mới'
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
