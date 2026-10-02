import { describe, expect, it } from 'vitest';
import { capDeduction } from './deduction';

describe('capDeduction', () => {
  it('lương thực trả âm hoặc bằng 0 → không khấu trừ, chuyển hết kỳ sau', () => {
    const r = capDeduction(1_000_000, -500_000);
    expect(r.applied.toString()).toBe('0');
    expect(r.deferred.toString()).toBe('1000000');
  });
  it('trong trần 30% → trừ đủ', () => {
    const r = capDeduction(1_000_000, 10_000_000);
    expect(r.applied.toString()).toBe('1000000');
    expect(r.deferred.toString()).toBe('0');
  });
});
