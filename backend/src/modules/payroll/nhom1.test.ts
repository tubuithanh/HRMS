import { describe, it, expect } from 'vitest';
import { aggregateElements, splitTaxable, PayElementLine } from './pay-element';
import { capDeduction } from './deduction';
import { calcThirteenthMonth } from './thirteenth-month';
import { checkMinWage, checkVariance } from './payroll-validation';
import { calcPayroll } from './payroll.calc';

describe('pay element - tách chịu thuế', () => {
  it('TAXABLE: toàn bộ chịu thuế', () => {
    const r = splitTaxable({ code: 'BASE', name: 'Lương', type: 'EARNING', amount: 20_000_000 });
    expect(r.taxable.toString()).toBe('20000000');
    expect(r.nonTaxable.toString()).toBe('0');
  });

  it('EXEMPT: toàn bộ miễn thuế', () => {
    const r = splitTaxable({ code: 'MEAL', name: 'Ăn ca', type: 'EARNING', amount: 730_000, taxTreatment: 'EXEMPT' });
    expect(r.nonTaxable.toString()).toBe('730000');
    expect(r.taxable.toString()).toBe('0');
  });

  it('PARTIAL_EXEMPT: miễn trong mức, phần vượt chịu thuế', () => {
    const r = splitTaxable({
      code: 'MEAL', name: 'Ăn ca', type: 'EARNING',
      amount: 1_000_000, taxTreatment: 'PARTIAL_EXEMPT', taxExemptLimit: 730_000,
    });
    expect(r.nonTaxable.toString()).toBe('730000');
    expect(r.taxable.toString()).toBe('270000');
  });
});

describe('pay element - gộp', () => {
  it('gộp lương CB + phụ cấp + ăn ca + khấu trừ', () => {
    const lines: PayElementLine[] = [
      { code: 'BASE', name: 'Lương CB', type: 'EARNING', amount: 20_000_000, isInsuranceBase: true },
      { code: 'POS', name: 'Phụ cấp CV', type: 'EARNING', amount: 3_000_000 },
      { code: 'MEAL', name: 'Ăn ca', type: 'EARNING', amount: 730_000, taxTreatment: 'EXEMPT' },
      { code: 'UNION', name: 'Đoàn phí', type: 'DEDUCTION', amount: 50_000 },
    ];
    const agg = aggregateElements(lines);
    expect(agg.taxableEarnings.toString()).toBe('23000000');
    expect(agg.nonTaxableEarnings.toString()).toBe('730000');
    expect(agg.insuranceBase.toString()).toBe('20000000');
    expect(agg.otherDeductions.toString()).toBe('50000');
  });
});

describe('khấu trừ - trần 30%', () => {
  it('dưới trần: khấu trừ toàn bộ', () => {
    const r = capDeduction(5_000_000, 20_000_000);
    expect(r.applied.toString()).toBe('5000000');
    expect(r.deferred.toString()).toBe('0');
  });

  it('vượt trần: chỉ khấu trừ 30%, phần vượt hoãn kỳ sau', () => {
    const r = capDeduction(8_000_000, 20_000_000);
    expect(r.cap.toString()).toBe('6000000');
    expect(r.applied.toString()).toBe('6000000');
    expect(r.deferred.toString()).toBe('2000000');
  });
});

describe('lương tháng 13', () => {
  it('làm đủ 12 tháng -> 1 tháng lương', () => {
    expect(calcThirteenthMonth(15_000_000, 12).toString()).toBe('15000000');
  });
  it('làm 6 tháng -> nửa tháng lương', () => {
    expect(calcThirteenthMonth(15_000_000, 6).toString()).toBe('7500000');
  });
  it('làm hơn 12 tháng vẫn tối đa 1 tháng', () => {
    expect(calcThirteenthMonth(15_000_000, 15).toString()).toBe('15000000');
  });
});

describe('kiểm tra sau tính lương', () => {
  it('lương dưới tối thiểu vùng -> lỗi', () => {
    const c = checkMinWage(5_000_000, 1); // vùng I là 5.310.000
    expect(c?.severity).toBe('ERROR');
    expect(c?.code).toBe('BELOW_MIN_WAGE');
  });
  it('lương đạt tối thiểu vùng -> không lỗi', () => {
    expect(checkMinWage(6_000_000, 1)).toBeNull();
  });
  it('chênh lệch lớn so với kỳ trước -> cảnh báo', () => {
    const c = checkVariance(30_000_000, 20_000_000);
    expect(c?.severity).toBe('WARNING');
  });
  it('chênh lệch nhỏ -> không cảnh báo', () => {
    expect(checkVariance(21_000_000, 20_000_000)).toBeNull();
  });
});

describe('tính lương với khấu trừ khác (tích hợp)', () => {
  it('áp trần khấu trừ vào thực lĩnh', () => {
    // gross 30tr, vùng I, 1 phụ thuộc -> net trước khấu trừ 26.592.500
    // khấu trừ yêu cầu 10tr, trần 30% = 7.977.750 -> applied 7.977.750
    const r = calcPayroll({
      taxableEarnings: [30_000_000],
      insuranceSalary: 30_000_000,
      region: 1,
      dependantCount: 1,
      taxMethod: 'PROGRESSIVE',
      otherDeductions: 10_000_000,
    });
    expect(r.netBeforeOtherDeductions.toString()).toBe('26592500');
    expect(r.appliedOtherDeductions.toString()).toBe('7977750');
    expect(r.deferredDeduction.toString()).toBe('2022250');
    expect(r.netPay.toString()).toBe('18614750');
  });
});
