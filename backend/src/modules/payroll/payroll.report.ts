import ExcelJS from 'exceljs';

/**
 * Báo cáo bảng lương tổng hợp một kỳ, xuất file Excel (.xlsx).
 * Trả về Buffer để tầng route stream cho người dùng tải.
 */

export interface PayrollReportRow {
  employeeCode: string;
  employeeName: string;
  grossIncome: number;
  empInsurance: number;
  companyInsurance: number;
  pitAmount: number;
  netPay: number;
}

export async function buildPayrollReportXlsx(
  periodCode: string,
  rows: PayrollReportRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ATECH HRM';
  const ws = wb.addWorksheet(`Bang luong ${periodCode}`);

  ws.columns = [
    { header: 'Mã NV', key: 'employeeCode', width: 14 },
    { header: 'Họ tên', key: 'employeeName', width: 28 },
    { header: 'Tổng thu nhập', key: 'grossIncome', width: 16 },
    { header: 'BH (NV đóng)', key: 'empInsurance', width: 16 },
    { header: 'BH (DN đóng)', key: 'companyInsurance', width: 16 },
    { header: 'Thuế TNCN', key: 'pitAmount', width: 14 },
    { header: 'Thực lĩnh', key: 'netPay', width: 16 },
  ];

  // Định dạng tiêu đề
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { horizontal: 'center' };

  const moneyFmt = '#,##0';
  for (const r of rows) {
    ws.addRow(r);
  }
  // Định dạng cột tiền
  ['grossIncome', 'empInsurance', 'companyInsurance', 'pitAmount', 'netPay'].forEach(
    (key) => {
      ws.getColumn(key).numFmt = moneyFmt;
    },
  );

  // Dòng tổng cộng
  const totalRow = ws.addRow({
    employeeName: 'TỔNG CỘNG',
    grossIncome: rows.reduce((s, r) => s + r.grossIncome, 0),
    empInsurance: rows.reduce((s, r) => s + r.empInsurance, 0),
    companyInsurance: rows.reduce((s, r) => s + r.companyInsurance, 0),
    pitAmount: rows.reduce((s, r) => s + r.pitAmount, 0),
    netPay: rows.reduce((s, r) => s + r.netPay, 0),
  });
  totalRow.font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
