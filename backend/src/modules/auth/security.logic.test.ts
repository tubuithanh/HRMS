import { describe, expect, it } from 'vitest';
import { afterFailedLogin, isLocked, LOCK_MINUTES, MAX_FAILED_LOGINS, passwordProblem, RateLimiter } from './security.logic';

describe('passwordProblem', () => {
  it('yêu cầu 8 ký tự, có chữ và số, không chứa tên đăng nhập', () => {
    expect(passwordProblem('Ab1')).toMatch(/8 ký tự/);
    expect(passwordProblem('abcdefgh')).toMatch(/chữ và số/);
    expect(passwordProblem('12345678')).toMatch(/chữ và số/);
    expect(passwordProblem('hr.demo2026', 'hr.demo')).toMatch(/tên đăng nhập/);
    expect(passwordProblem('Mật khẩu 2026')).toBeNull();
    expect(passwordProblem('Demo@12345', 'admin')).toBeNull();
  });
});

describe('khoá tài khoản khi nhập sai', () => {
  const now = new Date('2026-09-29T08:00:00Z');

  it(`khoá ${LOCK_MINUTES} phút sau ${MAX_FAILED_LOGINS} lần sai liên tiếp`, () => {
    let s = { failedLoginCount: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      s = afterFailedLogin(s, now);
      expect(s.failedLoginCount).toBe(i);
      expect(isLocked(s, now)).toBe(false);
    }
    s = afterFailedLogin(s, now);
    expect(isLocked(s, now)).toBe(true);
    expect(s.lockedUntil!.getTime() - now.getTime()).toBe(LOCK_MINUTES * 60_000);
  });

  it('hết thời gian khoá thì mở và đếm lại từ đầu', () => {
    const later = new Date(now.getTime() + (LOCK_MINUTES + 1) * 60_000);
    const locked = { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) };
    expect(isLocked(locked, later)).toBe(false);
    expect(afterFailedLogin(locked, later)).toEqual({ failedLoginCount: 1, lockedUntil: null });
  });
});

describe('RateLimiter', () => {
  it('cho phép tối đa N lần trong cửa sổ, sau đó chặn; hết cửa sổ thì cho lại', () => {
    const rl = new RateLimiter(3, 1000);
    expect([rl.hit('ip', 0), rl.hit('ip', 10), rl.hit('ip', 20)]).toEqual([true, true, true]);
    expect(rl.hit('ip', 30)).toBe(false);
    expect(rl.hit('other', 30)).toBe(true);
    expect(rl.hit('ip', 1500)).toBe(true);
  });
});
