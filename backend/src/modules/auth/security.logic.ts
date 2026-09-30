/**
 * Quy tắc bảo mật đăng nhập. Hàm thuần để test được.
 */

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const RESET_TOKEN_MINUTES = 30;

/** Kiểm tra độ mạnh mật khẩu. Trả về thông báo lỗi hoặc null. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
  if (password.length > 128) return 'Mật khẩu quá dài';
  if (!/[A-Za-zÀ-ỹ]/.test(password) || !/\d/.test(password)) return 'Mật khẩu phải có cả chữ và số';
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return 'Mật khẩu không được chứa tên đăng nhập';
  }
  return null;
}

export interface LockState {
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export function isLocked(state: LockState, now: Date): boolean {
  return !!state.lockedUntil && state.lockedUntil > now;
}

/** Trạng thái sau một lần đăng nhập sai: đủ số lần thì khoá và đếm lại từ đầu. */
export function afterFailedLogin(state: LockState, now: Date, maxFailed = MAX_FAILED_LOGINS, lockMinutes = LOCK_MINUTES): LockState {
  // Hết thời gian khoá thì đếm lại từ 0.
  const base = state.lockedUntil && state.lockedUntil <= now ? 0 : state.failedLoginCount;
  const count = base + 1;
  if (count >= maxFailed) {
    return { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + lockMinutes * 60_000) };
  }
  return { failedLoginCount: count, lockedUntil: null };
}

/**
 * Giới hạn số lần thử theo khoá (IP) trong một cửa sổ thời gian — lưu trong bộ nhớ.
 * Đủ cho một máy chủ; chạy nhiều máy chủ thì cần lưu ở Redis.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Ghi một lần thử; trả về true nếu còn trong giới hạn. */
  hit(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return recent.length <= this.max;
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
  }
}
