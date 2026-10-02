import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError, ValidationError } from '../../common/errors/AppError';
import { decryptSecret, encryptSecret } from '../../common/utils/secret';
import { loadMailConfig, mailFrom, mailHost, MailConfig, mailMode, resetMailCache, setMailConfigProvider } from '../../common/mailer';

/**
 * CẤU HÌNH GỬI EMAIL TRÊN WEB (Cấu hình hệ thống → Gửi email).
 *  - provider ENV: dùng biến môi trường như cũ (mặc định).
 *  - GMAIL: Gmail OAuth2 — nhập Client ID / secret, bấm "Kết nối Gmail" để Google cấp refresh token (không cần dòng lệnh).
 *  - SMTP: máy chủ SMTP thường.  - OFF: không gửi (chỉ ghi log).
 * Bí mật (client secret, refresh token, mật khẩu SMTP) được mã hoá trước khi lưu và không bao giờ trả về trình duyệt.
 */

const KEY = 'mailConfig';
const GMAIL_SCOPE = 'https://mail.google.com/';

interface Stored {
  provider: 'ENV' | 'GMAIL' | 'SMTP' | 'OFF';
  fromName: string;
  gmailUser: string;
  clientId: string;
  clientSecretEnc: string | null;
  refreshTokenEnc: string | null;
  sendVia: 'smtp' | 'api';
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassEnc: string | null;
  smtpFrom: string;
}

const DEFAULT: Stored = {
  provider: 'ENV',
  fromName: 'ATECH HRM',
  gmailUser: '',
  clientId: '',
  clientSecretEnc: null,
  refreshTokenEnc: null,
  sendVia: 'smtp',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPassEnc: null,
  smtpFrom: '',
};

async function readStored(): Promise<Stored> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  return { ...DEFAULT, ...((row?.value as Partial<Stored> | null) ?? {}) };
}

async function writeStored(s: Stored) {
  await prisma.systemSetting.upsert({ where: { key: KEY }, update: { value: s as object }, create: { key: KEY, value: s as object } });
  resetMailCache();
}

/** Cấu hình hiệu lực cho bộ gửi email (null = dùng biến môi trường). */
async function effective(): Promise<MailConfig | null> {
  const s = await readStored();
  if (s.provider === 'ENV') return null;
  const base = { source: 'web' as const, sendVia: s.sendVia, smtpPort: s.smtpPort };
  if (s.provider === 'OFF') return { ...base, off: true, from: s.fromName };
  if (s.provider === 'GMAIL') {
    return {
      ...base,
      gmailUser: s.gmailUser || undefined,
      clientId: s.clientId || undefined,
      clientSecret: decryptSecret(s.clientSecretEnc) ?? undefined,
      refreshToken: decryptSecret(s.refreshTokenEnc) ?? undefined,
      from: s.fromName || 'ATECH HRM',
    };
  }
  return {
    ...base,
    smtpHost: s.smtpHost || undefined,
    smtpUser: s.smtpUser || undefined,
    smtpPass: decryptSecret(s.smtpPassEnc) ?? undefined,
    from: s.smtpFrom || s.fromName,
  };
}

/** Gọi một lần khi khởi động: bộ gửi email đọc cấu hình web. */
export function registerMailConfig() {
  setMailConfigProvider(effective);
}

const opt = (max: number) => z.string().trim().max(max).optional();

export const mailConfigSchema = z
  .object({
    provider: z.enum(['ENV', 'GMAIL', 'SMTP', 'OFF']),
    fromName: z.string().trim().min(1, 'Nhập tên người gửi').max(100),
    gmailUser: z.string().trim().email('Địa chỉ Gmail không hợp lệ').or(z.literal('')).optional(),
    clientId: opt(300),
    /** Bỏ trống = giữ giá trị đã lưu. */
    clientSecret: opt(300),
    sendVia: z.enum(['smtp', 'api']).optional(),
    smtpHost: opt(200),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpUser: opt(200),
    smtpPass: opt(300),
    smtpFrom: opt(200),
  });

export const mailConfigService = {
  /** Thông tin hiển thị — không có bí mật. */
  async view(req: { protocol: string; get(h: string): string | undefined }) {
    const s = await readStored();
    const c = await loadMailConfig();
    return {
      provider: s.provider,
      fromName: s.fromName,
      gmailUser: s.gmailUser,
      clientId: s.clientId,
      hasClientSecret: !!decryptSecret(s.clientSecretEnc),
      hasRefreshToken: !!decryptSecret(s.refreshTokenEnc),
      sendVia: s.sendVia,
      smtpHost: s.smtpHost,
      smtpPort: s.smtpPort,
      smtpUser: s.smtpUser,
      hasSmtpPass: !!decryptSecret(s.smtpPassEnc),
      smtpFrom: s.smtpFrom,
      /** Địa chỉ cần khai báo trong Google Cloud → OAuth client (Web application) → Authorized redirect URIs. */
      redirectUri: redirectUri(req),
      status: { source: c.source, mode: mailMode(c), host: mailHost(c), from: mailFrom(c), configured: mailMode(c) !== 'log' },
      envHasGmail: !!(env.GMAIL_CLIENT_ID && env.GMAIL_REFRESH_TOKEN),
      appUrl: env.APP_URL,
    };
  },

  async update(input: z.infer<typeof mailConfigSchema>) {
    const s = await readStored();
    const clientChanged = input.clientId !== undefined && input.clientId !== s.clientId;
    const next: Stored = {
      ...s,
      provider: input.provider,
      fromName: input.fromName,
      gmailUser: input.gmailUser ?? s.gmailUser,
      clientId: input.clientId ?? s.clientId,
      clientSecretEnc: input.clientSecret ? encryptSecret(input.clientSecret) : s.clientSecretEnc,
      // Đổi OAuth client → refresh token cũ không dùng được nữa.
      refreshTokenEnc: clientChanged ? null : s.refreshTokenEnc,
      sendVia: input.sendVia ?? s.sendVia,
      smtpHost: input.smtpHost ?? s.smtpHost,
      smtpPort: input.smtpPort ?? s.smtpPort,
      smtpUser: input.smtpUser ?? s.smtpUser,
      smtpPassEnc: input.smtpPass ? encryptSecret(input.smtpPass) : s.smtpPassEnc,
      smtpFrom: input.smtpFrom ?? s.smtpFrom,
    };
    if (next.provider === 'SMTP' && !next.smtpHost) throw new ValidationError('Nhập máy chủ SMTP');
    await writeStored(next);
  },

  /** Ngắt kết nối Gmail: xoá refresh token đã lưu (nên thu hồi thêm ở myaccount.google.com/permissions). */
  async disconnectGmail() {
    const s = await readStored();
    await writeStored({ ...s, refreshTokenEnc: null });
  },

  /** Bước 1 OAuth2: tạo đường dẫn đăng nhập Google (PKCE + state chống giả mạo). */
  async startGmailAuth(req: { protocol: string; get(h: string): string | undefined }, userId: string) {
    const s = await readStored();
    if (!s.clientId || !decryptSecret(s.clientSecretEnc)) {
      throw new ValidationError('Nhập và lưu Client ID, Client secret trước khi kết nối Gmail');
    }
    cleanupStates();
    const verifier = crypto.randomBytes(48).toString('base64url');
    const state = crypto.randomBytes(24).toString('base64url');
    const uri = redirectUri(req);
    pending.set(state, { verifier, redirectUri: uri, userId, expires: Date.now() + 10 * 60_000 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: s.clientId,
      redirect_uri: uri,
      response_type: 'code',
      scope: GMAIL_SCOPE,
      access_type: 'offline',
      prompt: 'consent', // luôn trả refresh token
      state,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      ...(s.gmailUser ? { login_hint: s.gmailUser } : {}),
    }).toString();
    return { url: url.toString(), redirectUri: uri };
  },

  /** Bước 2 OAuth2: Google chuyển về đây với mã → đổi lấy refresh token, lưu (đã mã hoá). Trả về đường dẫn quay lại giao diện. */
  async finishGmailAuth(q: { state?: string; code?: string; error?: string }): Promise<string> {
    const back = (status: string, msg?: string) =>
      `${env.APP_URL.replace(/\/$/, '')}/settings?gmail=${status}${msg ? `&msg=${encodeURIComponent(msg)}` : ''}`;
    const p = q.state ? pending.get(q.state) : undefined;
    if (q.state) pending.delete(q.state);
    if (!p || p.expires < Date.now()) return back('error', 'Phiên kết nối đã hết hạn — bấm Kết nối Gmail lại');
    if (q.error || !q.code) return back('error', q.error === 'access_denied' ? 'Bạn chưa bấm Cho phép' : q.error ?? 'Không nhận được mã');

    const s = await readStored();
    const secret = decryptSecret(s.clientSecretEnc);
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: q.code,
        client_id: s.clientId,
        client_secret: secret ?? '',
        redirect_uri: p.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: p.verifier,
      }),
    });
    const body = (await r.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
    if (!body.refresh_token) {
      return back('error', body.error_description ?? body.error ?? 'Google không trả refresh token — gỡ quyền ứng dụng ở myaccount.google.com/permissions rồi thử lại');
    }
    // Địa chỉ Gmail vừa đăng nhập = địa chỉ gửi.
    let gmailUser = s.gmailUser;
    if (body.access_token) {
      const prof = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${body.access_token}` } })
        .then((x) => (x.ok ? (x.json() as Promise<{ emailAddress?: string }>) : null))
        .catch(() => null);
      if (prof?.emailAddress) gmailUser = prof.emailAddress;
    }
    await writeStored({ ...s, provider: 'GMAIL', gmailUser, refreshTokenEnc: encryptSecret(body.refresh_token) });
    return back('ok');
  },
};

// ---------- Trạng thái OAuth đang chờ (trong bộ nhớ, hết hạn 10 phút) ----------
const pending = new Map<string, { verifier: string; redirectUri: string; userId: string; expires: number }>();
function cleanupStates() {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  if (pending.size > 100) throw new AppError('Quá nhiều yêu cầu kết nối đang chờ', 429, 'TOO_MANY');
}

/** Địa chỉ Google chuyển về sau khi cho phép — theo địa chỉ backend thực tế (sau proxy). */
function redirectUri(req: { protocol: string; get(h: string): string | undefined }) {
  return `${req.protocol}://${req.get('host')}/api/settings/mail/oauth/callback`;
}
