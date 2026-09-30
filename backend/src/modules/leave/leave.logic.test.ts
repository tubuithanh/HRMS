import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calcLeaveDays, remainingDays } from './leave.logic';
import { countWorkingDays, monthRange } from '../../common/utils/dates';

const d = (s: string) => new Date(s);

describe('calcLeaveDays', () => {
  it('đếm ngày làm việc, bỏ thứ 7 và chủ nhật', () => {
    // 2026-09-25 là thứ 6, 2026-09-29 là thứ 3 → T6, T2, T3 = 3 ngày
    expect(calcLeaveDays(d('2026-09-25'), d('2026-09-29')).toNumber()).toBe(3);
  });

  it('một ngày thường = 1 ngày', () => {
    expect(calcLeaveDays(d('2026-09-29'), d('2026-09-29')).toNumber()).toBe(1);
  });

  it('nửa ngày = 0,5', () => {
    expect(
      calcLeaveDays(d('2026-09-29'), d('2026-09-29'), true).toNumber(),
    ).toBe(0.5);
  });

  it('nửa ngày nhưng nhiều ngày → lỗi', () => {
    expect(() => calcLeaveDays(d('2026-09-28'), d('2026-09-29'), true)).toThrow();
  });

  it('ngày kết thúc trước ngày bắt đầu → lỗi', () => {
    expect(() => calcLeaveDays(d('2026-09-29'), d('2026-09-28'))).toThrow();
  });

  it('không tính ngày lễ: 31/8 → 3/9 (lễ 1, 2/9) = 2 ngày', () => {
    const holidays = new Set(['2026-09-01', '2026-09-02']);
    expect(calcLeaveDays(d('2026-08-31'), d('2026-09-03'), false, holidays).toNumber()).toBe(2);
  });

  it('chỉ có cuối tuần → lỗi', () => {
    // 2026-09-26 thứ 7, 2026-09-27 chủ nhật
    expect(() => calcLeaveDays(d('2026-09-26'), d('2026-09-27'))).toThrow();
  });
});

describe('remainingDays', () => {
  it('trừ số đã dùng', () => {
    expect(remainingDays(new Decimal(12), new Decimal(3.5))?.toNumber()).toBe(8.5);
  });
  it('không âm', () => {
    expect(remainingDays(new Decimal(2), new Decimal(5))?.toNumber()).toBe(0);
  });
  it('không giới hạn → null', () => {
    expect(remainingDays(null, new Decimal(5))).toBeNull();
  });
});

describe('dates', () => {
  it('tháng 9/2026 có 22 ngày làm việc', () => {
    const { start, end } = monthRange('2026-09');
    expect(end.toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(countWorkingDays(start, end)).toBe(22);
  });
  it('tháng 2/2028 (năm nhuận) kết thúc ngày 29', () => {
    expect(monthRange('2028-02').end.toISOString().slice(0, 10)).toBe('2028-02-29');
  });
});
