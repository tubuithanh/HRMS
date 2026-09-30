import Decimal from 'decimal.js';
import { add, sub, mul, roundVND } from '../../common/utils/money';
import {
  PIT_BRACKETS_2026,
  TaxBracketDef,
  FLAT_10_RATE,
  FLAT_20_RATE,
} from './payroll.params';

/**
 * Tính thuế TNCN theo biểu lũy tiến từng phần.
 * Trả về số thuế đã làm tròn về đồng.
 *
 * assessableIncome = thu nhập tính thuế = thu nhập chịu thuế
 *   - bảo hiểm bắt buộc - giảm trừ bản thân - giảm trừ người phụ thuộc.
 */
export function calcProgressivePIT(
  assessableIncome: Decimal.Value,
  brackets: TaxBracketDef[] = PIT_BRACKETS_2026,
): Decimal {
  const income = new Decimal(assessableIncome);
  if (income.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }

  // Cộng dồn thuế của từng phần thu nhập nằm trong mỗi bậc.
  let tax = new Decimal(0);
  for (const b of brackets) {
    if (income.lessThanOrEqualTo(b.from)) break;

    const upper = b.to ?? income;
    const taxableInBracket = Decimal.min(income, upper).minus(b.from);
    if (taxableInBracket.greaterThan(0)) {
      tax = add(tax, mul(taxableInBracket, b.rate));
    }
  }
  return roundVND(tax);
}

/**
 * Cách tính nhanh (kiểm chứng chéo với cách lũy tiến ở trên):
 *   thuế = thu nhập tính thuế * rate của bậc cao nhất - quickDeduction
 */
export function calcProgressivePITQuick(
  assessableIncome: Decimal.Value,
  brackets: TaxBracketDef[] = PIT_BRACKETS_2026,
): Decimal {
  const income = new Decimal(assessableIncome);
  if (income.lessThanOrEqualTo(0)) return new Decimal(0);

  // Tìm bậc cao nhất mà thu nhập rơi vào.
  let applicable = brackets[0];
  for (const b of brackets) {
    if (income.greaterThan(b.from)) applicable = b;
  }
  return roundVND(sub(mul(income, applicable.rate), applicable.quickDeduction));
}

/** Khấu trừ 10% cho hợp đồng dưới 3 tháng (cư trú). */
export function calcFlat10(taxableIncome: Decimal.Value): Decimal {
  return roundVND(mul(taxableIncome, FLAT_10_RATE));
}

/** Thuế 20% toàn phần cho cá nhân không cư trú. */
export function calcFlat20(taxableIncome: Decimal.Value): Decimal {
  return roundVND(mul(taxableIncome, FLAT_20_RATE));
}
