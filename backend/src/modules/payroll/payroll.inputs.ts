import Decimal from 'decimal.js';
import { mul, roundVND, sum } from '../../common/utils/money';
import { PayElementLine, TaxTreatment } from './pay-element';

/**
 * Dựng đầu vào tính lương của MỘT nhân viên trong MỘT kỳ từ:
 * lương cơ bản, khoản cố định, khoản phát sinh, tạm ứng và ngày công.
 *
 * Quy tắc (cần kế toán xác nhận trước khi dùng thật — xem README):
 *  1. Công chuẩn = số ngày thứ 2 – thứ 6 của cả kỳ.
 *  2. Công hưởng lương = công chuẩn trong thời gian còn làm việc
 *     − nghỉ không lương − vắng không phép (phương pháp "trừ công").
 *  3. Lương cơ bản và các khoản cố định có isProrated được chia theo
 *     công hưởng lương / công chuẩn. Đủ công thì giữ nguyên, không làm tròn.
 *  4. Lương đóng BH = lương đóng BH hợp đồng + các khoản cố định có
 *     isInsuranceBase (đủ tháng, không chia theo công).
 *  5. Không làm việc từ 14 ngày trở lên trong tháng → không đóng BH tháng đó
 *     (Luật BHXH 2014, Điều 85 khoản 3).
 *  6. Khoản phát sinh trong kỳ (thưởng, phạt...) giữ nguyên số tiền.
 *  7. Tạm ứng đến kỳ trừ là khoản khấu trừ khác (bị áp trần 30% trong calcPayroll).
 *  8. Làm thêm giờ: lương giờ = lương cơ bản / công chuẩn / 8. Mỗi đơn tách
 *     2 dòng: phần 100% chịu thuế, phần vượt 100% miễn thuế TNCN
 *     (TT 111/2013 Điều 3 khoản 1 điểm i). Không tính vào lương đóng BH.
 */

/** Số ngày không làm việc trong tháng từ mức này trở lên thì không đóng BH. */
export const NO_INSURANCE_DAYS = 14;

export interface ElementDef {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  taxTreatment: TaxTreatment;
  taxExemptLimit?: Decimal.Value | null;
  isInsuranceBase: boolean;
  isProrated: boolean;
}

export interface ElementAmount {
  element: ElementDef;
  amount: Decimal.Value;
}

export interface BuildInputArgs {
  baseSalary: Decimal.Value;
  /** Lương đóng BH theo hợp đồng (thường = lương cơ bản). */
  contractInsuranceSalary: Decimal.Value;
  recurring: ElementAmount[];
  oneOff: ElementAmount[];
  /** Số tiền từng kỳ tạm ứng đến hạn trừ. */
  advanceDeductions: Decimal.Value[];
  /** Công chuẩn của cả kỳ. */
  standardDays: number;
  /** Công hưởng lương (có thể lẻ 0,5). */
  paidDays: Decimal.Value;
  /** Đơn làm thêm giờ đã duyệt trong kỳ. */
  overtime?: Array<{ hours: Decimal.Value; multiplier: Decimal.Value }>;
  /** Khấu trừ kỳ trước chưa trừ hết do vượt trần 30% — trừ tiếp kỳ này. */
  carriedDeduction?: Decimal.Value;
}

export interface BuiltInput {
  lines: PayElementLine[];
  insuranceSalary: Decimal;
  insuranceExempt: boolean;
}

/** Công hưởng lương = công chuẩn trong thời gian làm việc − nghỉ không lương − vắng (không âm). */
export function calcPaidDays(
  employedStandardDays: number,
  unpaidLeave: number,
  absent: number,
): Decimal {
  return Decimal.max(new Decimal(employedStandardDays).minus(unpaidLeave).minus(absent), 0);
}

/** Chia số tiền theo công. Đủ công (hoặc công chuẩn = 0) thì giữ nguyên. */
export function prorate(
  amount: Decimal.Value,
  paidDays: Decimal.Value,
  standardDays: number,
): Decimal {
  const paid = new Decimal(paidDays);
  if (standardDays <= 0 || paid.gte(standardDays)) return new Decimal(amount);
  return roundVND(mul(amount, paid).div(standardDays));
}

export function isInsuranceExempt(standardDays: number, paidDays: Decimal.Value): boolean {
  return new Decimal(standardDays).minus(paidDays).gte(NO_INSURANCE_DAYS);
}

function overtimeLines(a: BuildInputArgs): PayElementLine[] {
  if (!a.overtime || a.overtime.length === 0) return [];
  const hourly = hourlyRate(a.baseSalary, a.standardDays);
  let taxable = new Decimal(0);
  let exempt = new Decimal(0);
  let hours = new Decimal(0);
  for (const ot of a.overtime) {
    const pay = overtimePay(hourly, ot.hours, ot.multiplier);
    taxable = taxable.plus(pay.taxable);
    exempt = exempt.plus(pay.exempt);
    hours = hours.plus(ot.hours);
  }
  return [
    { code: 'OT', name: `Làm thêm giờ (${hours.toString()} giờ)`, type: 'EARNING', amount: taxable, taxTreatment: 'TAXABLE' },
    { code: 'OT_PREMIUM', name: 'Phần làm thêm giờ vượt lương giờ bình thường (miễn thuế)', type: 'EARNING', amount: exempt, taxTreatment: 'EXEMPT' },
  ];
}

function toLine(e: ElementDef, amount: Decimal.Value): PayElementLine {
  return {
    code: e.code,
    name: e.name,
    type: e.type,
    amount,
    isInsuranceBase: e.isInsuranceBase,
    taxTreatment: e.taxTreatment,
    taxExemptLimit: e.taxExemptLimit ?? undefined,
  };
}

/** Lương giờ = lương cơ bản / công chuẩn / số giờ làm việc bình thường mỗi ngày. */
export function hourlyRate(baseSalary: Decimal.Value, standardDays: number, hoursPerDay = 8): Decimal {
  if (standardDays <= 0) return new Decimal(0);
  return new Decimal(baseSalary).div(standardDays).div(hoursPerDay);
}

/** Tiền làm thêm giờ, tách phần chịu thuế (100%) và phần miễn thuế (vượt 100%). */
export function overtimePay(hourly: Decimal.Value, hours: Decimal.Value, multiplier: Decimal.Value) {
  const normal = new Decimal(hourly).mul(hours);
  return {
    taxable: roundVND(normal),
    exempt: roundVND(normal.mul(new Decimal(multiplier).minus(1))),
  };
}

export function buildPayrollInput(a: BuildInputArgs): BuiltInput {
  const factor = (amount: Decimal.Value) => prorate(amount, a.paidDays, a.standardDays);

  const lines: PayElementLine[] = [
    {
      code: 'BASE',
      name: 'Lương theo ngày công',
      type: 'EARNING',
      amount: factor(a.baseSalary),
      taxTreatment: 'TAXABLE',
    },
    ...a.recurring.map((r) =>
      toLine(r.element, r.element.type === 'EARNING' && r.element.isProrated ? factor(r.amount) : r.amount),
    ),
    ...a.oneOff.map((o) => toLine(o.element, o.amount)),
    ...overtimeLines(a),
    ...a.advanceDeductions.map((amount, i) => ({
      code: 'ADVANCE',
      name: `Trừ tạm ứng${a.advanceDeductions.length > 1 ? ` (${i + 1})` : ''}`,
      type: 'DEDUCTION' as const,
      amount,
    })),
    ...(a.carriedDeduction && new Decimal(a.carriedDeduction).gt(0)
      ? [{ code: 'CARRIED', name: 'Khấu trừ kỳ trước chưa trừ hết (vượt 30%)', type: 'DEDUCTION' as const, amount: a.carriedDeduction }]
      : []),
  ];

  const insuranceExempt = isInsuranceExempt(a.standardDays, a.paidDays);
  const insuranceSalary = insuranceExempt
    ? new Decimal(0)
    : roundVND(
        sum([
          a.contractInsuranceSalary,
          ...a.recurring
            .filter((r) => r.element.type === 'EARNING' && r.element.isInsuranceBase)
            .map((r) => r.amount),
        ]),
      );

  return { lines, insuranceSalary, insuranceExempt };
}
