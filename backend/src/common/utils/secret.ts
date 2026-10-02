import crypto from 'node:crypto';
import { env } from '../../config/env';

/**
 * Mã hoá bí mật lưu trong database (client secret, refresh token, mật khẩu SMTP) — AES-256-GCM.
 * Khoá dẫn xuất từ JWT_SECRET: đổi JWT_SECRET thì các bí mật đã lưu không giải mã được nữa → phải nhập / kết nối lại.
 */
const key = () => crypto.createHash('sha256').update(`${env.JWT_SECRET}:stored-secrets`).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** null nếu không giải mã được (sai khoá / dữ liệu hỏng). */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const [v, iv, tag, data] = stored.split('.');
    if (v !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
