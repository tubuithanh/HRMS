import { describe, expect, it } from 'vitest';
import { buildDetailedPayslip } from './payslip.detail';
import { renderPayslipPdf } from './payslip.pdf';

const base = {
  companyName: 'Công ty Demo',
  employeeName: 'Nguyễn Văn A',
  employeeCode: 'NV001',
  orgName: 'Xưởng Lắp ráp',
  jobName: 'Công nhân',
  periodCode: '2026-09',
  periodStart: new Date('2026-09-01'),
  periodEnd: new Date('2026-09-30'),
  payDate: new Date('2026-10-05'),
};

// Số liệu của "Ví dụ 1" trong payroll.inputs.test.ts
const result = {
  grossIncome: '23730000',
  taxableIncome: '23000000',
  insuranceBase: '22000000',
  empInsurance: '2310000',
  companyInsurance: '4730000',
  selfDeduction: '15500000',
  dependantCount: 0,
  dependantDeduction: '0',
  assessableIncome: '5190000',
  pitAmount: '259500',
  otherDeductions: '1200000',
  deferredDeduction: '0',
  netPay: '19960500',
};

const snapshot = {
  base: '20000000',
  region: 1,
  taxMethod: 'PROGRESSIVE',
  standardDays: 22,
  paidDays: '22',
  lines: [
    { code: 'BASE', name: 'Lương theo ngày công', type: 'EARNING' as const, amount: '20000000', taxTreatment: 'TAXABLE' },
    { code: 'AN_CA', name: 'Phụ cấp ăn ca', type: 'EARNING' as const, amount: '730000', taxTreatment: 'PARTIAL_EXEMPT' },
    { code: 'TRACH_NHIEM', name: 'Phụ cấp trách nhiệm', type: 'EARNING' as const, amount: '2000000', taxTreatment: 'TAXABLE' },
    { code: 'THUONG', name: 'Thưởng', type: 'EARNING' as const, amount: '1000000', taxTreatment: 'TAXABLE' },
    { code: 'PHAT', name: 'Phạt vi phạm', type: 'DEDUCTION' as const, amount: '200000', taxTreatment: 'TAXABLE' },
    { code: 'ADVANCE', name: 'Trừ tạm ứng', type: 'DEDUCTION' as const, amount: '1000000', taxTreatment: 'TAXABLE' },
  ],
};

describe('buildDetailedPayslip', () => {
  const p = buildDetailedPayslip({ ...base, result, snapshot });
  const [income, deduction, tax] = p.sections!;

  it('thu nhập liệt kê từng khoản, tổng = gross', () => {
    expect(income.rows.map((r) => r.label)).toEqual(['Lương theo ngày công', 'Phụ cấp ăn ca', 'Phụ cấp trách nhiệm', 'Thưởng']);
    expect(income.rows[0].note).toMatch(/22\/22 công/);
    expect(income.rows[1].note).toBe('miễn thuế một phần');
    expect(income.total?.amount).toBe('23730000');
  });

  it('bảo hiểm tách 3 loại khớp tổng; khấu trừ khác liệt kê từng khoản', () => {
    // 8% / 1,5% / 1% của 22.000.000
    expect(deduction.rows.slice(0, 3).map((r) => r.amount)).toEqual(['1760000', '330000', '220000']);
    expect(deduction.rows.map((r) => r.label)).toContain('Phạt vi phạm');
    expect(deduction.rows.map((r) => r.label)).toContain('Trừ tạm ứng');
    // 2.310.000 + 259.500 + 1.200.000
    expect(deduction.total?.amount).toBe('3769500');
  });

  it('cách tính thuế: thu nhập tính thuế và thuế', () => {
    expect(tax.rows.find((r) => r.label === 'Thu nhập tính thuế')?.amount).toBe('5190000');
    expect(tax.rows[tax.rows.length - 1].amount).toBe('259500');
  });

  it('gross − tổng khấu trừ = thực lĩnh', () => {
    expect(Number(income.total!.amount) - Number(deduction.total!.amount)).toBe(Number(p.netPay));
  });

  it('không có snapshot (kỳ cũ) vẫn dựng được phiếu', () => {
    const old = buildDetailedPayslip({ ...base, result, snapshot: null });
    expect(old.sections![0].rows[0].amount).toBe('23730000');
  });

  it('xuất PDF hợp lệ', async () => {
    const pdf = await renderPayslipPdf(p);
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
  });
});
