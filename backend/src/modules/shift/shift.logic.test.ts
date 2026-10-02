import { describe, expect, it } from 'vitest';
import { isLateForShift, isOvernight, rotationShiftFor, shiftHours } from './shift.logic';

const day = new Date('2026-10-05T00:00:00Z');
const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m); // giờ địa phương
const morning = { startTime: '06:00', endTime: '14:00', breakMinutes: 30, lateGraceMinutes: 5 };
const night = { startTime: '22:00', endTime: '06:00', breakMinutes: 30, lateGraceMinutes: 0 };

describe('ca làm việc', () => {
  it('nhận biết ca qua đêm và số giờ làm', () => {
    expect(isOvernight(morning)).toBe(false);
    expect(isOvernight(night)).toBe(true);
    expect(shiftHours(morning)).toBe(7.5);
    expect(shiftHours(night)).toBe(7.5);
  });

  it('đi muộn theo giờ bắt đầu ca + phút cho phép', () => {
    expect(isLateForShift(at(5, 6, 5), day, morning)).toBe(false);
    expect(isLateForShift(at(5, 6, 6), day, morning)).toBe(true);
  });

  it('ca đêm: vào trước 22:00 đúng giờ, sau nửa đêm là muộn', () => {
    expect(isLateForShift(at(5, 21, 50), day, night)).toBe(false);
    expect(isLateForShift(at(5, 22, 1), day, night)).toBe(true);
    expect(isLateForShift(at(6, 0, 30), day, night)).toBe(true);
  });

  it('xoay ca theo chu kỳ, lệch tổ', () => {
    const pattern = ['S', 'C', 'D', null];
    // Mỗi ca 2 ngày: S S C C D D nghỉ nghỉ S …
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => rotationShiftFor(pattern, 2, i))).toEqual(['S', 'S', 'C', 'C', 'D', 'D', null, null, 'S']);
    // Tổ thứ 2 lệch 1 bước: bắt đầu ca chiều.
    expect(rotationShiftFor(pattern, 2, 0, 1)).toBe('C');
    expect(rotationShiftFor([], 1, 3)).toBeNull();
  });
});
