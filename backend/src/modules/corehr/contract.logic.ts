import { DEFAULT_LABOR_RULES, LaborRules } from '../settings/labor-rules';
/**
 * Kiểm tra hợp đồng lao động theo Bộ luật Lao động 2019.
 * Hàm thuần — không truy cập database — để test được.
 */

export type ContractType = 'PROBATION' | 'FIXED_TERM' | 'INDEFINITE' | 'SERVICE';

export interface ContractLike {
  id?: string;
  contractType: ContractType;
  parentId?: string | null;
  startDate: Date;
  endDate?: Date | null;
  terminatedDate?: Date | null;
}

/** HĐ xác định thời hạn tối đa 36 tháng (Điều 20 khoản 1 điểm b). */
export const MAX_FIXED_TERM_MONTHS = 36;
/** Thử việc tối đa 180 ngày (Điều 25) — với người quản lý doanh nghiệp. */
export const MAX_PROBATION_DAYS = 180;

/** Ngày cuối của khoảng "n tháng kể từ start" (vd 01/01 + 36 tháng → 31/12 năm thứ 3). */
export function addMonthsEnd(start: Date, months: number): Date {
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
  // Tháng đích không có ngày đó (vd 31/01 + 1 tháng → "31/02"): kết thúc vào ngày cuối tháng đích.
  if (d.getUTCDate() !== start.getUTCDate()) {
    d.setUTCDate(0);
    return d;
  }
  // Bình thường: ngày liền trước ngày cùng số của tháng đích.
  return new Date(d.getTime() - 24 * 60 * 60 * 1000);
}

export function daysInclusive(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/** Ngày kết thúc thực tế: chấm dứt sớm thì lấy ngày chấm dứt. */
export function effectiveEnd(c: ContractLike): Date | null {
  if (c.terminatedDate && (!c.endDate || c.terminatedDate < c.endDate)) return c.terminatedDate;
  return c.endDate ?? null;
}

function overlaps(a: ContractLike, b: ContractLike): boolean {
  const aEnd = effectiveEnd(a) ?? new Date('9999-12-31');
  const bEnd = effectiveEnd(b) ?? new Date('9999-12-31');
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/**
 * Trả về thông báo lỗi nếu hợp đồng mới không hợp lệ, hoặc null nếu hợp lệ.
 * existing: các hợp đồng (không gồm phụ lục) còn hiệu lực của cùng nhân viên.
 * maxProbationDays: giới hạn thử việc theo chức danh (nếu có).
 */
export function validateContract(
  c: ContractLike,
  existing: ContractLike[],
  maxProbationDays?: number | null,
  rules: Pick<LaborRules, 'maxFixedTermMonths' | 'maxFixedTermContracts' | 'maxProbationDays'> = DEFAULT_LABOR_RULES,
): string | null {
  if (c.endDate && c.endDate < c.startDate) {
    return 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu';
  }

  switch (c.contractType) {
    case 'INDEFINITE':
      if (c.endDate) return 'Hợp đồng không xác định thời hạn không có ngày kết thúc';
      break;
    case 'FIXED_TERM': {
      if (!c.endDate) return 'Hợp đồng xác định thời hạn phải có ngày kết thúc';
      if (c.endDate > addMonthsEnd(c.startDate, rules.maxFixedTermMonths)) {
        return `Hợp đồng xác định thời hạn không quá ${rules.maxFixedTermMonths} tháng`;
      }
      // Điều 20 khoản 2: chỉ được ký thêm 1 lần HĐ xác định thời hạn.
      const fixedCount = existing.filter((e) => e.contractType === 'FIXED_TERM' && e.id !== c.id).length;
      if (fixedCount >= rules.maxFixedTermContracts) {
        return `Đã ký ${rules.maxFixedTermContracts} hợp đồng xác định thời hạn, lần tiếp theo phải là hợp đồng không xác định thời hạn`;
      }
      break;
    }
    case 'PROBATION': {
      if (!c.endDate) return 'Hợp đồng thử việc phải có ngày kết thúc';
      const limit = Math.min(maxProbationDays ?? rules.maxProbationDays, rules.maxProbationDays);
      if (daysInclusive(c.startDate, c.endDate) > limit) {
        return `Thời gian thử việc không quá ${limit} ngày`;
      }
      break;
    }
    case 'SERVICE':
      break;
  }

  const clash = existing.find((e) => e.id !== c.id && overlaps(c, e));
  if (clash) return 'Trùng thời gian với một hợp đồng khác của nhân viên';
  return null;
}

export type ExpiryWarning = 'EXPIRED' | 'EXPIRING';

/**
 * Cảnh báo hết hạn: hợp đồng có ngày kết thúc, chưa chấm dứt, chưa được
 * nối bằng hợp đồng khác bắt đầu sau nó.
 */
export function expiryWarning(
  c: ContractLike,
  sameEmployment: ContractLike[],
  today: Date,
  withinDays: number,
): ExpiryWarning | null {
  if (!c.endDate || c.terminatedDate) return null;
  const renewed = sameEmployment.some((o) => o.id !== c.id && o.startDate > c.endDate!);
  if (renewed) return null;
  if (c.endDate < today) return 'EXPIRED';
  if (daysInclusive(today, c.endDate) - 1 <= withinDays) return 'EXPIRING';
  return null;
}
