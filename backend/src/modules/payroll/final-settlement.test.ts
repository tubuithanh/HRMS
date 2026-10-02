import { describe, it, expect } from 'vitest';
import {
  calcFinalSettlement,
  roundSeveranceYears,
} from './final-settlement';

describe('roundSeveranceYears', () => {
  it('dưới 1 tháng lẻ -> bỏ qua', () => {
    expect(roundSeveranceYears(12).toString()).toBe('1'); // đúng 1 năm
    expect(roundSeveranceYears(0).toString()).toBe('0');
  });
  it('lẻ từ 1 đến dưới 6 tháng -> 0,5 năm', () => {
    expect(roundSeveranceYears(16).toString()).toBe('1.5'); // 1 năm 4 tháng
  });
  it('lẻ đúng 6 tháng -> 0,5 năm; trên 6 tháng -> 1 năm (NĐ 145/2020)', () => {
    expect(roundSeveranceYears(18).toString()).toBe('1.5'); // 1 năm 6 tháng
    expect(roundSeveranceYears(19).toString()).toBe('2'); // 1 năm 7 tháng
  });
});

describe('calcFinalSettlement', () => {
  it('trợ cấp thôi việc: loại trừ thời gian đóng BHTN', () => {
    const r = calcFinalSettlement({
      totalWorkedMonths: 40,
      unemploymentInsuredMonths: 24,
      avgSalary6Months: 20_000_000,
      unusedLeaveDays: 5,
    });
    // eligible 16 tháng -> 1,5 năm; 1,5 * 0,5 * 20tr = 15tr
    expect(r.severanceYears.toString()).toBe('1.5');
    expect(r.severanceAmount.toString()).toBe('15000000');
    // phép: 20tr/26*5 = 3.846.154
    expect(r.unusedLeaveAmount.toString()).toBe('3846154');
    expect(r.total.toString()).toBe('18846154');
  });

  it('đã đóng BHTN toàn bộ -> không có trợ cấp thôi việc', () => {
    const r = calcFinalSettlement({
      totalWorkedMonths: 40,
      unemploymentInsuredMonths: 40,
      avgSalary6Months: 20_000_000,
      unusedLeaveDays: 0,
    });
    expect(r.severanceAmount.toString()).toBe('0');
    expect(r.total.toString()).toBe('0');
  });

  it('trợ cấp mất việc: tối thiểu 2 tháng lương', () => {
    const r = calcFinalSettlement({
      totalWorkedMonths: 16,
      unemploymentInsuredMonths: 0,
      avgSalary6Months: 20_000_000,
      unusedLeaveDays: 0,
      isRedundancy: true,
    });
    // 16 tháng -> 1,5 năm; 1,5 * 1 * 20tr = 30tr, nhưng min 2*20tr = 40tr
    expect(r.severanceAmount.toString()).toBe('40000000');
  });
});

describe('mất việc — toàn bộ thời gian đã đóng BHTN', () => {
  it('không còn thời gian tính trợ cấp → không áp mức tối thiểu 2 tháng', () => {
    const r = calcFinalSettlement({ totalWorkedMonths: 36, unemploymentInsuredMonths: 36, avgSalary6Months: 20_000_000, unusedLeaveDays: 0, isRedundancy: true });
    expect(r.severanceAmount.toString()).toBe('0');
  });
});
