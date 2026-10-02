import Decimal from 'decimal.js';
import { roundVND } from '../../common/utils/money';
import { DEFAULT_LABOR_RULES, LaborRules } from '../settings/labor-rules';

/**
 * Chế độ BHXH ngắn hạn theo Luật BHXH 2024 (số 41/2024/QH15, hiệu lực 01/07/2025).
 * Phần tính thuần — test được. CẦN KẾ TOÁN / CÁN BỘ BHXH ĐỐI CHIẾU văn bản gốc trước khi dùng thật.
 *
 * Mức hưởng một ngày của chế độ tính theo ngày làm việc = mức theo tháng / 24.
 */

export type Regime = 'SICK' | 'CHILD_SICK' | 'BIRTH' | 'CHECKUP' | 'MISCARRIAGE' | 'PATERNITY' | 'RECOVERY';

export const REGIME_LABEL: Record<Regime, string> = {
  SICK: 'Ốm đau',
  CHILD_SICK: 'Chăm con ốm',
  BIRTH: 'Thai sản — sinh con',
  CHECKUP: 'Thai sản — khám thai',
  MISCARRIAGE: 'Thai sản — sảy thai, phá thai',
  PATERNITY: 'Thai sản — lao động nam khi vợ sinh',
  RECOVERY: 'Dưỡng sức, phục hồi sức khoẻ',
};

/** Chế độ đếm theo ngày làm việc (bỏ thứ 7, chủ nhật, ngày lễ). Còn lại tính theo ngày lịch. */
export const WORKING_DAY_REGIMES: Regime[] = ['SICK', 'CHILD_SICK', 'CHECKUP', 'PATERNITY'];
/** Chế độ ốm đau (75%) hay thai sản (100%) — cũng là loại nghỉ ghi vào bảng công. */
export const SICKNESS_REGIMES: Regime[] = ['SICK', 'CHILD_SICK', 'RECOVERY'];

type R = LaborRules;

/**
 * Số ngày tối đa hưởng ốm đau trong năm (Điều 43): đóng dưới 15 năm 30 ngày, 15 đến dưới 30 năm 40 ngày,
 * từ 30 năm 60 ngày; nghề nặng nhọc, độc hại, nguy hiểm cộng thêm 10 ngày. Số ngày lấy từ Cấu hình hệ thống.
 */
export function sickDaysPerYear(insuredYears: number, hazardous: boolean, r: R = DEFAULT_LABOR_RULES): number {
  const base = insuredYears >= 30 ? r.sickDays30Plus : insuredYears >= 15 ? r.sickDays15To30 : r.sickDaysUnder15;
  return base + (hazardous ? r.hazardousExtraDays : 0);
}

/** Chăm con ốm (Điều 44): con dưới 3 tuổi 20 ngày/năm, từ 3 đến dưới 7 tuổi 15 ngày/năm. Từ 7 tuổi: không hưởng. */
export function childSickDaysPerYear(childBirth: Date, onDate: Date, r: R = DEFAULT_LABOR_RULES): number {
  const age = (onDate.getTime() - childBirth.getTime()) / (365.25 * 86_400_000);
  if (age < 0) return 0;
  return age < 3 ? r.childSickUnder3 : age < 7 ? r.childSick3To7 : 0;
}

/** Sảy thai, phá thai (Điều 52): dưới 5 tuần 10 ngày, 5–dưới 13 tuần 20, 13–dưới 22 tuần 40, từ 22 tuần 50 ngày (ngày lịch). */
export function miscarriageDays(weeks: number, r: R = DEFAULT_LABOR_RULES): number {
  if (weeks < 5) return r.miscarriageUnder5Weeks;
  if (weeks < 13) return r.miscarriage5To13Weeks;
  if (weeks < 22) return r.miscarriage13To22Weeks;
  return r.miscarriage22PlusWeeks;
}

/**
 * Lao động nam khi vợ sinh (Điều 53): 5 ngày làm việc; 7 ngày nếu sinh phẫu thuật hoặc dưới 32 tuần;
 * sinh đôi 10 ngày, từ sinh ba thêm 3 ngày mỗi con; sinh đôi trở lên mà phải phẫu thuật 14 ngày.
 */
export function paternityMaxDays(childCount: number, surgery: boolean, r: R = DEFAULT_LABOR_RULES): number {
  if (childCount >= 2) return surgery ? r.paternityTwinsSurgeryDays : r.paternityTwinsDays + r.paternityExtraPerChild * (childCount - 2);
  return surgery ? r.paternitySurgeryDays : r.paternityDays;
}

/** Sinh con (Điều 53): nghỉ 6 tháng; sinh đôi trở lên thêm 1 tháng cho mỗi con từ con thứ hai. */
export function birthMonths(childCount: number, r: R = DEFAULT_LABOR_RULES): number {
  return r.birthMonths + r.extraMonthsPerChild * Math.max(0, childCount - 1);
}

export interface ClaimInput {
  regime: Regime;
  /** Số ngày hưởng (đã đếm theo cách của chế độ). Sinh con: bỏ qua, dùng months. */
  days: number;
  /** Lương đóng BHXH tháng liền kề trước khi nghỉ (ốm đau). */
  lastMonthSalary: Decimal.Value;
  /** Bình quân lương đóng BHXH 6 tháng trước khi nghỉ (thai sản). */
  avg6Salary: Decimal.Value;
  /** Lương cơ sở tại thời điểm hưởng (dưỡng sức, trợ cấp một lần). */
  baseSalary: Decimal.Value;
  childCount?: number;
  /** Quy tắc (Cấu hình hệ thống → Quy tắc luật lao động & BHXH). */
  rules?: R;
}

export interface ClaimResult {
  baseAmount: Decimal;
  perDay: Decimal;
  amount: Decimal;
  lumpSum: Decimal;
  months: number | null;
  formula: string;
}

const fmt = (d: Decimal.Value) => Number(new Decimal(d).toFixed(0)).toLocaleString('vi-VN');

export function calcClaim(c: ClaimInput): ClaimResult {
  const zero = new Decimal(0);
  const r = c.rules ?? DEFAULT_LABOR_RULES;
  const wd = r.workingDayDivisor;
  const cd = r.calendarDayDivisor;
  const mat = new Decimal(r.maternityRatePercent).div(100);
  switch (c.regime) {
    case 'SICK':
    case 'CHILD_SICK': {
      // 75% tiền lương đóng BHXH tháng liền kề / 24 × số ngày (Điều 45)
      const base = new Decimal(c.lastMonthSalary);
      const perDay = base.mul(r.sickRatePercent).div(100).div(wd);
      return { baseAmount: base, perDay, amount: roundVND(perDay.mul(c.days)), lumpSum: zero, months: null, formula: `${r.sickRatePercent}% × ${fmt(base)} ÷ ${wd} × ${c.days} ngày` };
    }
    case 'CHECKUP':
    case 'PATERNITY': {
      // 100% bình quân 6 tháng / 24 × số ngày làm việc (Điều 59)
      const base = new Decimal(c.avg6Salary);
      const perDay = base.mul(mat).div(wd);
      return { baseAmount: base, perDay, amount: roundVND(perDay.mul(c.days)), lumpSum: zero, months: null, formula: `${r.maternityRatePercent}% × ${fmt(base)} ÷ ${wd} × ${c.days} ngày` };
    }
    case 'MISCARRIAGE': {
      // Tính theo ngày lịch: bình quân 6 tháng / 30 × số ngày
      const base = new Decimal(c.avg6Salary);
      const perDay = base.mul(mat).div(cd);
      return { baseAmount: base, perDay, amount: roundVND(perDay.mul(c.days)), lumpSum: zero, months: null, formula: `${r.maternityRatePercent}% × ${fmt(base)} ÷ ${cd} × ${c.days} ngày` };
    }
    case 'BIRTH': {
      const children = Math.max(1, c.childCount ?? 1);
      const months = birthMonths(children, r);
      const base = new Decimal(c.avg6Salary);
      // Trợ cấp một lần: 2 lần lương cơ sở cho mỗi con (Điều 58)
      const lump = roundVND(new Decimal(c.baseSalary).mul(r.lumpSumBaseSalaryTimes).mul(children));
      return {
        baseAmount: base,
        perDay: base.mul(mat).div(cd),
        amount: roundVND(base.mul(mat).mul(months)),
        lumpSum: lump,
        months,
        formula: `${r.maternityRatePercent}% × ${fmt(base)} × ${months} tháng · trợ cấp một lần ${r.lumpSumBaseSalaryTimes} × ${fmt(c.baseSalary)} × ${children} con`,
      };
    }
    case 'RECOVERY': {
      // 30% lương cơ sở / ngày (Điều 47, 61)
      const base = new Decimal(c.baseSalary);
      const perDay = base.mul(r.recoveryRatePercent).div(100);
      return { baseAmount: base, perDay, amount: roundVND(perDay.mul(c.days)), lumpSum: zero, months: null, formula: `${r.recoveryRatePercent}% × ${fmt(base)} × ${c.days} ngày` };
    }
  }
}

/** Tối đa ngày dưỡng sức một lần (Điều 47, 61) — dùng 10 ngày làm trần chung, cán bộ BHXH xét cụ thể. */
export const RECOVERY_MAX_DAYS = 10;
