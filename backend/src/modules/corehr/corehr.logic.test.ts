import { describe, it, expect } from 'vitest';
import { calcProbationEndDate, defaultAssignmentAction } from './corehr.logic';

describe('calcProbationEndDate', () => {
  it('vào 1/1, thử việc 60 ngày -> ngày cuối là 1/3 (ngày thứ 60)', () => {
    const end = calcProbationEndDate(new Date('2026-01-01'), 60);
    expect(end?.toISOString().slice(0, 10)).toBe('2026-03-01');
  });

  it('thử việc 1 ngày -> ngày cuối là chính ngày vào', () => {
    const end = calcProbationEndDate(new Date('2026-01-01'), 1);
    expect(end?.toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('không thử việc -> undefined', () => {
    expect(calcProbationEndDate(new Date('2026-01-01'), 0)).toBeUndefined();
  });
});

describe('defaultAssignmentAction', () => {
  it('chưa có vị trí chính -> HIRE', () => {
    expect(defaultAssignmentAction(false)).toBe('HIRE');
  });
  it('đã có vị trí chính -> TRANSFER', () => {
    expect(defaultAssignmentAction(true)).toBe('TRANSFER');
  });
});
