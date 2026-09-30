/**
 * Tiện ích cho cột kiểu DATE (không có giờ).
 *
 * Quy ước: một "ngày" luôn được biểu diễn bằng Date ở 00:00 UTC — đúng như
 * Prisma đọc/ghi cột @db.Date và như z.coerce.date('2026-09-29') tạo ra.
 * Nhờ vậy so sánh, cộng ngày không bị lệch do múi giờ máy chủ.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ngày hôm nay theo giờ địa phương của máy chủ, ở dạng 00:00 UTC. */
export function todayDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Thứ 7 hoặc chủ nhật. */
export function isWeekend(date: Date): boolean {
  const d = date.getUTCDay();
  return d === 0 || d === 6;
}

/** Số ngày làm việc (thứ 2 – thứ 6) từ from đến to, tính cả hai đầu. */
export function countWorkingDays(from: Date, to: Date): number {
  let count = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isWeekend(d)) count++;
  }
  return count;
}

/**
 * Khoảng ngày của một tháng dạng "YYYY-MM".
 * Trả về ngày đầu và ngày cuối tháng (00:00 UTC).
 */
export function monthRange(month: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error('Tháng phải có dạng YYYY-MM');
  const year = Number(m[1]);
  const mon = Number(m[2]) - 1;
  if (mon < 0 || mon > 11) throw new Error('Tháng phải có dạng YYYY-MM');
  return {
    start: new Date(Date.UTC(year, mon, 1)),
    end: new Date(Date.UTC(year, mon + 1, 0)),
  };
}

/** Khoảng ngày của một năm. */
export function yearRange(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31)),
  };
}

/** "YYYY-MM-DD" của một ngày (00:00 UTC). */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
