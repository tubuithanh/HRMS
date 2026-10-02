import Decimal from 'decimal.js';
import { add, sub } from '../../common/utils/money';
import { calcProgressivePIT } from '../payroll/pit.calc';
import { TaxBracketDef } from '../payroll/payroll.params';

/**
 * Báo cáo BHXH / thuế TNCN / chuyển lương — phần tính toán thuần để test được.
 * Mọi số tiền dùng Decimal (nguyên tắc 1 của dự án).
 */

// ===================== BHXH: tăng / giảm / điều chỉnh (mẫu D02-LT) =====================

export interface InsuredRow {
  employmentId: string;
  /** Tiền lương tháng đóng BH (0 = không đóng tháng này). */
  base: Decimal;
}

export interface InsuranceEmpMeta {
  dateHire: Date;
  dateTerminate: Date | null;
}

export type ChangeKind = 'INCREASE' | 'DECREASE' | 'ADJUST_UP' | 'ADJUST_DOWN';

export interface InsuranceChange {
  employmentId: string;
  kind: ChangeKind;
  oldBase: Decimal;
  newBase: Decimal;
  reason: string;
}

/**
 * So sánh tiền lương đóng BH của tháng này với tháng trước:
 * - Tăng: tháng trước không đóng, tháng này đóng (lao động mới / đi làm lại).
 * - Giảm: tháng trước đóng, tháng này không (nghỉ việc / nghỉ không lương ≥ 14 ngày).
 * - Điều chỉnh: cả hai tháng đều đóng nhưng mức khác nhau.
 */
export function insuranceChanges(
  prev: InsuredRow[],
  curr: InsuredRow[],
  meta: Map<string, InsuranceEmpMeta>,
  monthStart: Date,
  monthEnd: Date,
): InsuranceChange[] {
  const before = new Map(prev.map((r) => [r.employmentId, r.base]));
  const after = new Map(curr.map((r) => [r.employmentId, r.base]));
  const ids = new Set([...before.keys(), ...after.keys()]);
  const inMonth = (d: Date | null | undefined) => !!d && d >= monthStart && d <= monthEnd;
  const out: InsuranceChange[] = [];

  for (const id of ids) {
    const oldBase = before.get(id) ?? new Decimal(0);
    const newBase = after.get(id) ?? new Decimal(0);
    const m = meta.get(id);
    if (oldBase.isZero() && newBase.gt(0)) {
      out.push({ employmentId: id, kind: 'INCREASE', oldBase, newBase, reason: inMonth(m?.dateHire) ? 'Lao động mới' : 'Đi làm lại / đủ điều kiện đóng' });
    } else if (oldBase.gt(0) && newBase.isZero()) {
      const quit = m?.dateTerminate && m.dateTerminate <= monthEnd;
      out.push({ employmentId: id, kind: 'DECREASE', oldBase, newBase, reason: quit ? 'Nghỉ việc' : 'Nghỉ không lương / không làm việc từ 14 ngày' });
    } else if (oldBase.gt(0) && newBase.gt(0) && !oldBase.eq(newBase)) {
      out.push({
        employmentId: id,
        kind: newBase.gt(oldBase) ? 'ADJUST_UP' : 'ADJUST_DOWN',
        oldBase,
        newBase,
        reason: newBase.gt(oldBase) ? 'Điều chỉnh tăng tiền lương' : 'Điều chỉnh giảm tiền lương',
      });
    }
  }
  const order: ChangeKind[] = ['INCREASE', 'ADJUST_UP', 'DECREASE', 'ADJUST_DOWN'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

// ===================== Thuế TNCN: tờ khai 05/KK-TNCN =====================

export interface PitRow {
  personId: string;
  resident: boolean;
  taxableIncome: Decimal;
  pitAmount: Decimal;
}

/** Các chỉ tiêu [21] – [35] của tờ khai 05/KK-TNCN (Thông tư 80/2021). */
export function pit05KK(rows: PitRow[]) {
  const people = new Map<string, { resident: boolean; income: Decimal; tax: Decimal }>();
  for (const r of rows) {
    const p = people.get(r.personId) ?? { resident: r.resident, income: new Decimal(0), tax: new Decimal(0) };
    p.income = add(p.income, r.taxableIncome);
    p.tax = add(p.tax, r.pitAmount);
    p.resident = r.resident;
    people.set(r.personId, p);
  }
  const all = [...people.values()];
  const sum = (xs: typeof all, f: (x: (typeof all)[number]) => Decimal) => xs.reduce((s, x) => add(s, f(x)), new Decimal(0));
  const res = all.filter((p) => p.resident);
  const non = all.filter((p) => !p.resident);
  const withheld = all.filter((p) => p.tax.gt(0));
  const resW = withheld.filter((p) => p.resident);
  const nonW = withheld.filter((p) => !p.resident);
  return {
    c21: all.length,
    c22: res.length,
    c23: withheld.length,
    c24: resW.length,
    c25: nonW.length,
    c26: sum(all, (p) => p.income),
    c27: sum(res, (p) => p.income),
    c28: sum(non, (p) => p.income),
    c29: new Decimal(0),
    c30: sum(withheld, (p) => p.income),
    c31: sum(resW, (p) => p.income),
    c32: sum(nonW, (p) => p.income),
    c33: sum(withheld, (p) => p.tax),
    c34: sum(resW, (p) => p.tax),
    c35: sum(nonW, (p) => p.tax),
  };
}

/** "2026-09" hoặc "2026-Q3" → khoảng ngày và nhãn kỳ kê khai. */
export function taxPeriodRange(period: string): { start: Date; end: Date; label: string } {
  const q = /^(\d{4})-Q([1-4])$/.exec(period);
  if (q) {
    const y = Number(q[1]);
    const n = Number(q[2]);
    return { start: new Date(Date.UTC(y, (n - 1) * 3, 1)), end: new Date(Date.UTC(y, n * 3, 0)), label: `Quý ${n}/${y}` };
  }
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 0)), label: `Tháng ${String(mo).padStart(2, '0')}/${y}` };
  }
  throw new Error('Kỳ kê khai dạng YYYY-MM hoặc YYYY-Qn');
}

// ===================== Thuế TNCN: quyết toán năm (05/QTT, phụ lục 05-1/BK) =====================

export interface AnnualMonthRow {
  taxableIncome: Decimal;
  empInsurance: Decimal;
  dependantDeduction: Decimal;
  pitAmount: Decimal;
}

export interface AnnualSettlement {
  taxableIncome: Decimal;
  insurance: Decimal;
  selfDeduction: Decimal;
  dependantDeduction: Decimal;
  assessableIncome: Decimal;
  taxDue: Decimal;
  taxWithheld: Decimal;
  /** > 0: còn phải nộp; < 0: nộp thừa. */
  difference: Decimal;
}

/**
 * Quyết toán thay cho cá nhân cư trú (biểu lũy tiến):
 * - Giảm trừ bản thân tính đủ 12 tháng (cá nhân ủy quyền quyết toán).
 * - Giảm trừ người phụ thuộc, bảo hiểm: cộng các tháng thực tế.
 * - Biểu thuế năm = biểu tháng với các mốc × 12.
 */
export function annualSettlement(
  months: AnnualMonthRow[],
  personalDeductionPerMonth: Decimal,
  brackets: TaxBracketDef[],
): AnnualSettlement {
  const total = (f: (r: AnnualMonthRow) => Decimal) => months.reduce((s, r) => add(s, f(r)), new Decimal(0));
  const taxableIncome = total((r) => r.taxableIncome);
  const insurance = total((r) => r.empInsurance);
  const dependantDeduction = total((r) => r.dependantDeduction);
  const selfDeduction = personalDeductionPerMonth.mul(12);
  const assessableIncome = Decimal.max(0, sub(sub(sub(taxableIncome, insurance), selfDeduction), dependantDeduction));
  const yearly = brackets.map((b) => ({ ...b, from: b.from.mul(12), to: b.to ? b.to.mul(12) : null, quickDeduction: b.quickDeduction.mul(12) }));
  const taxDue = calcProgressivePIT(assessableIncome, yearly);
  const taxWithheld = total((r) => r.pitAmount);
  return { taxableIncome, insurance, selfDeduction, dependantDeduction, assessableIncome, taxDue, taxWithheld, difference: sub(taxDue, taxWithheld) };
}

// ===================== Chuyển lương ngân hàng =====================

/** Tên người hưởng theo yêu cầu ngân hàng: in hoa, không dấu, chỉ chữ / số / khoảng trắng. */
export function bankName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
