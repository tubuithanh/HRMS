import Decimal from 'decimal.js';

/**
 * Quản lý con người — phần tính toán thuần (test được, không đụng database).
 */

// ===================== Khen thưởng – kỷ luật =====================

export const REWARD_FORMS = { CASH: 'Thưởng tiền', CERTIFICATE: 'Giấy khen / bằng khen', OTHER: 'Hình thức khác' } as const;
/** Điều 124 BLLĐ 2019. */
export const DISCIPLINE_FORMS = {
  REPRIMAND: 'Khiển trách',
  EXTEND_RAISE: 'Kéo dài thời hạn nâng lương (≤ 6 tháng)',
  DEMOTE: 'Cách chức',
  DISMISS: 'Sa thải',
} as const;

const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));

/**
 * Ngày đương nhiên được xoá kỷ luật nếu không tái phạm (Điều 126 BLLĐ 2019):
 * khiển trách 3 tháng, kéo dài nâng lương 6 tháng, cách chức 3 năm, tính từ ngày xử lý. Sa thải: không có.
 */
export function disciplineExpiry(form: string, effectiveDate: Date): Date | null {
  switch (form) {
    case 'REPRIMAND':
      return addMonths(effectiveDate, 3);
    case 'EXTEND_RAISE':
      return addMonths(effectiveDate, 6);
    case 'DEMOTE':
      return addMonths(effectiveDate, 36);
    default:
      return null;
  }
}

// ===================== Đào tạo: bồi hoàn chi phí =====================

/**
 * Chi phí phải bồi hoàn khi nghỉ việc trước khi hết thời gian cam kết (Điều 62 BLLĐ 2019 cho phép
 * thoả thuận). Cách tính phổ biến: theo tỷ lệ thời gian cam kết còn lại, làm tròn đồng.
 */
export function trainingRefund(costPerPerson: Decimal.Value, commitmentMonths: number, courseEnd: Date, leaveDate: Date): Decimal {
  const cost = new Decimal(costPerPerson);
  if (commitmentMonths <= 0 || cost.lte(0)) return new Decimal(0);
  const commitEnd = addMonths(courseEnd, commitmentMonths);
  if (leaveDate >= commitEnd) return new Decimal(0);
  const total = commitEnd.getTime() - courseEnd.getTime();
  const remaining = commitEnd.getTime() - Math.max(leaveDate.getTime(), courseEnd.getTime());
  return cost.mul(remaining).div(total).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

export function commitmentEnd(courseEnd: Date, commitmentMonths: number): Date | null {
  return commitmentMonths > 0 ? addMonths(courseEnd, commitmentMonths) : null;
}

// ===================== Đánh giá hiệu suất =====================

export interface Goal {
  title: string;
  weight: number;
  selfScore?: number | null;
  managerScore?: number | null;
  comment?: string | null;
}

/** Điểm bình quân gia quyền theo trọng số (thang 1–5), làm tròn 2 chữ số. null nếu còn mục chưa chấm. */
export function weightedScore(goals: Goal[], key: 'selfScore' | 'managerScore'): number | null {
  if (goals.length === 0) return null;
  const totalW = goals.reduce((s, g) => s + g.weight, 0);
  if (totalW <= 0) return null;
  let acc = 0;
  for (const g of goals) {
    const v = g[key];
    if (v === null || v === undefined) return null;
    acc += v * g.weight;
  }
  return Math.round((acc / totalW) * 100) / 100;
}

/** Xếp loại theo điểm: A ≥ 4,5 · B ≥ 3,5 · C ≥ 2,5 · D dưới 2,5. */
export function ratingOf(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 4.5) return 'A';
  if (score >= 3.5) return 'B';
  if (score >= 2.5) return 'C';
  return 'D';
}

export const RATING_LABEL = { A: 'Xuất sắc', B: 'Tốt', C: 'Đạt', D: 'Chưa đạt' } as const;

/** Kiểm tra mẫu mục tiêu: 1–15 mục, trọng số dương, tổng 100. */
export function validateGoalTemplate(goals: Array<{ title: string; weight: number }>): string | null {
  if (goals.length === 0 || goals.length > 15) return 'Cần từ 1 đến 15 mục tiêu';
  if (goals.some((g) => !g.title.trim() || !(g.weight > 0))) return 'Mỗi mục tiêu cần tên và trọng số > 0';
  const total = goals.reduce((s, g) => s + g.weight, 0);
  if (Math.abs(total - 100) > 0.001) return `Tổng trọng số phải bằng 100 (hiện ${total})`;
  return null;
}
