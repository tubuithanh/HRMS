import { describe, expect, it } from 'vitest';
import { annualEntitlement, availableDays, monthsWorkedInYear, seniorityYears } from './entitlement.logic';

const d = (s: string) => new Date(s);
const base = { daysPerYear: 12, seniorityBonus: true };

describe('seniorityYears / phép thâm niên', () => {
  it('đủ 5 năm trong năm xét → +1 ngày', () => {
    expect(seniorityYears(d('2021-09-15'), 2026)).toBe(5);
    expect(annualEntitlement({ ...base, dateSeniority: d('2021-09-15'), dateHire: d('2021-09-15'), year: 2026 })).toBe(13);
  });
  it('4 năm → chưa cộng; 10 năm → +2', () => {
    expect(annualEntitlement({ ...base, dateSeniority: d('2022-03-01'), dateHire: d('2022-03-01'), year: 2026 })).toBe(12);
    expect(annualEntitlement({ ...base, dateSeniority: d('2016-01-01'), dateHire: d('2016-01-01'), year: 2026 })).toBe(14);
  });
  it('loại nghỉ không cộng thâm niên', () => {
    expect(annualEntitlement({ daysPerYear: 12, seniorityBonus: false, dateSeniority: d('2010-01-01'), dateHire: d('2010-01-01'), year: 2026 })).toBe(12);
  });
});

describe('tính theo tỷ lệ tháng làm việc', () => {
  it('vào làm 01/07: 6 tháng → 6 ngày', () => {
    expect(monthsWorkedInYear(d('2026-07-01'), null, 2026)).toBe(6);
    expect(annualEntitlement({ ...base, dateSeniority: d('2026-07-01'), dateHire: d('2026-07-01'), year: 2026 })).toBe(6);
  });
  it('vào làm 20/03: tháng 3 chỉ 12 ngày → không tính; 9 tháng → 9 ngày', () => {
    expect(monthsWorkedInYear(d('2026-03-20'), null, 2026)).toBe(9);
  });
  it('nghỉ việc 15/05: 5 tháng → 12 × 5/12 = 5', () => {
    expect(annualEntitlement({ ...base, dateSeniority: d('2020-01-01'), dateHire: d('2020-01-01'), until: d('2026-05-15'), year: 2026 })).toBe(5);
  });
  it('làm tròn: 13 ngày × 7/12 = 7,58 → 8', () => {
    expect(annualEntitlement({ ...base, dateSeniority: d('2021-01-01'), dateHire: d('2021-01-01'), until: d('2026-07-31'), year: 2026 })).toBe(8);
  });
});

describe('availableDays với phép tồn', () => {
  const expiry = d('2026-03-31');
  it('trước hạn: được dùng cả phép tồn', () => {
    expect(availableDays(12, 3, expiry, [{ fromDate: d('2026-02-10'), days: 2 }], d('2026-03-01'))).toBe(13);
  });
  it('sau hạn: phép tồn chưa dùng bị mất', () => {
    // dùng 2 ngày trước hạn (tiêu vào phép tồn), 1 ngày phép tồn mất
    expect(availableDays(12, 3, expiry, [{ fromDate: d('2026-02-10'), days: 2 }], d('2026-04-15'))).toBe(12);
  });
  it('dùng quá phép tồn trước hạn: phần vượt trừ vào phép năm nay', () => {
    expect(availableDays(12, 3, expiry, [{ fromDate: d('2026-02-10'), days: 5 }], d('2026-04-15'))).toBe(10);
  });
  it('không có phép tồn', () => {
    expect(availableDays(12, 0, null, [{ fromDate: d('2026-02-10'), days: 5 }], d('2026-04-15'))).toBe(7);
  });
});
