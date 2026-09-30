import Decimal from 'decimal.js';
import { calcPayroll } from './payroll.calc';
import { LegalParams } from './payroll.params';

/**
 * Quy đổi lương NET sang GROSS.
 *
 * Bài toán: cho trước thực lĩnh mong muốn (net), tìm lương gross sao cho
 *   gross - bảo hiểm nhân viên - thuế TNCN = net.
 *
 * Không có công thức đóng đơn giản vì thuế lũy tiến và bảo hiểm có mức trần
 * đều phụ thuộc gross. Ta dùng phương pháp lặp (chia đôi - bisection):
 * dò gross trong khoảng [net, net*3] cho tới khi net tính ra khớp mục tiêu
 * trong sai số 1 đồng.
 *
 * Lưu ý: lương đóng bảo hiểm thường lấy bằng chính gross trừ khi có thoả
 * thuận riêng; ở đây mặc định insuranceSalary = gross.
 */
export interface NetToGrossInput {
  targetNet: Decimal.Value;
  region: number;
  dependantCount: number;
  /** Nếu lương đóng BH cố định (không theo gross), truyền vào đây. */
  fixedInsuranceSalary?: Decimal.Value;
  legal?: LegalParams;
}

export interface NetToGrossResult {
  gross: Decimal;
  achievedNet: Decimal;
  iterations: number;
}

export function netToGross(input: NetToGrossInput): NetToGrossResult {
  const target = new Decimal(input.targetNet);
  if (target.lessThanOrEqualTo(0)) {
    return { gross: new Decimal(0), achievedNet: new Decimal(0), iterations: 0 };
  }

  const netForGross = (gross: Decimal): Decimal => {
    const r = calcPayroll({
      taxableEarnings: [gross],
      insuranceSalary: input.fixedInsuranceSalary ?? gross,
      region: input.region,
      dependantCount: input.dependantCount,
      taxMethod: 'PROGRESSIVE',
      legal: input.legal,
    });
    return r.netPay;
  };

  // Khoảng dò: gross luôn >= net; cận trên rộng rãi để chắc chắn bao phủ.
  let low = target;
  let high = target.times(3);

  // Bảo đảm cận trên đủ lớn (trường hợp thuế suất cao).
  let guard = 0;
  while (netForGross(high).lessThan(target) && guard < 50) {
    high = high.times(1.5);
    guard++;
  }

  let mid = low;
  let iterations = 0;
  const maxIter = 100;
  const tolerance = new Decimal(1); // sai số 1 đồng

  while (iterations < maxIter) {
    mid = low.plus(high).dividedBy(2).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const net = netForGross(mid);
    const diff = net.minus(target);

    if (diff.abs().lessThanOrEqualTo(tolerance)) break;

    if (diff.lessThan(0)) {
      // net thấp hơn mục tiêu -> cần gross cao hơn
      low = mid;
    } else {
      high = mid;
    }
    iterations++;
  }

  return { gross: mid, achievedNet: netForGross(mid), iterations };
}
