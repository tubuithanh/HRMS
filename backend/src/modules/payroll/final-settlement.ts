import Decimal from 'decimal.js';
import { add, mul, divRound, roundVND } from '../../common/utils/money';

/**
 * Tính thanh toán khi nghỉ việc theo Bộ luật Lao động Việt Nam.
 *
 * Các khoản chính:
 *  - Trợ cấp thôi việc = 1/2 tháng lương * số năm làm việc được tính,
 *    trong đó thời gian đã đóng bảo hiểm thất nghiệp KHÔNG được tính.
 *    Lương bình quân là lương bình quân 6 tháng liền kề theo hợp đồng.
 *  - Tiền phép năm chưa nghỉ = (số ngày phép còn) * (lương ngày).
 *
 * Trợ cấp mất việc làm (thay đổi cơ cấu/công nghệ) = 1 tháng lương * số năm,
 * tối thiểu 2 tháng lương — được tính khi có cờ isRedundancy.
 */

export interface FinalSettlementInput {
  /** Tổng thời gian làm việc (tháng). */
  totalWorkedMonths: number;
  /** Thời gian đã tham gia BHTN (tháng) — trừ khỏi thời gian tính trợ cấp. */
  unemploymentInsuredMonths: number;
  /** Lương bình quân 6 tháng liền kề (đồng/tháng). */
  avgSalary6Months: Decimal.Value;
  /** Số ngày phép năm chưa nghỉ. */
  unusedLeaveDays: number;
  /** Số ngày công chuẩn trong tháng để quy ra lương ngày (mặc định 26). */
  standardDaysPerMonth?: number;
  /** Trợ cấp mất việc thay vì thôi việc (thay đổi cơ cấu/công nghệ). */
  isRedundancy?: boolean;
}

export interface FinalSettlementResult {
  severanceYears: Decimal; // số năm được tính (làm tròn theo luật)
  severanceAmount: Decimal;
  unusedLeaveAmount: Decimal;
  total: Decimal;
}

/**
 * Làm tròn số năm theo luật: dưới 1 tháng lẻ bỏ qua; từ đủ 1 đến dưới 6
 * tháng tính 1/2 năm; từ đủ 6 tháng tính 1 năm.
 */
export function roundSeveranceYears(eligibleMonths: number): Decimal {
  if (eligibleMonths <= 0) return new Decimal(0);
  const fullYears = Math.floor(eligibleMonths / 12);
  const remainderMonths = eligibleMonths % 12;

  let fraction = new Decimal(0);
  if (remainderMonths >= 6) {
    fraction = new Decimal(1);
  } else if (remainderMonths >= 1) {
    fraction = new Decimal('0.5');
  }
  return new Decimal(fullYears).plus(fraction);
}

export function calcFinalSettlement(
  input: FinalSettlementInput,
): FinalSettlementResult {
  const stdDays = input.standardDaysPerMonth ?? 26;
  const avg = new Decimal(input.avgSalary6Months);

  // Số tháng được tính trợ cấp = tổng thời gian - thời gian đã đóng BHTN
  const eligibleMonths = Math.max(
    0,
    input.totalWorkedMonths - input.unemploymentInsuredMonths,
  );
  const severanceYears = roundSeveranceYears(eligibleMonths);

  // Hệ số tháng lương: thôi việc 0,5 / mất việc 1,0
  const monthFactor = input.isRedundancy ? new Decimal(1) : new Decimal('0.5');
  let severanceAmount = roundVND(
    mul(mul(severanceYears, monthFactor), avg),
  );

  // Trợ cấp mất việc tối thiểu 2 tháng lương
  if (input.isRedundancy) {
    const minAmount = roundVND(mul(avg, 2));
    if (severanceAmount.lessThan(minAmount)) {
      severanceAmount = minAmount;
    }
  }

  // Tiền phép chưa nghỉ = số ngày * lương ngày
  const dailyWage = divRound(avg, stdDays, 4);
  const unusedLeaveAmount = roundVND(mul(dailyWage, input.unusedLeaveDays));

  return {
    severanceYears,
    severanceAmount,
    unusedLeaveAmount,
    total: roundVND(add(severanceAmount, unusedLeaveAmount)),
  };
}
