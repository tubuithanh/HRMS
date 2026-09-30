import { describe, expect, it } from 'vitest';
import { cellText, parseAttendanceStatus, parseDate, parseDigits, parseGender, parseMoney, parseTime } from './import.logic';

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : d);

describe('parseDate', () => {
  it('dd/mm/yyyy, d/m/yyyy, yyyy-mm-dd, ô Date', () => {
    expect(iso(parseDate('29/09/2026').value)).toBe('2026-09-29');
    expect(iso(parseDate('1/2/2026').value)).toBe('2026-02-01');
    expect(iso(parseDate('2026-09-29').value)).toBe('2026-09-29');
    expect(iso(parseDate(new Date(Date.UTC(2026, 8, 29))).value)).toBe('2026-09-29');
  });
  it('ô trống → null, sai dạng / ngày không tồn tại → lỗi', () => {
    expect(parseDate('').value).toBeNull();
    expect(parseDate('09-2026').error).toMatch(/dd\/mm\/yyyy/);
    expect(parseDate('31/02/2026').error).toMatch(/không tồn tại/);
  });
});

describe('parseTime', () => {
  it('HH:mm, 8h30, phân số ngày của Excel', () => {
    expect(parseTime('08:30').value).toEqual([8, 30]);
    expect(parseTime('8h30').value).toEqual([8, 30]);
    expect(parseTime(0.75).value).toEqual([18, 0]);
    expect(parseTime('25:00').error).toBeTruthy();
  });
});

describe('parseMoney', () => {
  it('số, chuỗi có phân tách hàng nghìn', () => {
    expect(parseMoney(15000000).value).toBe(15_000_000);
    expect(parseMoney('15.000.000').value).toBe(15_000_000);
    expect(parseMoney('15,000,000 đ').value).toBe(15_000_000);
    expect(parseMoney('').value).toBeNull();
    expect(parseMoney('mười triệu').error).toBeTruthy();
    expect(parseMoney(-1).error).toBeTruthy();
  });
});

describe('parseGender / parseAttendanceStatus / parseDigits / cellText', () => {
  it('giới tính', () => {
    expect(parseGender('Nam').value).toBe('MALE');
    expect(parseGender('nữ').value).toBe('FEMALE');
    expect(parseGender('x').error).toBeTruthy();
  });
  it('ký hiệu bảng công', () => {
    expect(parseAttendanceStatus('X').value).toBe('PRESENT');
    expect(parseAttendanceStatus('Đi muộn').value).toBe('LATE');
    expect(parseAttendanceStatus('Z').error).toBeTruthy();
  });
  it('CCCD 12 số', () => {
    expect(parseDigits('079 123 456 789', [12], 'CCCD').value).toBe('079123456789');
    expect(parseDigits('12345', [12], 'CCCD').error).toMatch(/12 chữ số/);
  });
  it('ô công thức và rich text', () => {
    expect(cellText({ result: 'ABC' })).toBe('ABC');
    expect(cellText({ richText: [{ text: 'Nguyễn ' }, { text: 'An' }] })).toBe('Nguyễn An');
  });
});
