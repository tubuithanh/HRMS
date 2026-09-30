import { describe, expect, it } from 'vitest';
import { isLate, summarizeMonth } from './attendance.logic';
import { monthRange } from '../../common/utils/dates';

const d = (s: string) => new Date(s);

describe('isLate', () => {
  it('8:30 đúng giờ, 8:31 là muộn', () => {
    expect(isLate(new Date(2026, 8, 29, 8, 30))).toBe(false);
    expect(isLate(new Date(2026, 8, 29, 8, 31))).toBe(true);
    expect(isLate(new Date(2026, 8, 29, 7, 59))).toBe(false);
    expect(isLate(new Date(2026, 8, 29, 9, 0))).toBe(true);
  });

  it('theo cấu hình: giờ vào 8:00, cho phép 5 phút', () => {
    const start = { hour: 8, minute: 0 };
    expect(isLate(new Date(2026, 8, 29, 8, 5), start, 5)).toBe(false);
    expect(isLate(new Date(2026, 8, 29, 8, 6), start, 5)).toBe(true);
  });
});

describe('summarizeMonth', () => {
  const { start, end } = monthRange('2026-09');

  it('đếm các trạng thái chấm công', () => {
    const s = summarizeMonth(
      start,
      end,
      [
        { workDate: d('2026-09-01'), status: 'PRESENT' },
        { workDate: d('2026-09-02'), status: 'HOLIDAY' },
        { workDate: d('2026-09-03'), status: 'LATE' },
        { workDate: d('2026-09-04'), status: 'ABSENT' },
        { workDate: d('2026-09-07'), status: 'REMOTE' },
      ],
      [],
    );
    expect(s.standardDays).toBe(22);
    expect(s).toMatchObject({ present: 1, holiday: 1, late: 1, absent: 1, remote: 1 });
    expect(s.paidDays).toBe(4);
    expect(s.days['2026-09-04']).toBe('ABSENT');
  });

  it('đơn nghỉ: bỏ cuối tuần, tách có lương / không lương, nửa ngày', () => {
    const s = summarizeMonth(start, end, [], [
      // T6 25 → T2 28: 2 ngày làm việc
      { fromDate: d('2026-09-25'), toDate: d('2026-09-28'), isHalfDay: false, isPaid: true },
      { fromDate: d('2026-09-29'), toDate: d('2026-09-29'), isHalfDay: true, isPaid: false },
    ]);
    expect(s.paidLeave).toBe(2);
    expect(s.unpaidLeave).toBe(0.5);
    expect(s.paidDays).toBe(2);
    expect(s.days['2026-09-26']).toBeUndefined();
  });

  it('nghỉ phép nhập tay không có đơn vẫn được tính phép có lương', () => {
    const s = summarizeMonth(start, end, [{ workDate: d('2026-09-29'), status: 'LEAVE' }], []);
    expect(s.paidLeave).toBe(1);
    expect(s.paidDays).toBe(1);
    expect(s.days['2026-09-29']).toBe('LEAVE');
  });

  it('vào làm giữa tháng: công chuẩn chỉ tính từ ngày vào', () => {
    // 2026-09-21 (thứ 2) → 30/9: 8 ngày làm việc
    expect(summarizeMonth(d('2026-09-21'), end, [], []).standardDays).toBe(8);
  });

  it('ngày lễ tự tính là nghỉ lễ có lương; cộng giờ làm thêm', () => {
    const s = summarizeMonth(start, end, [], [], new Set(['2026-09-01', '2026-09-02']), [
      { workDate: d('2026-09-05'), hours: 8 },
      { workDate: d('2026-10-01'), hours: 4 }, // ngoài tháng
    ]);
    expect(s.holiday).toBe(2);
    expect(s.paidDays).toBe(2);
    expect(s.days['2026-09-02']).toBe('HOLIDAY');
    expect(s.overtimeHours).toBe(8);
  });

  it('sáng nghỉ phép + chiều nghỉ không lương cùng ngày = 1 ngày', () => {
    const s = summarizeMonth(start, end, [], [
      { fromDate: d('2026-09-29'), toDate: d('2026-09-29'), isHalfDay: true, isPaid: true },
      { fromDate: d('2026-09-29'), toDate: d('2026-09-29'), isHalfDay: true, isPaid: false },
    ]);
    expect(s.paidLeave).toBe(0.5);
    expect(s.unpaidLeave).toBe(0.5);
  });

  it('bản ghi chấm công được ưu tiên hơn đơn nghỉ', () => {
    const s = summarizeMonth(
      start,
      end,
      [{ workDate: d('2026-09-29'), status: 'PRESENT' }],
      [{ fromDate: d('2026-09-29'), toDate: d('2026-09-29'), isHalfDay: false, isPaid: true }],
    );
    expect(s.present).toBe(1);
    expect(s.paidLeave).toBe(0);
  });
});
