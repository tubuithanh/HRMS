import { describe, it, expect } from 'vitest';
import { netToGross } from './net-to-gross';
import { calcPayroll } from './payroll.calc';

describe('netToGross', () => {
  it('gross tìm được cho ra đúng net mục tiêu (sai số <= 1 đồng)', () => {
    const target = 26_592_500; // net của gross 30tr, vùng I, 1 phụ thuộc
    const r = netToGross({ targetNet: target, region: 1, dependantCount: 1 });

    // Kiểm tra net đạt được khớp mục tiêu
    expect(Math.abs(Number(r.achievedNet.minus(target)))).toBeLessThanOrEqual(1);

    // Và gross tìm được, khi tính xuôi, cho ra net khớp
    const forward = calcPayroll({
      taxableEarnings: [r.gross],
      insuranceSalary: r.gross,
      region: 1,
      dependantCount: 1,
      taxMethod: 'PROGRESSIVE',
    });
    expect(Math.abs(Number(forward.netPay.minus(target)))).toBeLessThanOrEqual(1);
  });

  it('gross luôn lớn hơn hoặc bằng net', () => {
    const r = netToGross({ targetNet: 15_000_000, region: 1, dependantCount: 0 });
    expect(r.gross.greaterThanOrEqualTo(15_000_000)).toBe(true);
  });

  it('net = 0 -> gross = 0', () => {
    const r = netToGross({ targetNet: 0, region: 1, dependantCount: 0 });
    expect(r.gross.toString()).toBe('0');
  });
});
