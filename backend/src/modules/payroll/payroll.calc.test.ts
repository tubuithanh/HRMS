import { describe, it, expect } from 'vitest';
import { calcInsurance } from './insurance.calc';
import { calcPayroll } from './payroll.calc';

describe('Bảo hiểm bắt buộc', () => {
  it('lương dưới trần: 30tr, vùng I -> NV đóng 3.150.000', () => {
    const r = calcInsurance({ insuranceSalary: 30_000_000, region: 1 });
    expect(r.employeeTotal.toString()).toBe('3150000');
  });

  it('lương trên trần BHXH/BHYT: 50tr, vùng I -> NV đóng 4.946.000', () => {
    // BHXH+BHYT tính trên trần 46,8tr; BHTN tính trên 50tr (dưới trần BHTN)
    const r = calcInsurance({ insuranceSalary: 50_000_000, region: 1 });
    expect(r.employeeTotal.toString()).toBe('4946000');
  });

  it('phần trần áp dụng đúng cho từng loại', () => {
    const r = calcInsurance({ insuranceSalary: 50_000_000, region: 1 });
    const social = r.items.find((i) => i.type === 'SOCIAL')!;
    const unemp = r.items.find((i) => i.type === 'UNEMPLOYMENT')!;
    // BHXH bị chặn ở trần 46,8tr
    expect(social.cappedBase.toString()).toBe('46800000');
    // BHTN chưa chạm trần (106,2tr) nên tính trên 50tr
    expect(unemp.cappedBase.toString()).toBe('50000000');
  });
});

describe('Tính lương trọn vẹn', () => {
  it('Ví dụ 1: lương 30tr, vùng I, 1 phụ thuộc, lũy tiến', () => {
    const r = calcPayroll({
      taxableEarnings: [30_000_000],
      insuranceSalary: 30_000_000,
      region: 1,
      dependantCount: 1,
      taxMethod: 'PROGRESSIVE',
    });
    expect(r.empInsurance.toString()).toBe('3150000');
    expect(r.dependantDeduction.toString()).toBe('6200000');
    expect(r.assessableIncome.toString()).toBe('5150000');
    expect(r.pitAmount.toString()).toBe('257500');
    expect(r.netPay.toString()).toBe('26592500');
  });

  it('Ví dụ 2: lương 50tr, vùng I, 2 phụ thuộc, lũy tiến', () => {
    const r = calcPayroll({
      taxableEarnings: [50_000_000],
      insuranceSalary: 50_000_000,
      region: 1,
      dependantCount: 2,
      taxMethod: 'PROGRESSIVE',
    });
    expect(r.empInsurance.toString()).toBe('4946000');
    expect(r.assessableIncome.toString()).toBe('17154000');
    expect(r.pitAmount.toString()).toBe('1215400');
    expect(r.netPay.toString()).toBe('43838600');
  });

  it('Lương thấp không phát sinh thuế: 15tr, 0 phụ thuộc', () => {
    const r = calcPayroll({
      taxableEarnings: [15_000_000],
      insuranceSalary: 15_000_000,
      region: 1,
      dependantCount: 0,
      taxMethod: 'PROGRESSIVE',
    });
    // 15tr - 1,575tr BH - 15,5tr giảm trừ < 0 -> không nộp thuế
    expect(r.assessableIncome.toString()).toBe('0');
    expect(r.pitAmount.toString()).toBe('0');
  });

  it('Khoản miễn thuế không vào thu nhập tính thuế nhưng vào gross', () => {
    const r = calcPayroll({
      taxableEarnings: [20_000_000],
      nonTaxableEarnings: [730_000], // ăn ca trong mức miễn
      insuranceSalary: 20_000_000,
      region: 1,
      dependantCount: 0,
      taxMethod: 'PROGRESSIVE',
    });
    expect(r.grossIncome.toString()).toBe('20730000');
    expect(r.taxableIncome.toString()).toBe('20000000');
  });
});
