import { describe, expect, it } from 'vitest';
import { birthMonths, calcClaim, childSickDaysPerYear, miscarriageDays, paternityMaxDays, sickDaysPerYear } from './insurance.logic';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const base = { lastMonthSalary: 12_000_000, avg6Salary: 10_000_000, baseSalary: 2_340_000 };

describe('số ngày được hưởng', () => {
  it('ốm đau theo số năm đóng + nghề nặng nhọc', () => {
    expect([0, 14.9, 15, 29.9, 30].map((y) => sickDaysPerYear(y, false))).toEqual([30, 30, 40, 40, 60]);
    expect(sickDaysPerYear(5, true)).toBe(40);
  });
  it('chăm con ốm theo tuổi con', () => {
    expect(childSickDaysPerYear(d('2025-01-01'), d('2026-10-01'))).toBe(20);
    expect(childSickDaysPerYear(d('2022-01-01'), d('2026-10-01'))).toBe(15);
    expect(childSickDaysPerYear(d('2018-01-01'), d('2026-10-01'))).toBe(0);
  });
  it('sảy thai theo tuổi thai, lao động nam khi vợ sinh, sinh con', () => {
    expect([4, 5, 12, 13, 21, 22].map((w) => miscarriageDays(w))).toEqual([10, 20, 20, 40, 40, 50]);
    expect([paternityMaxDays(1, false), paternityMaxDays(1, true), paternityMaxDays(2, false), paternityMaxDays(3, false), paternityMaxDays(2, true)]).toEqual([5, 7, 10, 13, 14]);
    expect([birthMonths(1), birthMonths(2), birthMonths(3)]).toEqual([6, 7, 8]);
  });
});

describe('tiền chế độ', () => {
  it('ốm đau: 75% × lương tháng gần nhất ÷ 24 × ngày', () => {
    // 12tr × 0,75 / 24 = 375.000/ngày × 4 = 1.500.000
    expect(calcClaim({ ...base, regime: 'SICK', days: 4 }).amount.toNumber()).toBe(1_500_000);
  });
  it('khám thai, nam nghỉ khi vợ sinh: 100% bình quân 6 tháng ÷ 24 × ngày', () => {
    expect(calcClaim({ ...base, regime: 'PATERNITY', days: 5 }).amount.toNumber()).toBe(2_083_333);
    expect(calcClaim({ ...base, regime: 'CHECKUP', days: 2 }).amount.toNumber()).toBe(833_333);
  });
  it('sinh con: bình quân 6 tháng × số tháng + trợ cấp một lần 2 × lương cơ sở mỗi con', () => {
    const one = calcClaim({ ...base, regime: 'BIRTH', days: 0, childCount: 1 });
    expect([one.amount.toNumber(), one.lumpSum.toNumber(), one.months]).toEqual([60_000_000, 4_680_000, 6]);
    const twins = calcClaim({ ...base, regime: 'BIRTH', days: 0, childCount: 2 });
    expect([twins.amount.toNumber(), twins.lumpSum.toNumber(), twins.months]).toEqual([70_000_000, 9_360_000, 7]);
  });
  it('sảy thai: ngày lịch ÷ 30; dưỡng sức: 30% lương cơ sở / ngày', () => {
    expect(calcClaim({ ...base, regime: 'MISCARRIAGE', days: 20 }).amount.toNumber()).toBe(6_666_667);
    expect(calcClaim({ ...base, regime: 'RECOVERY', days: 5 }).amount.toNumber()).toBe(3_510_000);
  });
});

describe('quy tắc lấy từ Cấu hình hệ thống', () => {
  it('luật đổi tỷ lệ ốm đau / số ngày → dùng số mới', async () => {
    const { DEFAULT_LABOR_RULES } = await import('../settings/labor-rules');
    const rules = { ...DEFAULT_LABOR_RULES, sickRatePercent: 80, sickDaysUnder15: 35 };
    expect(sickDaysPerYear(1, false, rules)).toBe(35);
    const r = calcClaim({ regime: 'SICK', days: 24, lastMonthSalary: 10_000_000, avg6Salary: 0, baseSalary: 0, rules });
    expect(r.amount.toString()).toBe('8000000');
  });
});
