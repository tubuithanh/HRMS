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

/** Tham số làm thêm giờ (Cấu hình hệ thống → Làm thêm giờ). Mặc định = mức luật định. */
export interface OvertimeConfig {
  weekdayMaxHours: number;
  restDayMaxHours: number;
  monthlyLimitHours: number;
  weekday: number;
  weekend: number;
  holiday: number;
  weekdayNight: number;
  weekendNight: number;
  holidayNight: number;
}

export const DEFAULT_OVERTIME: OvertimeConfig = {
  weekdayMaxHours: NORMAL_HOURS_PER_DAY / 2,
  restDayMaxHours: 12,
  monthlyLimitHours: MONTHLY_LIMIT_HOURS,
  weekday: Number(MULTIPLIER.WEEKDAY.day),
  weekend: Number(MULTIPLIER.WEEKEND.day),
  holiday: Number(MULTIPLIER.HOLIDAY.day),
  weekdayNight: Number(MULTIPLIER.WEEKDAY.night),
  weekendNight: Number(MULTIPLIER.WEEKEND.night),
  holidayNight: Number(MULTIPLIER.HOLIDAY.night),
};

const KEY: Record<OvertimeType, 'weekday' | 'weekend' | 'holiday'> = { WEEKDAY: 'weekday', WEEKEND: 'weekend', HOLIDAY: 'holiday' };

export function multiplierOf(type: OvertimeType, isNight: boolean, cfg: OvertimeConfig = DEFAULT_OVERTIME): Decimal {
  const k = KEY[type];
  return new Decimal(String(isNight ? cfg[`${k}Night`] : cfg[k]));
}

export function maxHoursPerDay(type: OvertimeType, cfg: OvertimeConfig = DEFAULT_OVERTIME): number {
  return type === 'WEEKDAY' ? cfg.weekdayMaxHours : cfg.restDayMaxHours;
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
  cfg: OvertimeConfig = DEFAULT_OVERTIME,
): string | null {
  const h = new Decimal(hours);
  if (h.lte(0)) return 'Số giờ làm thêm phải lớn hơn 0';
  if (!h.mul(2).isInteger()) return 'Số giờ làm thêm tính theo nửa giờ (0,5)';
  const dayMax = maxHoursPerDay(type, cfg);
  const day = h.plus(usedInDay);
  if (day.gt(dayMax)) {
    return `Vượt giới hạn ${dayMax} giờ làm thêm trong ngày${type === 'WEEKDAY' ? ' thường' : ' nghỉ/lễ'} (đã có ${new Decimal(usedInDay).toString()} giờ)`;
  }
  const month = h.plus(usedInMonth);
  if (month.gt(cfg.monthlyLimitHours)) {
    return `Vượt giới hạn ${cfg.monthlyLimitHours} giờ làm thêm/tháng (đã có ${new Decimal(usedInMonth).toString()} giờ)`;
  }
  return null;
}
