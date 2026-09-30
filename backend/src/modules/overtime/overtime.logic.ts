import Decimal from 'decimal.js';
import { formatDate, isWeekend } from '../../common/utils/dates';

/**
 * Làm thêm giờ theo Bộ luật Lao động 2019.
 *  - Điều 98: tiền làm thêm ≥ 150% ngày thường, 200% ngày nghỉ hằng tuần,
 *    300% ngày lễ/Tết (chưa kể lương ngày lễ). Làm thêm ban đêm được trả thêm
 *    30% + 20% tiền lương giờ làm ban ngày của ngày đó → 210% / 270% / 390%.
 *  - Điều 107 + NĐ 145/2020: không quá 50% giờ làm bình thường trong ngày
 *    (4 giờ với ngày 8 giờ), ngày nghỉ/lễ tối đa 12 giờ; không quá 40 giờ/tháng.
 */

export type OvertimeType = 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY';

export const MONTHLY_LIMIT_HOURS = 40;
export const NORMAL_HOURS_PER_DAY = 8;

const MULTIPLIER: Record<OvertimeType, { day: string; night: string }> = {
  WEEKDAY: { day: '1.5', night: '2.1' },
  WEEKEND: { day: '2', night: '2.7' },
  HOLIDAY: { day: '3', night: '3.9' },
};

export function overtimeTypeOf(date: Date, holidays: Set<string>): OvertimeType {
  if (holidays.has(formatDate(date))) return 'HOLIDAY';
  if (isWeekend(date)) return 'WEEKEND';
  return 'WEEKDAY';
}

export function multiplierOf(type: OvertimeType, isNight: boolean): Decimal {
  return new Decimal(isNight ? MULTIPLIER[type].night : MULTIPLIER[type].day);
}

export function maxHoursPerDay(type: OvertimeType): number {
  return type === 'WEEKDAY' ? NORMAL_HOURS_PER_DAY / 2 : 12;
}

/**
 * Kiểm tra số giờ của một đơn. usedInDay / usedInMonth: giờ của các đơn khác
 * (chờ duyệt + đã duyệt) cùng ngày / cùng tháng. Trả về thông báo lỗi hoặc null.
 */
export function validateOvertime(
  hours: Decimal.Value,
  type: OvertimeType,
  usedInDay: Decimal.Value,
  usedInMonth: Decimal.Value,
): string | null {
  const h = new Decimal(hours);
  if (h.lte(0)) return 'Số giờ làm thêm phải lớn hơn 0';
  if (!h.mul(2).isInteger()) return 'Số giờ làm thêm tính theo nửa giờ (0,5)';
  const dayMax = maxHoursPerDay(type);
  const day = h.plus(usedInDay);
  if (day.gt(dayMax)) {
    return `Vượt giới hạn ${dayMax} giờ làm thêm trong ngày${type === 'WEEKDAY' ? ' thường' : ' nghỉ/lễ'} (đã có ${new Decimal(usedInDay).toString()} giờ)`;
  }
  const month = h.plus(usedInMonth);
  if (month.gt(MONTHLY_LIMIT_HOURS)) {
    return `Vượt giới hạn ${MONTHLY_LIMIT_HOURS} giờ làm thêm/tháng (đã có ${new Decimal(usedInMonth).toString()} giờ)`;
  }
  return null;
}
