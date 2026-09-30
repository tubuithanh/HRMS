import { describe, it, expect } from 'vitest';
import { buildInstallmentSchedule, scheduleTotal } from './advance';
import { buildPayslip } from './payslip';

describe('lịch khấu trừ tạm ứng', () => {
  it('chia đều khi chia hết', () => {
    const s = buildInstallmentSchedule(9_000_000, 3);
    expect(s.map((i) => i.amount.toString())).toEqual([
      '3000000',
      '3000000',
      '3000000',
    ]);
  });

  it('kỳ cuối gánh phần lẻ để tổng khớp tuyệt đối', () => {
    // 10.000.000 / 3 = 3.333.333,33 -> hai kỳ đầu 3.333.333, kỳ cuối bù
    const s = buildInstallmentSchedule(10_000_000, 3);
    expect(s[0].amount.toString()).toBe('3333333');
    expect(s[1].amount.toString()).toBe('3333333');
    expect(s[2].amount.toString()).toBe('3333334'); // kỳ cuối gánh lẻ
    // Tổng phải khớp tuyệt đối với số tạm ứng
    expect(scheduleTotal(s).toString()).toBe('10000000');
  });

  it('một kỳ -> khấu trừ toàn bộ', () => {
    const s = buildInstallmentSchedule(5_000_000, 1);
    expect(s).toHaveLength(1);
    expect(s[0].amount.toString()).toBe('5000000');
  });

  it('số kỳ <= 0 -> ném lỗi', () => {
    expect(() => buildInstallmentSchedule(1_000_000, 0)).toThrow();
  });
});

describe('phiếu lương', () => {
  it('lắp đủ các dòng và thực lĩnh', () => {
    const p = buildPayslip({
      employeeName: 'Nguyen Van A',
      employeeCode: 'NV001',
      periodCode: '2026-09',
      grossIncome: 30_000_000,
      empInsurance: 3_150_000,
      companyInsurance: 6_450_000,
      pitAmount: 257_500,
      netPay: 26_592_500,
    });
    expect(p.netPay).toBe('26592500');
    // Có dòng gross, bảo hiểm, thuế, và dòng tổng thực lĩnh
    const labels = p.lines.map((l) => l.group);
    expect(labels).toContain('EARNING');
    expect(labels).toContain('DEDUCTION');
    expect(labels).toContain('SUMMARY');
  });

  it('không hiện dòng khấu trừ khác khi bằng 0', () => {
    const p = buildPayslip({
      employeeName: 'A', employeeCode: 'X', periodCode: '2026-09',
      grossIncome: 20_000_000, empInsurance: 2_100_000,
      companyInsurance: 4_300_000, pitAmount: 0, netPay: 17_900_000,
    });
    const hasOther = p.lines.some((l) => l.label === 'Khấu trừ khác');
    expect(hasOther).toBe(false);
  });
});
