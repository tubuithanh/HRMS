import { describe, expect, it } from 'vitest';
import { estimateInsuredMonths, fullMonthsBetween, severanceEligibility } from './offboarding.logic';

const d = (s: string) => new Date(s);

describe('fullMonthsBetween', () => {
  it('tính trọn tháng, ngày làm cuối được tính', () => {
    expect(fullMonthsBetween(d('2026-01-01'), d('2026-12-31'))).toBe(12);
    expect(fullMonthsBetween(d('2026-01-15'), d('2026-07-14'))).toBe(6);
    expect(fullMonthsBetween(d('2026-01-15'), d('2026-07-13'))).toBe(5);
    expect(fullMonthsBetween(d('2020-03-01'), d('2026-09-30'))).toBe(79);
  });
});

describe('severanceEligibility', () => {
  it('xin nghỉ sau 12 tháng → được hưởng trợ cấp thôi việc', () => {
    expect(severanceEligibility('RESIGN', 12)).toEqual({ eligible: true, isRedundancy: false, reason: null });
  });
  it('chưa đủ 12 tháng → không', () => {
    expect(severanceEligibility('RESIGN', 11).eligible).toBe(false);
    expect(severanceEligibility('REDUNDANCY', 11).eligible).toBe(false);
  });
  it('mất việc → trợ cấp mất việc', () => {
    expect(severanceEligibility('REDUNDANCY', 30).isRedundancy).toBe(true);
  });
  it('sa thải, nghỉ hưu → không', () => {
    expect(severanceEligibility('DISMISS', 100).eligible).toBe(false);
    expect(severanceEligibility('RETIRE', 100).eligible).toBe(false);
  });
});

describe('estimateInsuredMonths', () => {
  it('trừ thử việc và tháng không đóng BH, không âm', () => {
    expect(estimateInsuredMonths(40, 2, 1)).toBe(37);
    expect(estimateInsuredMonths(1, 2, 0)).toBe(0);
  });
});
