import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('băm rồi xác minh đúng mật khẩu', async () => {
    const stored = await hashPassword('MatKhau@123');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('MatKhau@123', stored)).toBe(true);
  });

  it('từ chối mật khẩu sai', async () => {
    const stored = await hashPassword('MatKhau@123');
    expect(await verifyPassword('matkhau@123', stored)).toBe(false);
  });

  it('mỗi lần băm có salt khác nhau', async () => {
    expect(await hashPassword('x12345678')).not.toBe(
      await hashPassword('x12345678'),
    );
  });

  it('từ chối chuỗi lưu sai định dạng', async () => {
    expect(await verifyPassword('abc', 'plaintext')).toBe(false);
  });
});
