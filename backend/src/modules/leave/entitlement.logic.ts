/**
 * Số ngày phép năm được hưởng — quy tắc thuần, test được.
 *  - Điều 113 BLLĐ 2019: 12/14/16 ngày tuỳ điều kiện (cấu hình theo loại nghỉ);
 *    làm chưa đủ 12 tháng trong năm thì tính theo tỷ lệ số tháng làm việc.
 *  - Điều 114: cứ đủ 05 năm làm việc được nghỉ thêm 01 ngày.
 *  - NĐ 145/2020 Điều 66: số ngày tính theo tỷ lệ có phần thập phân ≥ 0,5 thì làm tròn lên.
 *  - Phép tồn năm trước (nếu công ty cho chuyển) được dùng trước, đến hạn thì mất.
 */

const DAY = 86_400_000;

export interface EntitlementInput {
  daysPerYear: number;
  seniorityBonus: boolean;
  /** Ngày tính thâm niên (thường = ngày vào làm). */
  dateSeniority: Date;
  dateHire: Date;
  /** Ngày nghỉ việc, hoặc ngày chốt để tính (vd khi quyết toán). */
  until?: Date | null;
  year: number;
}

/** Số năm làm việc tròn đến cuối năm xét (để cộng phép thâm niên). */
export function seniorityYears(dateSeniority: Date, year: number): number {
  const end = new Date(Date.UTC(year, 11, 31));
  let y = end.getUTCFullYear() - dateSeniority.getUTCFullYear();
  if (end.getUTCMonth() < dateSeniority.getUTCMonth() || (end.getUTCMonth() === dateSeniority.getUTCMonth() && end.getUTCDate() < dateSeniority.getUTCDate())) y--;
  return Math.max(y, 0);
}

/**
 * Số tháng làm việc trong năm: một tháng được tính nếu làm việc từ 15 ngày trở lên trong tháng đó.
 */
export function monthsWorkedInYear(dateHire: Date, until: Date | null | undefined, year: number): number {
  let months = 0;
  for (let m = 0; m < 12; m++) {
    const start = new Date(Date.UTC(year, m, 1));
    const end = new Date(Date.UTC(year, m + 1, 0));
    const from = dateHire > start ? dateHire : start;
    const to = until && until < end ? until : end;
    if (to < from) continue;
    const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1;
    if (days >= 15) months++;
  }
  return months;
}

export function annualEntitlement(input: EntitlementInput): number {
  const bonus = input.seniorityBonus ? Math.floor(seniorityYears(input.dateSeniority, input.year) / 5) : 0;
  const full = input.daysPerYear + bonus;
  const months = monthsWorkedInYear(input.dateHire, input.until, input.year);
  if (months >= 12) return full;
  // Theo tỷ lệ tháng làm việc; ≥ 0,5 làm tròn lên.
  return Math.round((full * months) / 12);
}

export interface Usage {
  fromDate: Date;
  days: number;
}

/**
 * Số ngày còn được nghỉ tại ngày `at`.
 * Phép tồn (carry) chỉ dùng được đến hết ngày `carryExpiry` và được trừ trước:
 * ngày nghỉ trước hạn tiêu vào phép tồn, phần phép tồn không dùng hết thì mất.
 */
export function availableDays(entitled: number, carry: number, carryExpiry: Date | null, usages: Usage[], at: Date): number {
  const total = usages.reduce((s, u) => s + u.days, 0);
  if (carry <= 0 || !carryExpiry) return entitled - total;
  if (at <= carryExpiry) return entitled + carry - total;
  const usedBeforeExpiry = usages.filter((u) => u.fromDate <= carryExpiry).reduce((s, u) => s + u.days, 0);
  const carryUsed = Math.min(carry, usedBeforeExpiry);
  return entitled - (total - carryUsed);
}
