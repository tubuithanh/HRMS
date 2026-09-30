import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { sanitize } from './audit';

describe('sanitize', () => {
  it('che mật khẩu, đổi Decimal/Date sang chuỗi, rút gọn chuỗi dài', () => {
    const out = sanitize({
      username: 'a',
      password: 'secret',
      passwordHash: 'scrypt$...',
      amount: new Prisma.Decimal('15000000.5'),
      at: new Date('2026-09-29T00:00:00Z'),
      file: 'x'.repeat(1000),
      nested: { newPassword: 'p' },
    }) as Record<string, unknown>;
    expect(out.password).toBe('***');
    expect(out.passwordHash).toBe('***');
    expect(out.amount).toBe('15000000.5');
    expect(out.at).toBe('2026-09-29T00:00:00.000Z');
    expect(String(out.file)).toMatch(/1000 ký tự/);
    expect((out.nested as Record<string, unknown>).newPassword).toBe('***');
  });
});
