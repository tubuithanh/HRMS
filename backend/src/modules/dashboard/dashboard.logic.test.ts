import { describe, expect, it } from 'vitest';
import {
  AGE_BUCKETS,
  bucketize,
  fullYears,
  headcountTrend,
  isEmployedAt,
  monthEnds,
  turnoverYtd,
} from './dashboard.logic';

const d = (s: string) => new Date(s);
const emp = (hire: string, term: string | null = null, status = term ? 'TERMINATED' : 'ACTIVE') => ({
  dateHire: d(hire),
  dateTerminate: term ? d(term) : null,
  status,
});

describe('isEmployedAt', () => {
  it('tính cả ngày vào làm và ngày nghỉ việc', () => {
    const e = emp('2026-03-10', '2026-06-30');
    expect(isEmployedAt(e, d('2026-03-09'))).toBe(false);
    expect(isEmployedAt(e, d('2026-03-10'))).toBe(true);
    expect(isEmployedAt(e, d('2026-06-30'))).toBe(true);
    expect(isEmployedAt(e, d('2026-07-01'))).toBe(false);
  });
  it('đã nghỉ mà thiếu ngày nghỉ việc thì không tính', () => {
    expect(isEmployedAt({ dateHire: d('2020-01-01'), dateTerminate: null, status: 'TERMINATED' }, d('2026-01-01'))).toBe(false);
  });
});

describe('monthEnds', () => {
  it('3 tháng gần nhất, tháng hiện tại kết thúc ở hôm nay', () => {
    const m = monthEnds(d('2026-09-29'), 3);
    expect(m.map((x) => x.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(m[1].end.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(m[2].end.toISOString().slice(0, 10)).toBe('2026-09-29');
  });
  it('vắt qua năm trước', () => {
    expect(monthEnds(d('2026-02-10'), 3).map((x) => x.month)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('headcountTrend & turnover', () => {
  const emps = [emp('2025-01-01'), emp('2025-06-01', '2026-02-15'), emp('2026-02-01'), emp('2026-03-05')];

  it('quân số cuối tháng, tuyển mới, nghỉ việc', () => {
    const t = headcountTrend(emps, d('2026-03-31'), 3);
    expect(t).toEqual([
      { month: '2026-01', headcount: 2, hires: 0, terminations: 0 },
      { month: '2026-02', headcount: 2, hires: 1, terminations: 1 },
      { month: '2026-03', headcount: 3, hires: 1, terminations: 0 },
    ]);
  });

  it('tỷ lệ nghỉ việc từ đầu năm = 1 / bình quân (2,2,3) = 42,9%', () => {
    expect(turnoverYtd(emps, d('2026-03-31'))).toBe(42.9);
  });
});

describe('fullYears & bucketize', () => {
  it('chưa tới ngày sinh nhật thì chưa đủ tuổi', () => {
    expect(fullYears(d('2000-10-01'), d('2026-09-29'))).toBe(25);
    expect(fullYears(d('2000-09-29'), d('2026-09-29'))).toBe(26);
  });
  it('chia nhóm tuổi, có nhóm chưa rõ', () => {
    expect(bucketize([22, 25, 34, 35, 60, null], AGE_BUCKETS)).toEqual([
      { label: 'Dưới 25', count: 1 },
      { label: '25–34', count: 2 },
      { label: '35–44', count: 1 },
      { label: '45–54', count: 0 },
      { label: 'Từ 55', count: 1 },
      { label: 'Chưa rõ', count: 1 },
    ]);
  });
});
