import { AttendanceStatus } from '@prisma/client';
import { addDays, formatDate, isWeekend } from '../../common/utils/dates';

/** Giờ bắt đầu làm việc (giờ địa phương máy chủ). Vào sau giờ này là đi muộn. */
export const WORK_START = { hour: 8, minute: 30 };

/** Vào sau giờ bắt đầu + số phút cho phép thì là đi muộn. */
export function isLate(checkIn: Date, start = WORK_START, graceMinutes = 0): boolean {
  const minutes = checkIn.getHours() * 60 + checkIn.getMinutes();
  return minutes > start.hour * 60 + start.minute + graceMinutes;
}

export interface DayRecord {
  workDate: Date;
  status: AttendanceStatus;
}

export interface LeaveSpan {
  fromDate: Date;
  toDate: Date;
  isHalfDay: boolean;
  isPaid: boolean;
}

export interface TimesheetSummary {
  /** Ngày công chuẩn của tháng (thứ 2 – thứ 6). */
  standardDays: number;
  present: number;
  late: number;
  remote: number;
  absent: number;
  holiday: number;
  paidLeave: number;
  unpaidLeave: number;
  /** Ngày công được trả lương = đi làm + phép có lương + lễ. */
  paidDays: number;
  /** Giờ làm thêm đã duyệt. */
  overtimeHours: number;
  /** Trạng thái theo ngày, khoá "YYYY-MM-DD". Ngày chưa có dữ liệu bị bỏ qua. */
  days: Record<string, AttendanceStatus>;
}

/**
 * Tổng hợp bảng công một tháng cho một nhân viên từ bản ghi chấm công
 * và các đơn nghỉ đã duyệt. Bản ghi chấm công được ưu tiên hơn đơn nghỉ
 * nếu cùng một ngày có cả hai.
 */
export function summarizeMonth(
  start: Date,
  end: Date,
  records: DayRecord[],
  leaves: LeaveSpan[],
  holidays: Set<string> = new Set(),
  overtime: Array<{ workDate: Date; hours: number }> = [],
): TimesheetSummary {
  const s: TimesheetSummary = {
    standardDays: 0,
    present: 0,
    late: 0,
    remote: 0,
    absent: 0,
    holiday: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    paidDays: 0,
    overtimeHours: 0,
    days: {},
  };

  const byDate = new Map(records.map((r) => [formatDate(r.workDate), r.status]));

  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = formatDate(d);
    const weekend = isWeekend(d);
    if (!weekend) s.standardDays++;

    let status = byDate.get(key);
    // Ngày lễ rơi vào ngày thường mà chưa có bản ghi: tự tính là nghỉ lễ.
    if (!status && !weekend && holidays.has(key)) status = 'HOLIDAY';
    if (status) {
      s.days[key] = status;
      if (status === 'PRESENT') s.present++;
      else if (status === 'LATE') s.late++;
      else if (status === 'REMOTE') s.remote++;
      else if (status === 'ABSENT') s.absent++;
      else if (status === 'HOLIDAY') s.holiday++;
      // LEAVE nhập tay: tính theo đơn nghỉ bên dưới nếu có.
      if (status !== 'LEAVE') continue;
    }

    // Có thể có 2 đơn nửa ngày (sáng + chiều) trong một ngày; tổng tối đa 1 ngày.
    const dayLeaves = weekend ? [] : leaves.filter((l) => l.fromDate <= d && l.toDate >= d);
    if (dayLeaves.length) {
      s.days[key] = 'LEAVE';
      let taken = 0;
      for (const leave of dayLeaves) {
        const amount = Math.min(leave.isHalfDay ? 0.5 : 1, 1 - taken);
        taken += amount;
        if (leave.isPaid) s.paidLeave += amount;
        else s.unpaidLeave += amount;
      }
    } else if (status === 'LEAVE' && !weekend) {
      // Nhân sự nhập tay "nghỉ phép" mà không có đơn: coi là phép có lương.
      s.paidLeave += 1;
    }
  }

  s.paidDays = s.present + s.late + s.remote + s.holiday + s.paidLeave;
  s.overtimeHours = overtime
    .filter((o) => o.workDate >= start && o.workDate <= end)
    .reduce((sum, o) => sum + o.hours, 0);
  return s;
}
