import Decimal from 'decimal.js';

/**
 * Lắp ráp dữ liệu phiếu lương từ kết quả tính lương.
 * Tách phần LẮP DỮ LIỆU (thuần, test được) khỏi phần RENDER PDF (phụ thuộc
 * thư viện). Nhờ đó kiểm thử được nội dung phiếu lương mà không cần tạo PDF.
 */

export interface PayslipLine {
  label: string;
  amount: string; // đã định dạng chuỗi số
  group: 'EARNING' | 'DEDUCTION' | 'EMPLOYER' | 'SUMMARY';
}

export interface PayslipRow {
  label: string;
  amount: string; // chuỗi số, có thể có dấu "-" ở đầu
  note?: string;
  bold?: boolean;
}

export interface PayslipSection {
  title: string;
  rows: PayslipRow[];
  total?: { label: string; amount: string };
}

export interface PayslipData {
  employeeName: string;
  employeeCode: string;
  periodCode: string;
  lines: PayslipLine[];
  netPay: string;
  /** Phiếu chi tiết (xem payslip.detail.ts); phiếu tóm tắt chỉ có `lines`. */
  companyName?: string;
  info?: Array<[string, string]>;
  sections?: PayslipSection[];
  notes?: string[];
}

export interface PayslipInput {
  employeeName: string;
  employeeCode: string;
  periodCode: string;
  grossIncome: Decimal.Value;
  empInsurance: Decimal.Value;
  companyInsurance: Decimal.Value;
  pitAmount: Decimal.Value;
  otherDeductions?: Decimal.Value;
  netPay: Decimal.Value;
}

const fmt = (v: Decimal.Value) => new Decimal(v).toFixed(0);

export function buildPayslip(input: PayslipInput): PayslipData {
  const lines: PayslipLine[] = [
    { label: 'Tổng thu nhập (Gross)', amount: fmt(input.grossIncome), group: 'EARNING' },
    { label: 'Bảo hiểm (người lao động)', amount: fmt(input.empInsurance), group: 'DEDUCTION' },
    { label: 'Thuế TNCN', amount: fmt(input.pitAmount), group: 'DEDUCTION' },
  ];

  if (input.otherDeductions && new Decimal(input.otherDeductions).greaterThan(0)) {
    lines.push({
      label: 'Khấu trừ khác',
      amount: fmt(input.otherDeductions),
      group: 'DEDUCTION',
    });
  }

  lines.push({
    label: 'Bảo hiểm (doanh nghiệp đóng)',
    amount: fmt(input.companyInsurance),
    group: 'EMPLOYER',
  });

  lines.push({
    label: 'Thực lĩnh (Net)',
    amount: fmt(input.netPay),
    group: 'SUMMARY',
  });

  return {
    employeeName: input.employeeName,
    employeeCode: input.employeeCode,
    periodCode: input.periodCode,
    lines,
    netPay: fmt(input.netPay),
  };
}

/**
 * Kết xuất phiếu lương thành HTML đơn giản (dùng cho xem trước hoặc chuyển
 * thành PDF bằng thư viện ở tầng ngoài). Không phụ thuộc thư viện nào.
 */
export function payslipToHtml(data: PayslipData): string {
  const rows = data.lines
    .map(
      (l) =>
        `<tr class="${l.group.toLowerCase()}"><td>${l.label}</td><td style="text-align:right">${l.amount}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Phiếu lương ${data.periodCode}</title></head><body>
<h2>Phiếu lương — ${data.periodCode}</h2>
<p>Nhân viên: <strong>${data.employeeName}</strong> (${data.employeeCode})</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
${rows}
</table></body></html>`;
}
