import { describe, expect, it } from 'vitest';
import { addMonthsEnd, expiryWarning, validateContract } from './contract.logic';

const d = (s: string) => new Date(s);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe('addMonthsEnd', () => {
  it('36 tháng kể từ 01/01/2026 kết thúc 31/12/2028', () => {
    expect(iso(addMonthsEnd(d('2026-01-01'), 36))).toBe('2028-12-31');
  });
  it('12 tháng kể từ 15/03/2026 kết thúc 14/03/2027', () => {
    expect(iso(addMonthsEnd(d('2026-03-15'), 12))).toBe('2027-03-14');
  });
  it('1 tháng kể từ 31/01 kết thúc ngày cuối tháng 2', () => {
    expect(iso(addMonthsEnd(d('2026-01-31'), 1))).toBe('2026-02-28');
  });
});

describe('validateContract', () => {
  it('không xác định thời hạn không được có ngày kết thúc', () => {
    expect(validateContract({ contractType: 'INDEFINITE', startDate: d('2026-01-01'), endDate: d('2027-01-01') }, [])).toMatch(/không có ngày kết thúc/);
    expect(validateContract({ contractType: 'INDEFINITE', startDate: d('2026-01-01') }, [])).toBeNull();
  });

  it('xác định thời hạn: bắt buộc ngày kết thúc, tối đa 36 tháng', () => {
    expect(validateContract({ contractType: 'FIXED_TERM', startDate: d('2026-01-01') }, [])).toMatch(/phải có ngày kết thúc/);
    expect(validateContract({ contractType: 'FIXED_TERM', startDate: d('2026-01-01'), endDate: d('2028-12-31') }, [])).toBeNull();
    expect(validateContract({ contractType: 'FIXED_TERM', startDate: d('2026-01-01'), endDate: d('2029-01-01') }, [])).toMatch(/36 tháng/);
  });

  it('chỉ được ký 2 lần HĐ xác định thời hạn', () => {
    const existing = [
      { id: 'a', contractType: 'FIXED_TERM' as const, startDate: d('2024-01-01'), endDate: d('2024-12-31') },
      { id: 'b', contractType: 'FIXED_TERM' as const, startDate: d('2025-01-01'), endDate: d('2025-12-31') },
    ];
    expect(validateContract({ contractType: 'FIXED_TERM', startDate: d('2026-01-01'), endDate: d('2026-12-31') }, existing)).toMatch(/không xác định thời hạn/);
    expect(validateContract({ contractType: 'INDEFINITE', startDate: d('2026-01-01') }, existing)).toBeNull();
  });

  it('thử việc tối đa 180 ngày, hoặc theo chức danh', () => {
    expect(validateContract({ contractType: 'PROBATION', startDate: d('2026-01-01'), endDate: d('2026-06-29') }, [])).toBeNull(); // 180 ngày
    expect(validateContract({ contractType: 'PROBATION', startDate: d('2026-01-01'), endDate: d('2026-06-30') }, [])).toMatch(/180 ngày/);
    expect(validateContract({ contractType: 'PROBATION', startDate: d('2026-01-01'), endDate: d('2026-03-01') }, [], 30)).toMatch(/30 ngày/);
  });

  it('không trùng thời gian; hợp đồng đã chấm dứt sớm thì tính theo ngày chấm dứt', () => {
    const old = { id: 'a', contractType: 'FIXED_TERM' as const, startDate: d('2026-01-01'), endDate: d('2026-12-31') };
    expect(validateContract({ contractType: 'INDEFINITE', startDate: d('2026-06-01') }, [old])).toMatch(/Trùng/);
    expect(validateContract({ contractType: 'INDEFINITE', startDate: d('2026-06-01') }, [{ ...old, terminatedDate: d('2026-05-31') }])).toBeNull();
  });
});

describe('expiryWarning', () => {
  const today = d('2026-09-29');
  const c = { id: 'a', contractType: 'FIXED_TERM' as const, startDate: d('2025-10-01'), endDate: d('2026-10-15') };

  it('sắp hết hạn trong 30 ngày', () => {
    expect(expiryWarning(c, [c], today, 30)).toBe('EXPIRING');
    expect(expiryWarning(c, [c], today, 10)).toBeNull();
  });
  it('đã hết hạn mà chưa ký tiếp', () => {
    expect(expiryWarning({ ...c, endDate: d('2026-09-01') }, [c], today, 30)).toBe('EXPIRED');
  });
  it('đã có hợp đồng nối tiếp thì không cảnh báo', () => {
    const next = { id: 'b', contractType: 'INDEFINITE' as const, startDate: d('2026-10-16') };
    expect(expiryWarning(c, [c, next], today, 30)).toBeNull();
  });
  it('đã chấm dứt thì không cảnh báo', () => {
    expect(expiryWarning({ ...c, terminatedDate: d('2026-09-01') }, [c], today, 30)).toBeNull();
  });
});
