import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;

/**
 * Băm mật khẩu bằng scrypt (có sẵn trong Node, không cần thư viện native).
 * Định dạng lưu: scrypt$<salt hex>$<hash hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** So khớp mật khẩu với chuỗi đã băm, chống tấn công đo thời gian. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(
    password,
    Buffer.from(saltHex, 'hex'),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}
