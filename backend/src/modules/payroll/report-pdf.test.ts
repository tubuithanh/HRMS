import { describe, it, expect } from 'vitest';
import { buildPayrollReportXlsx } from './payroll.report';
import { renderPayslipPdf } from './payslip.pdf';
import { buildPayslip } from './payslip';

describe('báo cáo bảng lương Excel', () => {
  it('tạo file xlsx hợp lệ (header PK) với tiếng Việt', async () => {
    const buf = await buildPayrollReportXlsx('2026-09', [
      {
        employeeCode: 'NV001',
        employeeName: 'Nguyễn Văn A',
        grossIncome: 30_000_000,
        empInsurance: 3_150_000,
        companyInsurance: 6_450_000,
        pitAmount: 257_500,
        netPay: 26_592_500,
      },
    ]);
    // XLSX là file zip -> bắt đầu bằng 'PK'
    expect(buf.slice(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe('phiếu lương PDF', () => {
  it('tạo file PDF hợp lệ (header %PDF) với tiếng Việt', async () => {
    const data = buildPayslip({
      employeeName: 'Nguyễn Văn A',
      employeeCode: 'NV001',
      periodCode: '2026-09',
      grossIncome: 30_000_000,
      empInsurance: 3_150_000,
      companyInsurance: 6_450_000,
      pitAmount: 257_500,
      netPay: 26_592_500,
    });
    const pdf = await renderPayslipPdf(data);
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
