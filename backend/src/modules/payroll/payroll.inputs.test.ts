import { describe, expect, it } from 'vitest';
import { aggregateElements } from './pay-element';
import { calcPayroll } from './payroll.calc';
import {
  buildPayrollInput,
  calcPaidDays,
  ElementDef,
  hourlyRate,
  isInsuranceExempt,
  overtimePay,
  prorate,
} from './payroll.inputs';

/*
 * Các ví dụ dưới đây do lập trình viên tự tính theo quy tắc trong
 * payroll.inputs.ts. CẦN KẾ TOÁN XÁC NHẬN trước khi dùng cho bảng lương thật.
 */

const lunch: ElementDef = {
  code: 'AN_CA',
  name: 'Phụ cấp ăn ca',
  type: 'EARNING',
  taxTreatment: 'PARTIAL_EXEMPT',
  taxExemptLimit: 730000,
  isInsuranceBase: false,
  isProrated: true,
};
const responsibility: ElementDef = {
  code: 'TRACH_NHIEM',
  name: 'Phụ cấp trách nhiệm',
  type: 'EARNING',
  taxTreatment: 'TAXABLE',
  isInsuranceBase: true,
  isProrated: true,
};
const bonus: ElementDef = {
  code: 'THUONG',
  name: 'Thưởng',
  type: 'EARNING',
  taxTreatment: 'TAXABLE',
  isInsuranceBase: false,
  isProrated: false,
};
const penalty: ElementDef = {
  code: 'PHAT',
  name: 'Phạt vi phạm',
  type: 'DEDUCTION',
  taxTreatment: 'TAXABLE',
  isInsuranceBase: false,
  isProrated: false,
};

describe('calcPaidDays / prorate', () => {
  it('trừ nghỉ không lương và vắng', () => {
    expect(calcPaidDays(22, 1.5, 1).toNumber()).toBe(19.5);
    expect(calcPaidDays(3, 5, 0).toNumber()).toBe(0);
  });

  it('đủ công giữ nguyên, thiếu công chia tỷ lệ và làm tròn đồng', () => {
    expect(prorate(20_000_000, 22, 22).toNumber()).toBe(20_000_000);
    // 20.000.000 × 20 / 22 = 18.181.818,18 → 18.181.818
    expect(prorate(20_000_000, 20, 22).toNumber()).toBe(18_181_818);
    // 730.000 × 20 / 22 = 663.636,36 → 663.636
    expect(prorate(730_000, 20, 22).toNumber()).toBe(663_636);
  });

  it('không làm việc 13 ngày vẫn đóng BH, từ 14 ngày thì không', () => {
    expect(isInsuranceExempt(22, 9)).toBe(false); // 22 − 9 = 13
    expect(isInsuranceExempt(22, 8)).toBe(true); // 22 − 8 = 14
  });
});

describe('buildPayrollInput + calcPayroll', () => {
  it('Ví dụ 1: đủ công, phụ cấp, thưởng, phạt, tạm ứng', () => {
    const built = buildPayrollInput({
      baseSalary: 20_000_000,
      contractInsuranceSalary: 20_000_000,
      recurring: [
        { element: lunch, amount: 730_000 },
        { element: responsibility, amount: 2_000_000 },
      ],
      oneOff: [
        { element: bonus, amount: 1_000_000 },
        { element: penalty, amount: 200_000 },
      ],
      advanceDeductions: [1_000_000],
      standardDays: 22,
      paidDays: 22,
    });
    // BH tính trên 20tr + trách nhiệm 2tr = 22tr
    expect(built.insuranceSalary.toNumber()).toBe(22_000_000);
    expect(built.insuranceExempt).toBe(false);

    const agg = aggregateElements(built.lines);
    // Chịu thuế: 20tr + 2tr + 1tr (ăn ca 730k trong mức miễn)
    expect(agg.taxableEarnings.toNumber()).toBe(23_000_000);
    expect(agg.nonTaxableEarnings.toNumber()).toBe(730_000);
    expect(agg.otherDeductions.toNumber()).toBe(1_200_000);

    const r = calcPayroll({
      taxableEarnings: [agg.taxableEarnings],
      nonTaxableEarnings: [agg.nonTaxableEarnings],
      insuranceSalary: built.insuranceSalary,
      region: 1,
      dependantCount: 0,
      taxMethod: 'PROGRESSIVE',
      otherDeductions: agg.otherDeductions,
    });
    // Gross 23.730.000; BH 10,5% × 22tr = 2.310.000
    expect(r.grossIncome.toNumber()).toBe(23_730_000);
    expect(r.empInsurance.toNumber()).toBe(2_310_000);
    // Thu nhập tính thuế = 23tr − 2,31tr − 15,5tr = 5.190.000 → bậc 1 (5%) = 259.500
    expect(r.assessableIncome.toNumber()).toBe(5_190_000);
    expect(r.pitAmount.toNumber()).toBe(259_500);
    // Thực lĩnh = 23.730.000 − 2.310.000 − 259.500 − 1.200.000 = 19.960.500
    expect(r.appliedOtherDeductions.toNumber()).toBe(1_200_000);
    expect(r.netPay.toNumber()).toBe(19_960_500);
  });

  it('Ví dụ 2: thiếu 2 công — lương và phụ cấp chia theo công, BH giữ nguyên', () => {
    const built = buildPayrollInput({
      baseSalary: 20_000_000,
      contractInsuranceSalary: 20_000_000,
      recurring: [{ element: lunch, amount: 730_000 }],
      oneOff: [],
      advanceDeductions: [],
      standardDays: 22,
      paidDays: 20,
    });
    expect(built.lines.find((l) => l.code === 'BASE')!.amount.toString()).toBe('18181818');
    expect(built.lines.find((l) => l.code === 'AN_CA')!.amount.toString()).toBe('663636');
    expect(built.insuranceSalary.toNumber()).toBe(20_000_000);
  });

  it('Ví dụ 3: vào làm ngày 21/9 (8/22 công) → không đóng BH', () => {
    const built = buildPayrollInput({
      baseSalary: 22_000_000,
      contractInsuranceSalary: 22_000_000,
      recurring: [],
      oneOff: [],
      advanceDeductions: [],
      standardDays: 22,
      paidDays: 8,
    });
    // 22.000.000 × 8 / 22 = 8.000.000
    expect(built.lines[0].amount.toString()).toBe('8000000');
    expect(built.insuranceExempt).toBe(true);
    expect(built.insuranceSalary.toNumber()).toBe(0);
  });

  it('khoản cố định không chia theo công thì giữ nguyên', () => {
    const fixed: ElementDef = { ...responsibility, code: 'XANG_XE', isProrated: false, isInsuranceBase: false };
    const built = buildPayrollInput({
      baseSalary: 10_000_000,
      contractInsuranceSalary: 10_000_000,
      recurring: [{ element: fixed, amount: 500_000 }],
      oneOff: [],
      advanceDeductions: [],
      standardDays: 22,
      paidDays: 11,
    });
    expect(built.lines.find((l) => l.code === 'XANG_XE')!.amount).toBe(500_000);
  });
});

describe('làm thêm giờ', () => {
  // Lương 22.000.000, công chuẩn 22 → 1.000.000/ngày → 125.000/giờ
  const hourly = hourlyRate(22_000_000, 22);

  it('lương giờ', () => {
    expect(hourly.toNumber()).toBe(125_000);
  });

  it('tách phần chịu thuế / miễn thuế', () => {
    // 4 giờ ngày thường 150%: 500.000 chịu thuế + 250.000 miễn thuế
    expect(overtimePay(hourly, 4, 1.5).taxable.toNumber()).toBe(500_000);
    expect(overtimePay(hourly, 4, 1.5).exempt.toNumber()).toBe(250_000);
    // 8 giờ chủ nhật 200%: 1.000.000 + 1.000.000
    expect(overtimePay(hourly, 8, 2).exempt.toNumber()).toBe(1_000_000);
    // 2 giờ đêm ngày lễ 390%: 250.000 + 725.000
    expect(overtimePay(hourly, 2, 3.9).taxable.toNumber()).toBe(250_000);
    expect(overtimePay(hourly, 2, 3.9).exempt.toNumber()).toBe(725_000);
  });

  it('Ví dụ 4: lương 22tr đủ công + 4h ngày thường + 8h chủ nhật', () => {
    const built = buildPayrollInput({
      baseSalary: 22_000_000,
      contractInsuranceSalary: 22_000_000,
      recurring: [],
      oneOff: [],
      advanceDeductions: [],
      standardDays: 22,
      paidDays: 22,
      overtime: [
        { hours: 4, multiplier: 1.5 },
        { hours: 8, multiplier: 2 },
      ],
    });
    const agg = aggregateElements(built.lines);
    // Chịu thuế: 22.000.000 + 500.000 + 1.000.000; miễn thuế: 250.000 + 1.000.000
    expect(agg.taxableEarnings.toNumber()).toBe(23_500_000);
    expect(agg.nonTaxableEarnings.toNumber()).toBe(1_250_000);
    // Làm thêm giờ không tính vào lương đóng BH
    expect(built.insuranceSalary.toNumber()).toBe(22_000_000);
    const r = calcPayroll({
      taxableEarnings: [agg.taxableEarnings],
      nonTaxableEarnings: [agg.nonTaxableEarnings],
      insuranceSalary: built.insuranceSalary,
      region: 1,
      dependantCount: 0,
      taxMethod: 'PROGRESSIVE',
    });
    // Gross 24.750.000; BH 2.310.000; TNTT = 23.500.000 − 2.310.000 − 15.500.000 = 5.690.000
    // Thuế: 10tr đầu 5% → 284.500; thực nhận 24.750.000 − 2.310.000 − 284.500 = 22.155.500
    expect(r.grossIncome.toNumber()).toBe(24_750_000);
    expect(r.assessableIncome.toNumber()).toBe(5_690_000);
    expect(r.pitAmount.toNumber()).toBe(284_500);
    expect(r.netPay.toNumber()).toBe(22_155_500);
  });
});

describe('khấu trừ chuyển từ kỳ trước', () => {
  it('phần vượt trần 30% kỳ trước thành một dòng khấu trừ kỳ này', () => {
    const built = buildPayrollInput({
      baseSalary: 10_000_000,
      contractInsuranceSalary: 10_000_000,
      recurring: [],
      oneOff: [],
      advanceDeductions: [1_000_000],
      carriedDeduction: 500_000,
      standardDays: 22,
      paidDays: 22,
    });
    const deductions = built.lines.filter((l) => l.type === 'DEDUCTION');
    expect(deductions.map((l) => l.code)).toEqual(['ADVANCE', 'CARRIED']);
    expect(aggregateElements(built.lines).otherDeductions.toNumber()).toBe(1_500_000);
  });
  it('không có phần hoãn thì không thêm dòng', () => {
    const built = buildPayrollInput({
      baseSalary: 10_000_000, contractInsuranceSalary: 10_000_000, recurring: [], oneOff: [],
      advanceDeductions: [], carriedDeduction: '0', standardDays: 22, paidDays: 22,
    });
    expect(built.lines.some((l) => l.code === 'CARRIED')).toBe(false);
  });
});
