import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { PIT_BRACKETS_2026 } from '../payroll/payroll.params';
import { annualSettlement, bankName, insuranceChanges, pit05KK, taxPeriodRange } from './reports.logic';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const D = (n: number) => new Decimal(n);
const start = d('2026-09-01');
const end = d('2026-09-30');

describe('insuranceChanges — D02-LT', () => {
  const meta = new Map([
    ['new', { dateHire: d('2026-09-03'), dateTerminate: null }],
    ['back', { dateHire: d('2020-01-01'), dateTerminate: null }],
    ['quit', { dateHire: d('2021-01-01'), dateTerminate: d('2026-09-15') }],
    ['unpaid', { dateHire: d('2021-01-01'), dateTerminate: null }],
    ['raise', { dateHire: d('2021-01-01'), dateTerminate: null }],
    ['cut', { dateHire: d('2021-01-01'), dateTerminate: null }],
    ['same', { dateHire: d('2021-01-01'), dateTerminate: null }],
  ]);
  const prev = [
    { employmentId: 'back', base: D(0) },
    { employmentId: 'quit', base: D(8_000_000) },
    { employmentId: 'unpaid', base: D(7_000_000) },
    { employmentId: 'raise', base: D(10_000_000) },
    { employmentId: 'cut', base: D(12_000_000) },
    { employmentId: 'same', base: D(9_000_000) },
  ];
  const curr = [
    { employmentId: 'new', base: D(6_000_000) },
    { employmentId: 'back', base: D(7_500_000) },
    { employmentId: 'unpaid', base: D(0) },
    { employmentId: 'raise', base: D(11_000_000) },
    { employmentId: 'cut', base: D(11_500_000) },
    { employmentId: 'same', base: D(9_000_000) },
  ];
  const out = insuranceChanges(prev, curr, meta, start, end);
  const by = (id: string) => out.find((c) => c.employmentId === id);

  it('phân loại tăng / giảm / điều chỉnh, bỏ qua người không đổi', () => {
    expect(by('new')).toMatchObject({ kind: 'INCREASE', reason: 'Lao động mới' });
    expect(by('back')).toMatchObject({ kind: 'INCREASE', reason: 'Đi làm lại / đủ điều kiện đóng' });
    expect(by('quit')).toMatchObject({ kind: 'DECREASE', reason: 'Nghỉ việc' });
    expect(by('unpaid')?.kind).toBe('DECREASE');
    expect(by('unpaid')?.reason).toContain('14 ngày');
    expect(by('raise')).toMatchObject({ kind: 'ADJUST_UP' });
    expect(by('cut')).toMatchObject({ kind: 'ADJUST_DOWN' });
    expect(by('same')).toBeUndefined();
  });

  it('sắp xếp: tăng → điều chỉnh tăng → giảm → điều chỉnh giảm', () => {
    expect(out.map((c) => c.kind)).toEqual(['INCREASE', 'INCREASE', 'ADJUST_UP', 'DECREASE', 'DECREASE', 'ADJUST_DOWN']);
  });
});

describe('pit05KK', () => {
  it('đếm người theo cá nhân, cộng TNCT và thuế theo cư trú', () => {
    const c = pit05KK([
      { personId: 'a', resident: true, taxableIncome: D(30_000_000), pitAmount: D(1_000_000) },
      { personId: 'a', resident: true, taxableIncome: D(30_000_000), pitAmount: D(1_000_000) }, // 2 kỳ trong quý
      { personId: 'b', resident: true, taxableIncome: D(9_000_000), pitAmount: D(0) },
      { personId: 'c', resident: false, taxableIncome: D(50_000_000), pitAmount: D(10_000_000) },
    ]);
    expect(c.c21).toBe(3);
    expect(c.c22).toBe(2);
    expect(c.c23).toBe(2);
    expect([c.c24, c.c25]).toEqual([1, 1]);
    expect(c.c26.toNumber()).toBe(119_000_000);
    expect(c.c27.toNumber()).toBe(69_000_000);
    expect(c.c28.toNumber()).toBe(50_000_000);
    expect(c.c30.toNumber()).toBe(110_000_000);
    expect(c.c33.toNumber()).toBe(12_000_000);
    expect(c.c34.toNumber()).toBe(2_000_000);
  });
});

describe('taxPeriodRange', () => {
  it('tháng và quý', () => {
    expect(taxPeriodRange('2026-09')).toMatchObject({ start: d('2026-09-01'), end: d('2026-09-30'), label: 'Tháng 09/2026' });
    expect(taxPeriodRange('2026-Q4')).toMatchObject({ start: d('2026-10-01'), end: d('2026-12-31'), label: 'Quý 4/2026' });
    expect(() => taxPeriodRange('2026-13')).toThrow();
  });
});

describe('annualSettlement', () => {
  const month = (taxable: number, ins: number, dep: number, pit: number) => ({
    taxableIncome: D(taxable),
    empInsurance: D(ins),
    dependantDeduction: D(dep),
    pitAmount: D(pit),
  });

  it('thu nhập đều 12 tháng: thuế năm = tổng thuế đã khấu trừ hằng tháng', () => {
    // 30tr/tháng, BH 3,15tr, giảm trừ bản thân 15,5tr → thu nhập tính thuế 11,35tr/tháng.
    const monthlyAssessable = 30_000_000 - 3_150_000 - 15_500_000;
    const months = Array.from({ length: 12 }, () => month(30_000_000, 3_150_000, 0, 0));
    const s = annualSettlement(months, D(15_500_000), PIT_BRACKETS_2026);
    expect(s.assessableIncome.toNumber()).toBe(monthlyAssessable * 12);
    expect(s.selfDeduction.toNumber()).toBe(186_000_000);
    // Thuế tháng: 10tr × 5% + 1,35tr × 10% = 635.000 → năm 7.620.000 (biểu năm = biểu tháng × 12).
    expect(s.taxDue.toNumber()).toBe(7_620_000);
  });

  it('làm nửa năm vẫn được giảm trừ bản thân đủ 12 tháng → nộp thừa', () => {
    const months = Array.from({ length: 6 }, () => month(30_000_000, 3_150_000, 0, 400_000));
    const s = annualSettlement(months, D(15_500_000), PIT_BRACKETS_2026);
    expect(s.taxDue.toNumber()).toBe(0); // 6 × 26,85tr − 186tr < 0
    expect(s.taxWithheld.toNumber()).toBe(2_400_000);
    expect(s.difference.toNumber()).toBe(-2_400_000);
  });
});

describe('bankName', () => {
  it('in hoa, bỏ dấu, đổi đ → D', () => {
    expect(bankName('Nguyễn Thị Đào')).toBe('NGUYEN THI DAO');
    expect(bankName('  Trần  Văn-Bình ')).toBe('TRAN VAN BINH');
  });
});
