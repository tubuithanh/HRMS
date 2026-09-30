import Decimal from 'decimal.js';
import { MIN_WAGE_REGION } from './payroll.params';

/**
 * Kiểm tra sau khi tính lương. Trả về danh sách cảnh báo/lỗi để hiển thị
 * cho người làm lương trước khi khóa kỳ.
 */
export type CheckSeverity = 'WARNING' | 'ERROR';

export interface PayrollCheck {
  code: string;
  severity: CheckSeverity;
  message: string;
}

/**
 * Lương thực trả (quy về tháng) không được thấp hơn lương tối thiểu vùng.
 * So sánh trên GROSS của người làm đủ công (đơn giản hoá: so gross tháng).
 */
export function checkMinWage(
  grossMonthly: Decimal.Value,
  region: number,
): PayrollCheck | null {
  const min = MIN_WAGE_REGION[region];
  if (!min) {
    return {
      code: 'INVALID_REGION',
      severity: 'ERROR',
      message: `Vùng lương tối thiểu không hợp lệ: ${region}`,
    };
  }
  if (new Decimal(grossMonthly).lessThan(min)) {
    return {
      code: 'BELOW_MIN_WAGE',
      severity: 'ERROR',
      message: `Lương ${new Decimal(grossMonthly).toFixed()} thấp hơn lương tối thiểu vùng ${min.toFixed()}`,
    };
  }
  return null;
}

/**
 * Cảnh báo khi thực lĩnh chênh lệch quá ngưỡng so với kỳ trước.
 * thresholdRatio mặc định 0.2 (20%).
 */
export function checkVariance(
  currentNet: Decimal.Value,
  previousNet: Decimal.Value,
  thresholdRatio = 0.2,
): PayrollCheck | null {
  const prev = new Decimal(previousNet);
  if (prev.isZero()) return null;

  const diffRatio = new Decimal(currentNet).minus(prev).dividedBy(prev).abs();
  if (diffRatio.greaterThan(thresholdRatio)) {
    return {
      code: 'LARGE_VARIANCE',
      severity: 'WARNING',
      message: `Thực lĩnh thay đổi ${diffRatio.times(100).toFixed(1)}% so với kỳ trước`,
    };
  }
  return null;
}
