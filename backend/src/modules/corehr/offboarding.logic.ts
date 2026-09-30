/**
 * Nghỉ việc — quy tắc thuần, test được.
 *  - Điều 46 BLLĐ 2019: trợ cấp thôi việc cho người làm việc thường xuyên từ đủ 12 tháng,
 *    trừ trường hợp đủ điều kiện hưởng lương hưu hoặc bị sa thải (kỷ luật).
 *  - Điều 47: trợ cấp mất việc làm (thay đổi cơ cấu, công nghệ, lý do kinh tế) — cũng từ đủ 12 tháng.
 *  - Thời gian tính trợ cấp = tổng thời gian làm việc − thời gian đã đóng BHTN.
 */

export type TerminationType = 'RESIGN' | 'CONTRACT_END' | 'MUTUAL' | 'REDUNDANCY' | 'DISMISS' | 'RETIRE';

export const TERMINATION_LABELS: Record<TerminationType, string> = {
  RESIGN: 'Người lao động xin nghỉ',
  CONTRACT_END: 'Hết hạn hợp đồng',
  MUTUAL: 'Hai bên thoả thuận',
  REDUNDANCY: 'Mất việc (thay đổi cơ cấu, công nghệ, kinh tế)',
  DISMISS: 'Sa thải (kỷ luật)',
  RETIRE: 'Nghỉ hưu',
};

/** Số tháng tròn từ from đến to (tính cả ngày cuối): 01/01 → 31/12 = 12 tháng. */
export function fullMonthsBetween(from: Date, to: Date): number {
  const end = new Date(to.getTime() + 86_400_000); // ngày làm việc cuối tính trọn
  let months = (end.getUTCFullYear() - from.getUTCFullYear()) * 12 + (end.getUTCMonth() - from.getUTCMonth());
  if (end.getUTCDate() < from.getUTCDate()) months--;
  return Math.max(months, 0);
}

export interface SeveranceEligibility {
  eligible: boolean;
  isRedundancy: boolean;
  reason: string | null;
}

export function severanceEligibility(type: TerminationType, totalWorkedMonths: number): SeveranceEligibility {
  if (type === 'DISMISS') return { eligible: false, isRedundancy: false, reason: 'Bị sa thải không được hưởng trợ cấp thôi việc' };
  if (type === 'RETIRE') return { eligible: false, isRedundancy: false, reason: 'Đủ điều kiện hưởng lương hưu không được hưởng trợ cấp thôi việc' };
  if (totalWorkedMonths < 12) return { eligible: false, isRedundancy: false, reason: 'Làm việc chưa đủ 12 tháng' };
  return { eligible: true, isRedundancy: type === 'REDUNDANCY', reason: null };
}

/**
 * Số tháng đã đóng BHTN (ước tính, người dùng sửa được):
 * toàn bộ thời gian làm việc trừ thời gian thử việc và các tháng lương không đóng BH.
 */
export function estimateInsuredMonths(totalWorkedMonths: number, probationMonths: number, uninsuredPayrollMonths: number): number {
  return Math.max(0, totalWorkedMonths - probationMonths - uninsuredPayrollMonths);
}
