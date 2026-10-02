import { describe, expect, it } from 'vitest';
import { computeAttendanceTimes, distanceMeters, ipAllowed, isLateForShift, isOvernight, rotationShiftFor, shiftHours } from './shift.logic';

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


describe('tính giờ công theo ca', () => {
  const D = new Date('2026-10-05T00:00:00Z');
  const t = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
  const day = { startTime: '08:00', endTime: '17:00', breakMinutes: 60, lateGraceMinutes: 5 };
  const nightS = { startTime: '22:00', endTime: '06:00', breakMinutes: 30, lateGraceMinutes: 0 };

  it('đủ giờ: 8 tiếng, không muộn, không sớm', () => {
    expect(computeAttendanceTimes(t(5, 7, 50), t(5, 17, 10), D, day)).toEqual({ lateMinutes: 0, earlyMinutes: 0, workedMinutes: 480, nightMinutes: 0 });
  });
  it('muộn trong số phút cho phép thì không tính, quá thì tính cả', () => {
    expect(computeAttendanceTimes(t(5, 8, 5), t(5, 17), D, day).lateMinutes).toBe(0);
    expect(computeAttendanceTimes(t(5, 8, 20), t(5, 17), D, day).lateMinutes).toBe(20);
  });
  it('về sớm và giờ làm thực tế', () => {
    const r = computeAttendanceTimes(t(5, 8, 20), t(5, 16, 30), D, day);
    expect(r.earlyMinutes).toBe(30);
    expect(r.workedMinutes).toBe(8 * 60 + 10 - 60); // 08:20–16:30 = 490 phút − 60 nghỉ
  });
  it('chưa chấm ra: chỉ có đi muộn', () => {
    expect(computeAttendanceTimes(t(5, 8, 30), null, D, day)).toEqual({ lateMinutes: 30, earlyMinutes: 0, workedMinutes: null, nightMinutes: 0 });
  });
  it('ca đêm 22:00 – 06:00: toàn bộ là giờ đêm (trừ nghỉ giữa ca)', () => {
    const r = computeAttendanceTimes(t(5, 21, 55), t(6, 6, 5), D, nightS);
    expect(r).toEqual({ lateMinutes: 0, earlyMinutes: 0, workedMinutes: 450, nightMinutes: 450 });
  });
  it('ca chiều 14:00 – 22:00 về muộn 23:00: không tính giờ đêm ngoài ca', () => {
    const s = { startTime: '14:00', endTime: '22:00', breakMinutes: 30, lateGraceMinutes: 0 };
    expect(computeAttendanceTimes(t(5, 14), t(5, 23), D, s).nightMinutes).toBe(0);
  });
  it('ca sáng sớm 04:00 – 12:00: 2 giờ đêm (04:00 – 06:00)', () => {
    const s = { startTime: '04:00', endTime: '12:00', breakMinutes: 0, lateGraceMinutes: 0 };
    expect(computeAttendanceTimes(t(5, 4), t(5, 12), D, s).nightMinutes).toBe(120);
  });
});

describe('giới hạn vị trí chấm công', () => {
  it('khoảng cách haversine', () => {
    // Nhà thờ Đức Bà → Dinh Độc Lập ≈ 600 m
    const d = distanceMeters(10.7798, 106.699, 10.777, 106.6953);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(700);
    expect(distanceMeters(10.78, 106.7, 10.78, 106.7)).toBe(0);
  });
  it('IP đơn, dải CIDR, IPv6-mapped', () => {
    expect(ipAllowed('203.113.10.25', ['203.113.10.0/24'])).toBe(true);
    expect(ipAllowed('203.113.11.25', ['203.113.10.0/24'])).toBe(false);
    expect(ipAllowed('::ffff:192.168.1.7', ['192.168.1.7'])).toBe(true);
    expect(ipAllowed('10.0.0.1', [])).toBe(false);
  });
});
