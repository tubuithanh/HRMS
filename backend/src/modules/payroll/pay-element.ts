import Decimal from 'decimal.js';
import { sum, roundVND } from '../../common/utils/money';

/**
 * Khoản lương (pay element) — đơn vị cấu thành bảng lương.
 * Mỗi khoản có: loại (thu nhập / khấu trừ), có tính vào lương đóng BHXH không,
 * cách xử lý thuế (chịu thuế / miễn thuế một phần / miễn thuế).
 */
export type ElementType = 'EARNING' | 'DEDUCTION';
export type TaxTreatment = 'TAXABLE' | 'PARTIAL_EXEMPT' | 'EXEMPT';

export interface PayElementLine {
  code: string;
  name: string;
  type: ElementType;
  amount: Decimal.Value;
  /** Có tính vào lương đóng bảo hiểm không (chỉ áp dụng cho EARNING). */
  isInsuranceBase?: boolean;
  taxTreatment?: TaxTreatment;
  /** Mức miễn thuế nếu PARTIAL_EXEMPT (phần vượt mới chịu thuế). */
  taxExemptLimit?: Decimal.Value;
}

export interface AggregatedElements {
  /** Tổng thu nhập chịu thuế (phần chịu thuế của mỗi khoản EARNING). */
  taxableEarnings: Decimal;
  /** Tổng thu nhập không chịu thuế. */
  nonTaxableEarnings: Decimal;
  /** Lương làm căn cứ đóng bảo hiểm (tổng các khoản isInsuranceBase). */
  insuranceBase: Decimal;
  /** Tổng các khoản khấu trừ khác (không gồm thuế và BH — hai khoản này
   *  được tính riêng trong calcPayroll). */
  otherDeductions: Decimal;
}

/**
 * Tính phần chịu thuế và phần miễn thuế của một khoản thu nhập.
 * - TAXABLE: toàn bộ chịu thuế.
 * - EXEMPT: toàn bộ miễn thuế.
 * - PARTIAL_EXEMPT: phần trong mức miễn được miễn, phần vượt chịu thuế.
 */
export function splitTaxable(line: PayElementLine): {
  taxable: Decimal;
  nonTaxable: Decimal;
} {
  const amount = new Decimal(line.amount);
  const treatment = line.taxTreatment ?? 'TAXABLE';

  if (treatment === 'TAXABLE') {
    return { taxable: amount, nonTaxable: new Decimal(0) };
  }
  if (treatment === 'EXEMPT') {
    return { taxable: new Decimal(0), nonTaxable: amount };
  }
  // PARTIAL_EXEMPT
  const limit = new Decimal(line.taxExemptLimit ?? 0);
  const nonTaxable = Decimal.min(amount, limit);
  const taxable = amount.minus(nonTaxable);
  return { taxable, nonTaxable };
}

/** Gộp một danh sách pay element thành các tổng đầu vào cho tính lương. */
export function aggregateElements(
  lines: PayElementLine[],
): AggregatedElements {
  const taxableList: Decimal[] = [];
  const nonTaxableList: Decimal[] = [];
  const insuranceList: Decimal[] = [];
  const deductionList: Decimal[] = [];

  for (const line of lines) {
    if (line.type === 'EARNING') {
      const { taxable, nonTaxable } = splitTaxable(line);
      taxableList.push(taxable);
      nonTaxableList.push(nonTaxable);
      if (line.isInsuranceBase) {
        insuranceList.push(new Decimal(line.amount));
      }
    } else {
      // DEDUCTION
      deductionList.push(new Decimal(line.amount));
    }
  }

  return {
    taxableEarnings: roundVND(sum(taxableList)),
    nonTaxableEarnings: roundVND(sum(nonTaxableList)),
    insuranceBase: roundVND(sum(insuranceList)),
    otherDeductions: roundVND(sum(deductionList)),
  };
}
