import Decimal from 'decimal.js';
import { mul, divRound, roundVND } from '../../common/utils/money';

/**
 * Lương tháng 13.
 *
 * Cách phổ biến: thưởng = lương tháng * (số tháng làm việc trong năm / 12).
 * Nhân viên làm đủ 12 tháng nhận 1 tháng lương; làm ít hơn thì theo tỷ lệ.
 * `monthsWorked` nên tính theo số tháng thực tế trong năm tính thưởng.
 *
 * Lưu ý: lương tháng 13 là thu nhập CHỊU THUẾ TNCN, cộng vào thu nhập của
 * kỳ chi trả khi tính thuế (không xử lý ở đây, xử lý ở tầng tính lương).
 */
export function calcThirteenthMonth(
  monthlySalary: Decimal.Value,
  monthsWorked: number,
): Decimal {
  if (monthsWorked <= 0) return new Decimal(0);
  const cappedMonths = Math.min(monthsWorked, 12);
  const ratio = divRound(cappedMonths, 12, 10);
  return roundVND(mul(monthlySalary, ratio));
}
