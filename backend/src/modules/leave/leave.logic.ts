import Decimal from 'decimal.js';
import { addDays, formatDate, isWeekend } from '../../common/utils/dates';

/**
 * Số ngày nghỉ của một đơn: đếm ngày làm việc (thứ 2 – thứ 6, trừ ngày lễ) trong khoảng.
 * Nghỉ nửa ngày chỉ hợp lệ khi from = to, và tính là 0,5 ngày.
 * Ném lỗi nếu khoảng không hợp lệ hoặc không có ngày làm việc nào.
 */
export function calcLeaveDays(
  fromDate: Date,
  toDate: Date,
  isHalfDay = false,
  holidays: Set<string> = new Set(),
): Decimal {
  if (toDate < fromDate) {
    throw new Error('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
  }
  if (isHalfDay && fromDate.getTime() !== toDate.getTime()) {
    throw new Error('Nghỉ nửa ngày chỉ áp dụng cho một ngày');
  }
  let days = 0;
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
    if (!isWeekend(d) && !holidays.has(formatDate(d))) days++;
  }
  if (days === 0) {
    throw new Error('Khoảng nghỉ không có ngày làm việc nào');
  }
  return isHalfDay ? new Decimal('0.5') : new Decimal(days);
}

/** Số ngày còn lại = được hưởng − đã dùng (không âm). null = không giới hạn. */
export function remainingDays(
  entitled: Decimal | null,
  used: Decimal,
): Decimal | null {
  if (entitled === null) return null;
  return Decimal.max(entitled.minus(used), 0);
}
