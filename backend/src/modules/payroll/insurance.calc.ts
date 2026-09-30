import Decimal from 'decimal.js';
import { mul, sum, roundVND } from '../../common/utils/money';
import {
  BASE_SALARY,
  INSURANCE_RATES_VN,
  InsuranceRateDef,
  MIN_WAGE_REGION,
} from './payroll.params';

export interface InsuranceInput {
  /** Lương làm căn cứ đóng bảo hiểm (đồng/tháng). */
  insuranceSalary: Decimal.Value;
  /** Vùng lương tối thiểu (1..4), dùng cho trần BHTN. */
  region: number;
  /** Bộ tỷ lệ áp dụng; mặc định là tỷ lệ nhân viên Việt Nam. */
  rates?: InsuranceRateDef[];
  /** Lương cơ sở / lương tối thiểu vùng để tính trần; mặc định hằng số 2026. */
  caps?: { baseSalary: Decimal.Value; minWageRegion: Record<number, Decimal.Value> };
}

export interface InsuranceBreakdownItem {
  type: string;
  cappedBase: Decimal;
  employee: Decimal;
  company: Decimal;
}

export interface InsuranceResult {
  items: InsuranceBreakdownItem[];
  employeeTotal: Decimal; // tổng NV đóng (trừ vào lương)
  companyTotal: Decimal; // tổng DN đóng
}

/** Trần đóng của một khoản bảo hiểm. */
function capBase(rate: InsuranceRateDef, region: number, caps?: InsuranceInput['caps']): Decimal {
  if (rate.capBase === 'BASE_SALARY') {
    return mul(caps?.baseSalary ?? BASE_SALARY, rate.capMultiplier);
  }
  const regionWage = caps ? caps.minWageRegion[region] : MIN_WAGE_REGION[region];
  if (!regionWage) {
    throw new Error(`insurance: vùng lương tối thiểu không hợp lệ: ${region}`);
  }
  return mul(regionWage, rate.capMultiplier);
}

/**
 * Tính các khoản bảo hiểm bắt buộc.
 * Lương đóng bị giới hạn bởi mức trần của từng loại bảo hiểm.
 */
export function calcInsurance(input: InsuranceInput): InsuranceResult {
  const rates = input.rates ?? INSURANCE_RATES_VN;
  const salary = new Decimal(input.insuranceSalary);

  const items: InsuranceBreakdownItem[] = rates.map((rate) => {
    const cap = capBase(rate, input.region, input.caps);
    // Lương đóng lấy min(lương thực, trần)
    const cappedBase = salary.greaterThan(cap) ? cap : salary;
    return {
      type: rate.type,
      cappedBase,
      employee: roundVND(mul(cappedBase, rate.employeeRate)),
      company: roundVND(mul(cappedBase, rate.companyRate)),
    };
  });

  return {
    items,
    employeeTotal: sum(items.map((i) => i.employee)),
    companyTotal: sum(items.map((i) => i.company)),
  };
}
