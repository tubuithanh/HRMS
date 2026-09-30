import { describe, expect, it } from 'vitest';
import { maxHoursPerDay, multiplierOf, overtimeTypeOf, validateOvertime } from './overtime.logic';

const d = (s: string) => new Date(s);
const holidays = new Set(['2026-09-02']);

describe('overtimeTypeOf / multiplierOf', () => {
  it('ngày thường, cuối tuần, ngày lễ', () => {
    expect(overtimeTypeOf(d('2026-09-29'), holidays)).toBe('WEEKDAY'); // thứ 3
    expect(overtimeTypeOf(d('2026-09-26'), holidays)).toBe('WEEKEND'); // thứ 7
    expect(overtimeTypeOf(d('2026-09-02'), holidays)).toBe('HOLIDAY'); // Quốc khánh
  });

  it('hệ số ngày / đêm theo Điều 98', () => {
    expect(multiplierOf('WEEKDAY', false).toNumber()).toBe(1.5);
    expect(multiplierOf('WEEKDAY', true).toNumber()).toBe(2.1);
    expect(multiplierOf('WEEKEND', false).toNumber()).toBe(2);
    expect(multiplierOf('WEEKEND', true).toNumber()).toBe(2.7);
    expect(multiplierOf('HOLIDAY', false).toNumber()).toBe(3);
    expect(multiplierOf('HOLIDAY', true).toNumber()).toBe(3.9);
  });
});

describe('validateOvertime', () => {
  it('ngày thường tối đa 4 giờ, ngày nghỉ tối đa 12 giờ', () => {
    expect(maxHoursPerDay('WEEKDAY')).toBe(4);
    expect(validateOvertime(4, 'WEEKDAY', 0, 0)).toBeNull();
    expect(validateOvertime(4.5, 'WEEKDAY', 0, 0)).toMatch(/4 giờ/);
    expect(validateOvertime(2, 'WEEKDAY', 3, 0)).toMatch(/đã có 3 giờ/);
    expect(validateOvertime(12, 'WEEKEND', 0, 0)).toBeNull();
    expect(validateOvertime(12.5, 'HOLIDAY', 0, 0)).toMatch(/12 giờ/);
  });

  it('tối đa 40 giờ/tháng', () => {
    expect(validateOvertime(4, 'WEEKDAY', 0, 36)).toBeNull();
    expect(validateOvertime(4, 'WEEKDAY', 0, 36.5)).toMatch(/40 giờ/);
  });

  it('số giờ phải dương và theo nửa giờ', () => {
    expect(validateOvertime(0, 'WEEKDAY', 0, 0)).toMatch(/lớn hơn 0/);
    expect(validateOvertime(1.25, 'WEEKDAY', 0, 0)).toMatch(/nửa giờ/);
  });
});
