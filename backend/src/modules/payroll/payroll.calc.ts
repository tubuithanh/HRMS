import Decimal from 'decimal.js';
import { sub, roundVND, sum } from '../../common/utils/money';
import { DEFAULT_LEGAL_PARAMS, LegalParams } from './payroll.params';
import { calcInsurance } from './insurance.calc';
import {
  calcProgressivePIT,
  calcFlat10,
  calcFlat20,
} from './pit.calc';
import { capDeduction } from './deduction';

export type TaxMethod = 'PROGRESSIVE' | 'FLAT_10' | 'FLAT_20';

export interface PayrollInput {
  /** Các khoản thu nhập chịu thuế (lương, phụ cấp chịu thuế, tăng ca chịu thuế...). */
  taxableEarnings: Decimal.Value[];
  /** Các khoản thu nhập KHÔNG chịu thuế (phần ăn ca, trang phục trong mức miễn...). */
  nonTaxableEarnings?: Decimal.Value[];
  /** Lương làm căn cứ đóng bảo hiểm. */
  insuranceSalary: Decimal.Value;
  /** Vùng lương tối thiểu (1..4). */
  region: number;
  /** Số người phụ thuộc được giảm trừ. */
  dependantCount: number;
  /** Cách tính thuế. */
  taxMethod: TaxMethod;
  /**
   * Các khoản khấu trừ khác ngoài thuế và bảo hiểm (tạm ứng, bồi thường...).
   * Bị áp trần 30% lương thực trả (xem capDeduction). Phần vượt trần được
   * báo trong `deferredDeduction` để chuyển kỳ sau.
   */
  otherDeductions?: Decimal.Value;
  /** Tham số pháp lý đang hiệu lực của kỳ; mặc định hằng số 2026. */
  legal?: LegalParams;
  /** Trần khấu trừ khác, % lương thực trả (Cấu hình hệ thống), mặc định 30. */
  deductionCapPercent?: number;
  /** Ngưỡng khấu trừ thuế 10% (Cấu hình hệ thống), mặc định 2.000.000đ. */
  flat10Threshold?: number;
}

export interface PayrollResultData {
  grossIncome: Decimal;
  taxableIncome: Decimal;
  insuranceBase: Decimal;
  empInsurance: Decimal;
  companyInsurance: Decimal;
  selfDeduction: Decimal;
  dependantCount: number;
  dependantDeduction: Decimal;
  assessableIncome: Decimal;
  pitAmount: Decimal;
  /** Lương thực lĩnh trước khi trừ các khoản khấu trừ khác. */
  netBeforeOtherDeductions: Decimal;
  /** Khấu trừ khác thực áp dụng kỳ này (đã áp trần 30%). */
  appliedOtherDeductions: Decimal;
  /** Phần khấu trừ vượt trần, chuyển kỳ sau. */
  deferredDeduction: Decimal;
  netPay: Decimal;
}

/**
 * Tính lương một nhân viên trong một kỳ.
 * Thứ tự: gross -> bảo hiểm -> thu nhập chịu thuế -> thu nhập tính thuế
 *         -> thuế TNCN -> thực lĩnh.
 */
export function calcPayroll(input: PayrollInput): PayrollResultData {
  const taxable = sum(input.taxableEarnings);
  const nonTaxable = sum(input.nonTaxableEarnings ?? []);
  const grossIncome = roundVND(taxable.plus(nonTaxable));

  // 1. Bảo hiểm
  const legal = input.legal ?? DEFAULT_LEGAL_PARAMS;
  const insurance = calcInsurance({
    rates: legal.insuranceRates,
    caps: { baseSalary: legal.baseSalary, minWageRegion: legal.minWageRegion },
    insuranceSalary: input.insuranceSalary,
    region: input.region,
  });

  // 2. Giảm trừ
  const selfDeduction = legal.personalDeduction;
  const dependantDeduction = legal.dependantDeduction.times(input.dependantCount);

  // 3. Thu nhập chịu thuế (chỉ phần chịu thuế, không gồm khoản miễn thuế)
  const taxableIncome = roundVND(taxable);

  // 4. Thu nhập tính thuế (chỉ áp dụng cho biểu lũy tiến)
  let pitAmount: Decimal;
  let assessableIncome = new Decimal(0);

  if (input.taxMethod === 'PROGRESSIVE') {
    assessableIncome = sub(
      sub(sub(taxableIncome, insurance.employeeTotal), selfDeduction),
      dependantDeduction,
    );
    if (assessableIncome.lessThan(0)) assessableIncome = new Decimal(0);
    pitAmount = calcProgressivePIT(assessableIncome, legal.pitBrackets);
  } else if (input.taxMethod === 'FLAT_10') {
    pitAmount = calcFlat10(taxableIncome, input.flat10Threshold);
  } else {
    pitAmount = calcFlat20(taxableIncome);
  }

  // 5. Lương thực lĩnh trước khấu trừ khác = gross - bảo hiểm NV - thuế
  const netBeforeOtherDeductions = roundVND(
    sub(sub(grossIncome, insurance.employeeTotal), pitAmount),
  );

  // 6. Áp trần 30% cho các khoản khấu trừ khác (bồi thường, tạm ứng...)
  const cap = capDeduction(
    input.otherDeductions ?? 0,
    netBeforeOtherDeductions,
    input.deductionCapPercent,
  );

  // 7. Thực lĩnh cuối cùng
  const netPay = roundVND(sub(netBeforeOtherDeductions, cap.applied));

  return {
    grossIncome,
    taxableIncome,
    insuranceBase: new Decimal(input.insuranceSalary),
    empInsurance: insurance.employeeTotal,
    companyInsurance: insurance.companyTotal,
    selfDeduction,
    dependantCount: input.dependantCount,
    dependantDeduction,
    assessableIncome,
    pitAmount,
    netBeforeOtherDeductions,
    appliedOtherDeductions: cap.applied,
    deferredDeduction: cap.deferred,
    netPay,
  };
}
