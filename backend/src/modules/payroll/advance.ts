import Decimal from 'decimal.js';
import { divRound, roundVND, sum } from '../../common/utils/money';

/**
 * Tạm ứng lương và lịch khấu trừ.
 *
 * Khi chia một khoản tạm ứng thành N kỳ khấu trừ bằng nhau, làm tròn về đồng
 * có thể khiến tổng các kỳ lệch với số gốc vài đồng (bài toán đã ghi nhận ở
 * money.test). Quy tắc: các kỳ đầu bằng nhau (đã làm tròn), **kỳ cuối gánh
 * phần chênh lệch** để tổng khớp tuyệt đối với số tạm ứng.
 */

export interface Installment {
  index: number; // kỳ thứ mấy (1..N)
  amount: Decimal;
}

export function buildInstallmentSchedule(
  totalAmount: Decimal.Value,
  installments: number,
): Installment[] {
  const total = new Decimal(totalAmount);
  if (installments <= 0) {
    throw new Error('advance: số kỳ khấu trừ phải lớn hơn 0');
  }
  if (total.lessThanOrEqualTo(0)) return [];

  // Số tiền mỗi kỳ (làm tròn về đồng), áp dụng cho các kỳ trừ kỳ cuối.
  const perInstallment = roundVND(divRound(total, installments, 4));

  const schedule: Installment[] = [];
  for (let i = 1; i < installments; i++) {
    schedule.push({ index: i, amount: perInstallment });
  }

  // Kỳ cuối = tổng - các kỳ trước, để khớp tuyệt đối.
  const paidSoFar = sum(schedule.map((s) => s.amount));
  const lastAmount = total.minus(paidSoFar);
  schedule.push({ index: installments, amount: lastAmount });

  return schedule;
}

/** Kiểm tra: tổng lịch khấu trừ luôn bằng số tạm ứng. */
export function scheduleTotal(schedule: Installment[]): Decimal {
  return sum(schedule.map((s) => s.amount));
}
