/**
 * Ca làm việc — phần tính toán thuần (không đụng database) để test được.
 *
 * Giờ ca lưu dạng "HH:mm". Ca qua đêm khi giờ kết thúc ≤ giờ bắt đầu (22:00 → 06:00):
 * ngày công (workDate) là ngày bắt đầu ca.
 */

export interface ShiftTimes {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateGraceMinutes: number;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isOvernight(s: Pick<ShiftTimes, 'startTime' | 'endTime'>): boolean {
  return toMinutes(s.endTime) <= toMinutes(s.startTime);
}

/** Số giờ làm của ca (trừ nghỉ giữa ca). */
export function shiftHours(s: ShiftTimes): number {
  let span = toMinutes(s.endTime) - toMinutes(s.startTime);
  if (span <= 0) span += 24 * 60;
  return Math.max(0, span - s.breakMinutes) / 60;
}

/**
 * Đi muộn khi giờ vào (giờ địa phương) muộn hơn giờ bắt đầu ca + số phút cho phép.
 * Với ca qua đêm, vào sớm trước nửa đêm vẫn so trên cùng trục; vào sau nửa đêm
 * (ngày hôm sau) được cộng 24h.
 */
export function isLateForShift(checkIn: Date, workDate: Date, s: ShiftTimes): boolean {
  const sameDay =
    checkIn.getFullYear() === workDate.getUTCFullYear() &&
    checkIn.getMonth() === workDate.getUTCMonth() &&
    checkIn.getDate() === workDate.getUTCDate();
  const minutes = checkIn.getHours() * 60 + checkIn.getMinutes() + (sameDay ? 0 : 24 * 60);
  return minutes > toMinutes(s.startTime) + s.lateGraceMinutes;
}

/**
 * Xoay ca: chu kỳ là danh sách mã ca (null = nghỉ), mỗi phần tử kéo dài `daysPerStep` ngày.
 * `offset` lệch chu kỳ cho từng tổ (tổ A bắt đầu ca sáng, tổ B ca chiều…).
 * Trả về mã ca cho ngày thứ `dayIndex` (0 = ngày bắt đầu).
 */
export function rotationShiftFor(
  pattern: Array<string | null>,
  daysPerStep: number,
  dayIndex: number,
  offset = 0,
): string | null {
  if (pattern.length === 0) return null;
  const step = Math.floor(dayIndex / Math.max(1, daysPerStep)) + offset;
  return pattern[((step % pattern.length) + pattern.length) % pattern.length];
}
