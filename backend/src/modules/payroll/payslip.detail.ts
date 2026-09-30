import Decimal from 'decimal.js';
import { calcInsurance } from './insurance.calc';
import { LegalParams } from './payroll.params';
import { PayslipData, PayslipSection } from './payslip';

/**
 * Dựng phiếu lương CHI TIẾT từ một kết quả lương đã lưu và snapshot đầu vào.
 * Hàm thuần: không đọc database, nhận đủ dữ liệu từ tầng service.
 */

export interface SnapshotLine {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  amount: string;
  taxTreatment: string;
}

export interface PayrollSnapshot {
  base?: string;
  insSalary?: string;
  region?: number;
  taxMethod?: string;
  standardDays?: number;
  paidDays?: string;
  unpaidLeave?: number;
  absent?: number;
  overtimeHours?: number;
  insuranceExempt?: boolean;
  lines?: SnapshotLine[];
}

export interface DetailedPayslipInput {
  companyName: string;
  employeeName: string;
  employeeCode: string;
  orgName: string | null;
  jobName: string | null;
  periodCode: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date | null;
  result: {
    grossIncome: Decimal.Value;
    taxableIncome: Decimal.Value;
    insuranceBase: Decimal.Value;
    empInsurance: Decimal.Value;
    companyInsurance: Decimal.Value;
    selfDeduction: Decimal.Value;
    dependantCount: number;
    dependantDeduction: Decimal.Value;
    assessableIncome: Decimal.Value;
    pitAmount: Decimal.Value;
    otherDeductions: Decimal.Value;
    deferredDeduction: Decimal.Value;
    netPay: Decimal.Value;
  };
  snapshot: PayrollSnapshot | null;
  /** Tham số pháp lý của kỳ (để tách BHXH/BHYT/BHTN đúng tỷ lệ thời điểm đó). */
  legal?: LegalParams;
}

const fmt = (v: Decimal.Value) => new Decimal(v).toFixed(0);
/** Số trừ đi: "-1000"; bằng 0 thì để "0" (không hiện "−0"). */
const minus = (v: Decimal.Value) => (new Decimal(v).isZero() ? '0' : `-${fmt(v)}`);
const dmy = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const INSURANCE_LABEL: Record<string, string> = {
  SOCIAL: 'Bảo hiểm xã hội (8%)',
  HEALTH: 'Bảo hiểm y tế (1,5%)',
  UNEMPLOYMENT: 'Bảo hiểm thất nghiệp (1%)',
};
const TAX_NOTE: Record<string, string> = {
  TAXABLE: '',
  PARTIAL_EXEMPT: 'miễn thuế một phần',
  EXEMPT: 'miễn thuế',
};

export function buildDetailedPayslip(input: DetailedPayslipInput): PayslipData {
  const r = input.result;
  const s = input.snapshot ?? {};
  const lines = s.lines ?? [];

  // ---------- I. Thu nhập ----------
  const earnings = lines.filter((l) => l.type === 'EARNING' && new Decimal(l.amount).gt(0));
  const earningRows = earnings.length
    ? earnings.map((l) => ({
        label: l.name,
        note:
          l.code === 'BASE' && s.standardDays
            ? `${new Decimal(s.paidDays ?? s.standardDays).toString()}/${s.standardDays} công · lương HĐ ${Number(s.base).toLocaleString('vi-VN')}`
            : TAX_NOTE[l.taxTreatment] || undefined,
        amount: fmt(l.amount),
      }))
    : [{ label: 'Tổng thu nhập', amount: fmt(r.grossIncome) }];

  // ---------- II. Khấu trừ ----------
  const insurance =
    s.region && new Decimal(r.insuranceBase).gt(0)
      ? calcInsurance({
          insuranceSalary: r.insuranceBase,
          region: s.region,
          rates: input.legal?.insuranceRates,
          caps: input.legal ? { baseSalary: input.legal.baseSalary, minWageRegion: input.legal.minWageRegion } : undefined,
        })
      : null;
  // Chỉ tách chi tiết khi khớp với tổng đã lưu (tỷ lệ có thể đã đổi sau kỳ này).
  const insuranceRows =
    insurance && insurance.employeeTotal.eq(r.empInsurance)
      ? insurance.items.map((i) => ({ label: INSURANCE_LABEL[i.type] ?? i.type, amount: fmt(i.employee) }))
      : [{ label: 'Bảo hiểm bắt buộc (NLĐ đóng)', amount: fmt(r.empInsurance) }];
  const deductionLines = lines.filter((l) => l.type === 'DEDUCTION' && new Decimal(l.amount).gt(0));
  const deferred = new Decimal(r.deferredDeduction);
  const deductionRows = [
    ...insuranceRows,
    { label: 'Thuế thu nhập cá nhân', amount: fmt(r.pitAmount) },
    ...(deductionLines.length
      ? deductionLines.map((l) => ({ label: l.name, amount: fmt(l.amount) }))
      : new Decimal(r.otherDeductions).gt(0)
        ? [{ label: 'Khấu trừ khác', amount: fmt(r.otherDeductions) }]
        : []),
    ...(deferred.gt(0)
      ? [{ label: 'Trong đó hoãn sang kỳ sau (vượt 30% lương thực trả)', amount: `-${fmt(deferred)}`, note: 'không trừ kỳ này' }]
      : []),
  ];
  const totalDeduction = new Decimal(r.empInsurance).plus(r.pitAmount).plus(r.otherDeductions);

  // ---------- III. Thuế TNCN ----------
  const progressive = !s.taxMethod || s.taxMethod === 'PROGRESSIVE';
  const taxRows = progressive
    ? [
        { label: 'Thu nhập chịu thuế', amount: fmt(r.taxableIncome) },
        { label: 'Trừ bảo hiểm bắt buộc', amount: minus(r.empInsurance) },
        { label: 'Giảm trừ bản thân', amount: minus(r.selfDeduction) },
        { label: `Giảm trừ người phụ thuộc (${r.dependantCount} người)`, amount: minus(r.dependantDeduction) },
        { label: 'Thu nhập tính thuế', amount: fmt(r.assessableIncome), bold: true },
        { label: 'Thuế TNCN (biểu lũy tiến từng phần)', amount: fmt(r.pitAmount), bold: true },
      ]
    : [
        { label: 'Thu nhập chịu thuế', amount: fmt(r.taxableIncome) },
        { label: s.taxMethod === 'FLAT_20' ? 'Thuế TNCN (không cư trú, 20%)' : 'Thuế TNCN (khấu trừ 10%)', amount: fmt(r.pitAmount), bold: true },
      ];

  const sections: PayslipSection[] = [
    { title: 'I. THU NHẬP', rows: earningRows, total: { label: 'Tổng thu nhập (Gross)', amount: fmt(r.grossIncome) } },
    { title: 'II. CÁC KHOẢN KHẤU TRỪ', rows: deductionRows, total: { label: 'Tổng khấu trừ', amount: fmt(totalDeduction) } },
    { title: 'III. CÁCH TÍNH THUẾ TNCN', rows: taxRows },
  ];

  const info: Array<[string, string]> = [
    ['Họ và tên', input.employeeName],
    ['Mã nhân viên', input.employeeCode],
    ...(input.orgName ? ([['Phòng ban', input.orgName]] as Array<[string, string]>) : []),
    ...(input.jobName ? ([['Chức danh', input.jobName]] as Array<[string, string]>) : []),
    ['Kỳ lương', `${dmy(input.periodStart)} – ${dmy(input.periodEnd)}`],
    ...(s.standardDays
      ? ([['Ngày công', `${new Decimal(s.paidDays ?? s.standardDays).toString()} / ${s.standardDays} ngày`]] as Array<[string, string]>)
      : []),
    ...(s.overtimeHours ? ([['Làm thêm giờ', `${s.overtimeHours} giờ`]] as Array<[string, string]>) : []),
    ...(input.payDate ? ([['Ngày trả lương', dmy(input.payDate)]] as Array<[string, string]>) : []),
  ];

  const notes = [
    `Doanh nghiệp đóng bảo hiểm cho người lao động: ${Number(fmt(r.companyInsurance)).toLocaleString('vi-VN')} đ (không trừ vào lương).`,
    ...(s.insuranceExempt ? ['Tháng này không đóng bảo hiểm do không làm việc từ 14 ngày trở lên.'] : []),
  ];

  // Dòng tổng dạng cũ để các nơi dùng PayslipData.lines vẫn chạy.
  const summaryLines: PayslipData['lines'] = [
    { label: 'Tổng thu nhập (Gross)', amount: fmt(r.grossIncome), group: 'EARNING' },
    { label: 'Bảo hiểm (người lao động)', amount: fmt(r.empInsurance), group: 'DEDUCTION' },
    { label: 'Thuế TNCN', amount: fmt(r.pitAmount), group: 'DEDUCTION' },
    ...(new Decimal(r.otherDeductions).gt(0) ? [{ label: 'Khấu trừ khác', amount: fmt(r.otherDeductions), group: 'DEDUCTION' as const }] : []),
    { label: 'Bảo hiểm (doanh nghiệp đóng)', amount: fmt(r.companyInsurance), group: 'EMPLOYER' },
    { label: 'Thực lĩnh (Net)', amount: fmt(r.netPay), group: 'SUMMARY' },
  ];

  return {
    companyName: input.companyName,
    employeeName: input.employeeName,
    employeeCode: input.employeeCode,
    periodCode: input.periodCode,
    lines: summaryLines,
    info,
    sections,
    notes,
    netPay: fmt(r.netPay),
  };
}
