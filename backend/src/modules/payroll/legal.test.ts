import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { latestEffective, quickDeductions } from './legal.service';
import { calcPayroll } from './payroll.calc';
import { DEFAULT_LEGAL_PARAMS, LegalParams } from './payroll.params';

const d = (s: string) => new Date(s);

describe('latestEffective', () => {
  const rows = [
    { v: 2_340_000, effectiveDate: d('2026-01-01') },
    { v: 2_530_000, effectiveDate: d('2026-07-01') },
  ];
  it('lấy mức có hiệu lực gần nhất không sau ngày xét', () => {
    expect(latestEffective(rows, d('2026-06-30'))?.v).toBe(2_340_000);
    expect(latestEffective(rows, d('2026-07-01'))?.v).toBe(2_530_000);
    expect(latestEffective(rows, d('2025-12-31'))).toBeUndefined();
  });
});

describe('quickDeductions', () => {
  it('khớp số trừ của biểu thuế 5 bậc 2026', () => {
    const q = quickDeductions([
      { from: 0, to: 10_000_000, rate: 0.05 },
      { from: 10_000_000, to: 30_000_000, rate: 0.1 },
      { from: 30_000_000, to: 60_000_000, rate: 0.2 },
      { from: 60_000_000, to: 100_000_000, rate: 0.3 },
      { from: 100_000_000, to: null, rate: 0.35 },
    ]);
    expect(q.map((x) => x.toNumber())).toEqual([0, 500_000, 3_500_000, 9_500_000, 14_500_000]);
  });
});

describe('calcPayroll dùng tham số truyền vào', () => {
  const base = { taxableEarnings: [30_000_000], insuranceSalary: 30_000_000, region: 1, dependantCount: 1, taxMethod: 'PROGRESSIVE' as const };

  it('giảm trừ bản thân tăng → thuế giảm', () => {
    const raised: LegalParams = { ...DEFAULT_LEGAL_PARAMS, personalDeduction: new Decimal(20_000_000) };
    const a = calcPayroll(base);
    const b = calcPayroll({ ...base, legal: raised });
    expect(b.selfDeduction.toNumber()).toBe(20_000_000);
    expect(b.pitAmount.lt(a.pitAmount)).toBe(true);
  });

  it('lương cơ sở tăng 2.340.000 → 2.530.000: trần BHXH tăng (lương cao)', () => {
    const high = { ...base, taxableEarnings: [80_000_000], insuranceSalary: 80_000_000 };
    const before = calcPayroll(high);
    const after = calcPayroll({ ...high, legal: { ...DEFAULT_LEGAL_PARAMS, baseSalary: new Decimal(2_530_000) } });
    // BHXH 8% + BHYT 1,5% trên trần 20 × lương cơ sở (46,8tr → 50,6tr);
    // BHTN 1% × 80tr (chưa tới trần 20 × 5.310.000 = 106,2tr)
    expect(before.empInsurance.toNumber()).toBe(4_446_000 + 800_000);
    expect(after.empInsurance.toNumber()).toBe(4_807_000 + 800_000);
  });
});
