/**
 * Tính các chỉ số nhân sự cho dashboard. Hàm thuần để test được.
 * Mọi ngày là 00:00 UTC (xem common/utils/dates.ts).
 */

export interface EmploymentSpan {
  dateHire: Date;
  dateTerminate: Date | null;
  status: string;
}

/** Còn làm việc vào ngày `at` (tính cả ngày vào; ngày nghỉ việc là ngày làm cuối). */
export function isEmployedAt(e: EmploymentSpan, at: Date): boolean {
  if (e.dateHire > at) return false;
  if (e.dateTerminate) return e.dateTerminate >= at;
  return e.status !== 'TERMINATED';
}

/** Ngày cuối các tháng, từ tháng (today − n + 1) đến tháng hiện tại. Tháng hiện tại lấy `today`. */
export function monthEnds(today: Date, n: number): Array<{ month: string; start: Date; end: Date }> {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth() - i;
    const start = new Date(Date.UTC(y, m, 1));
    const lastDay = new Date(Date.UTC(y, m + 1, 0));
    const end = lastDay > today ? today : lastDay;
    out.push({ month: start.toISOString().slice(0, 7), start, end });
  }
  return out;
}

export interface MonthPoint {
  month: string;
  headcount: number;
  hires: number;
  terminations: number;
}

export function headcountTrend(emps: EmploymentSpan[], today: Date, months: number): MonthPoint[] {
  return monthEnds(today, months).map(({ month, start, end }) => ({
    month,
    headcount: emps.filter((e) => isEmployedAt(e, end)).length,
    hires: emps.filter((e) => e.dateHire >= start && e.dateHire <= end).length,
    terminations: emps.filter((e) => e.dateTerminate && e.dateTerminate >= start && e.dateTerminate <= end).length,
  }));
}

/**
 * Tỷ lệ nghỉ việc từ đầu năm (%) = số người nghỉ / quân số bình quân cuối các tháng.
 * null nếu chưa có quân số.
 */
export function turnoverYtd(emps: EmploymentSpan[], today: Date): number | null {
  const months = monthEnds(today, today.getUTCMonth() + 1);
  const avg = months.reduce((s, m) => s + emps.filter((e) => isEmployedAt(e, m.end)).length, 0) / months.length;
  if (avg === 0) return null;
  const yearStart = months[0].start;
  const left = emps.filter((e) => e.dateTerminate && e.dateTerminate >= yearStart && e.dateTerminate <= today).length;
  return Math.round((left / avg) * 1000) / 10;
}

/** Số năm tròn giữa hai ngày (dùng cho tuổi và thâm niên). */
export function fullYears(from: Date, to: Date): number {
  let y = to.getUTCFullYear() - from.getUTCFullYear();
  const beforeAnniversary =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (beforeAnniversary) y--;
  return y;
}

/** Đếm theo nhóm [min, max) năm. max = null nghĩa là không giới hạn trên. */
export function bucketize(
  values: Array<number | null>,
  buckets: Array<{ label: string; min: number; max: number | null }>,
  unknownLabel = 'Chưa rõ',
): Array<{ label: string; count: number }> {
  const out = buckets.map((b) => ({ label: b.label, count: 0 }));
  let unknown = 0;
  for (const v of values) {
    if (v === null) {
      unknown++;
      continue;
    }
    const i = buckets.findIndex((b) => v >= b.min && (b.max === null || v < b.max));
    if (i >= 0) out[i].count++;
  }
  if (unknown > 0) out.push({ label: unknownLabel, count: unknown });
  return out;
}

export const TENURE_BUCKETS = [
  { label: 'Dưới 1 năm', min: 0, max: 1 },
  { label: '1–3 năm', min: 1, max: 3 },
  { label: '3–5 năm', min: 3, max: 5 },
  { label: '5–10 năm', min: 5, max: 10 },
  { label: 'Từ 10 năm', min: 10, max: null },
];

export const AGE_BUCKETS = [
  { label: 'Dưới 25', min: 0, max: 25 },
  { label: '25–34', min: 25, max: 35 },
  { label: '35–44', min: 35, max: 45 },
  { label: '45–54', min: 45, max: 55 },
  { label: 'Từ 55', min: 55, max: null },
];
