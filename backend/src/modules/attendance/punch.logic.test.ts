import { describe, expect, it } from 'vitest';
import { detectColumns, groupPunches, parseTimestamp, ymd } from './punch.logic';

const local = (y: number, mo: number, d: number, h: number, mi: number, s = 0) => new Date(y, mo - 1, d, h, mi, s);

describe('đọc thời gian máy chấm công', () => {
  it('các định dạng chuỗi', () => {
    expect(parseTimestamp('2026-10-05 07:58:12')).toEqual(local(2026, 10, 5, 7, 58, 12));
    expect(parseTimestamp('05/10/2026 07:58')).toEqual(local(2026, 10, 5, 7, 58));
    expect(parseTimestamp('5/10/2026 5:03:00 PM')).toEqual(local(2026, 10, 5, 17, 3));
    expect(parseTimestamp('5/10/2026 12:10:00 AM')).toEqual(local(2026, 10, 5, 0, 10));
    expect(parseTimestamp('xyz')).toBeNull();
  });
  it('ngày và giờ hai cột', () => {
    expect(parseTimestamp('05/10/2026', '22:01')).toEqual(local(2026, 10, 5, 22, 1));
    expect(parseTimestamp('05/10/2026', '25:01')).toBeNull();
  });
  it('ô Date của Excel (giờ đồng hồ lưu dạng UTC) và số sê-ri', () => {
    expect(parseTimestamp(new Date(Date.UTC(2026, 9, 5, 7, 58)))).toEqual(local(2026, 10, 5, 7, 58));
    // 46300 = 2026-10-05; 0.5 = 12:00
    expect(ymd(new Date(Date.UTC(2026, 9, 5)))).toBe('2026-10-05');
    expect(parseTimestamp(46300.5)).toEqual(local(2026, 10, 5, 12, 0));
  });
});

describe('tìm cột', () => {
  it('tiêu đề tiếng Việt và ZKTeco', () => {
    expect(detectColumns(['STT', 'Mã chấm công', 'Họ tên', 'Thời gian'])).toEqual({ code: 1, datetime: 3, time: -1 });
    expect(detectColumns(['AC-No.', 'Name', 'Date', 'Time'])).toEqual({ code: 0, datetime: 2, time: 3 });
    expect(detectColumns(['Họ tên', 'Phòng'])).toBeNull();
  });
});

describe('ghép lần quẹt theo ca', () => {
  const day = { startTime: '08:00', endTime: '17:00', breakMinutes: 60, lateGraceMinutes: 0 };
  const night = { startTime: '22:00', endTime: '06:00', breakMinutes: 30, lateGraceMinutes: 0 };

  it('ca ngày: vào sớm nhất, ra muộn nhất, bỏ quẹt trùng trong 2 phút', () => {
    const r = groupPunches(
      [
        { key: 'A', at: local(2026, 10, 5, 7, 55) },
        { key: 'A', at: local(2026, 10, 5, 7, 56) },
        { key: 'A', at: local(2026, 10, 5, 12, 1) },
        { key: 'A', at: local(2026, 10, 5, 17, 5) },
      ],
      () => day,
    );
    expect(r).toHaveLength(1);
    expect(r[0].checkIn).toEqual(local(2026, 10, 5, 7, 55));
    expect(r[0].checkOut).toEqual(local(2026, 10, 5, 17, 5));
    expect(r[0].punches).toBe(3);
  });

  it('ca đêm: quẹt ra rạng sáng thuộc ngày công hôm trước', () => {
    const r = groupPunches(
      [
        { key: 'B', at: local(2026, 10, 5, 21, 50) },
        { key: 'B', at: local(2026, 10, 6, 6, 4) },
        { key: 'B', at: local(2026, 10, 6, 21, 55) },
      ],
      () => night,
    );
    expect(r.map((x) => [ymd(x.workDate), x.checkOut ? 2 : 1])).toEqual([
      ['2026-10-05', 2],
      ['2026-10-06', 1],
    ]);
    expect(r[0].checkOut).toEqual(local(2026, 10, 6, 6, 4));
  });

  it('một lần quẹt: chỉ có giờ vào', () => {
    const r = groupPunches([{ key: 'C', at: local(2026, 10, 5, 8, 0) }], () => day);
    expect(r[0].checkOut).toBeNull();
  });
});

describe('ghép lần quẹt: ca đêm hôm trước rồi ca ngày hôm sau', () => {
  it('quẹt ra 06:04 thuộc ca đêm, quẹt vào 08:25 thuộc ca ngày hôm sau', () => {
    const day = { startTime: '08:30', endTime: '17:30', breakMinutes: 60, lateGraceMinutes: 0 };
    const night = { startTime: '22:00', endTime: '06:00', breakMinutes: 30, lateGraceMinutes: 0 };
    const shiftOf = (_k: string, d: Date) => (ymd(d) === '2026-10-05' ? night : day);
    const r = groupPunches(
      [
        { key: 'A', at: local(2026, 10, 5, 21, 50) },
        { key: 'A', at: local(2026, 10, 6, 6, 4) },
        { key: 'A', at: local(2026, 10, 6, 8, 25) },
        { key: 'A', at: local(2026, 10, 6, 17, 40) },
      ],
      shiftOf,
    );
    expect(r.map((x) => [ymd(x.workDate), x.checkIn.getHours(), x.checkOut?.getHours()])).toEqual([
      ['2026-10-05', 21, 6],
      ['2026-10-06', 8, 17],
    ]);
  });
});
