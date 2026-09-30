import { describe, it, expect } from 'vitest';
import { pickEffective, previousDay, overlaps } from './effectiveDating';

describe('effective-dating', () => {
  const rows = [
    { id: 'a', effectiveDate: new Date('2025-01-01'), endDate: new Date('2025-06-30') },
    { id: 'b', effectiveDate: new Date('2025-07-01'), endDate: null },
  ];

  it('lấy đúng dòng có hiệu lực tại một thời điểm', () => {
    expect(pickEffective(rows, new Date('2025-03-15'))?.id).toBe('a');
    expect(pickEffective(rows, new Date('2025-09-15'))?.id).toBe('b');
  });

  it('không có dòng nào hiệu lực trước ngày bắt đầu', () => {
    expect(pickEffective(rows, new Date('2024-12-31'))).toBeUndefined();
  });

  it('previousDay lùi đúng một ngày', () => {
    expect(previousDay(new Date('2025-07-01')).toISOString().slice(0, 10)).toBe(
      '2025-06-30',
    );
  });

  it('phát hiện chồng lấn thời gian', () => {
    expect(
      overlaps(
        { effectiveDate: new Date('2025-01-01'), endDate: new Date('2025-06-30') },
        { effectiveDate: new Date('2025-06-01'), endDate: null },
      ),
    ).toBe(true);
    expect(
      overlaps(
        { effectiveDate: new Date('2025-01-01'), endDate: new Date('2025-06-30') },
        { effectiveDate: new Date('2025-07-01'), endDate: null },
      ),
    ).toBe(false);
  });
});
