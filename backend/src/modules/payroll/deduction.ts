import Decimal from 'decimal.js';
import { mul, roundVND } from '../../common/utils/money';

/**
 * Giới hạn khấu trừ để bồi thường thiệt hại.
 * Theo Bộ luật Lao động, mức khấu trừ hằng tháng không vượt quá 30% tiền
 * lương thực trả (sau khi đã trừ bảo hiểm và thuế).
 *
 * Trả về số thực khấu trừ (đã áp trần) và phần bị hoãn sang kỳ sau.
 */
export interface CappedDeduction {
  applied: Decimal; // số được khấu trừ kỳ này
  deferred: Decimal; // phần vượt trần, chuyển kỳ sau
  cap: Decimal; // mức trần 30%
}

export function capDeduction(
  requestedDeduction: Decimal.Value,
  netBeforeOtherDeductions: Decimal.Value,
): CappedDeduction {
  const requested = new Decimal(requestedDeduction);
  const cap = roundVND(mul(netBeforeOtherDeductions, '0.30'));

  if (requested.lessThanOrEqualTo(cap)) {
    return { applied: requested, deferred: new Decimal(0), cap };
  }
  return { applied: cap, deferred: requested.minus(cap), cap };
}
