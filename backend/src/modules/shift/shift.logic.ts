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

// ===================== Tính giờ công theo ca =====================

export interface AttendanceTimes {
  /** Phút đến muộn so với giờ bắt đầu ca (0 nếu trong số phút cho phép). */
  lateMinutes: number;
  /** Phút về sớm so với giờ kết thúc ca. */
  earlyMinutes: number;
  /** Phút làm việc trong ca (đã trừ nghỉ giữa ca); null khi chưa chấm ra. */
  workedMinutes: number | null;
  /** Phút làm việc ban đêm 22:00 – 06:00 (Điều 106 BLLĐ 2019) trong khung ca. */
  nightMinutes: number;
}

const MIN = 60_000;
/** Mốc giờ địa phương của ngày công (workDate ở dạng 00:00 UTC). */
function at(workDate: Date, minutes: number): Date {
  return new Date(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 0, minutes);
}
const overlapMs = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/** Khung giờ của ca trong ngày công: [bắt đầu, kết thúc] (ca qua đêm kết thúc ngày hôm sau). */
export function shiftWindow(workDate: Date, s: Pick<ShiftTimes, 'startTime' | 'endTime'>) {
  const start = at(workDate, toMinutes(s.startTime));
  let endMin = toMinutes(s.endTime);
  if (endMin <= toMinutes(s.startTime)) endMin += 24 * 60;
  return { start, end: at(workDate, endMin) };
}

/**
 * Đi muộn, về sớm, giờ làm thực tế và giờ làm đêm của một ngày công.
 * Chỉ tính phần nằm trong khung ca (đến sớm / về muộn không cộng thêm — đó là làm thêm giờ, cần đơn riêng).
 */
export function computeAttendanceTimes(checkIn: Date | null, checkOut: Date | null, workDate: Date, s: ShiftTimes): AttendanceTimes {
  if (!checkIn) return { lateMinutes: 0, earlyMinutes: 0, workedMinutes: null, nightMinutes: 0 };
  const { start, end } = shiftWindow(workDate, s);
  const lateRaw = Math.floor((checkIn.getTime() - start.getTime()) / MIN);
  const lateMinutes = lateRaw > s.lateGraceMinutes ? lateRaw : 0;
  if (!checkOut || checkOut <= checkIn) return { lateMinutes, earlyMinutes: 0, workedMinutes: null, nightMinutes: 0 };

  const earlyMinutes = Math.max(0, Math.floor((end.getTime() - checkOut.getTime()) / MIN));
  const inMs = checkIn.getTime();
  const outMs = checkOut.getTime();
  const within = overlapMs(inMs, outMs, start.getTime(), end.getTime());
  // Nghỉ giữa ca chỉ trừ khi thời gian có mặt dài hơn thời gian nghỉ.
  const breakMs = within > s.breakMinutes * MIN ? s.breakMinutes * MIN : 0;
  const workedMinutes = Math.floor((within - breakMs) / MIN);

  // Giờ đêm: 22:00 hôm trước → 06:00, và 22:00 → 06:00 hôm sau, giao với phần có mặt trong ca.
  const from = Math.max(inMs, start.getTime());
  const to = Math.min(outMs, end.getTime());
  let night = 0;
  for (const dayOffset of [-1, 0]) {
    const n1 = at(workDate, dayOffset * 1440 + 22 * 60).getTime();
    const n2 = at(workDate, dayOffset * 1440 + 30 * 60).getTime();
    night += overlapMs(from, to, n1, n2);
  }
  // Nghỉ giữa ca của ca đêm coi như rơi vào giờ đêm.
  const nightMinutes = Math.max(0, Math.floor((night - (night > 0 && isOvernight(s) ? breakMs : 0)) / MIN));
  return { lateMinutes, earlyMinutes, workedMinutes, nightMinutes };
}

/** Khoảng cách 2 toạ độ (mét) — công thức haversine. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** IP thuộc danh sách cho phép? Hỗ trợ IP đơn và dải IPv4 CIDR (vd 203.113.10.0/24). */
export function ipAllowed(ip: string, allowed: string[]): boolean {
  const v4 = ip.replace(/^::ffff:/, '');
  const toInt = (s: string) => s.split('.').reduce((acc, x) => (acc << 8) + Number(x), 0) >>> 0;
  const isV4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
  return allowed.some((rule) => {
    const r = rule.trim();
    if (!r) return false;
    if (!r.includes('/')) return r === v4 || r === ip;
    const [net, bitsStr] = r.split('/');
    const bits = Number(bitsStr);
    if (!isV4(net) || !isV4(v4) || !(bits >= 0 && bits <= 32)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (toInt(net) & mask) === (toInt(v4) & mask);
  });
}
