import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/AppError';
import { addDays, monthRange, todayDate } from '../../common/utils/dates';
import { isLate, summarizeMonth } from './attendance.logic';
import { getSettings, parseHHmm } from '../settings/settings.service';
import { UpsertRecordInput } from './attendance.schema';
import { holidaySet } from '../overtime/overtime.service';
import { shiftService } from '../shift/shift.service';
import { isLateForShift, isOvernight } from '../shift/shift.logic';

const personSelect = {
  select: { id: true, personCode: true, fullName: true },
} as const;

export const attendanceService = {
  // ---------- Nhân viên tự chấm công ----------
  async checkIn(employmentId: string, now = new Date()) {
    const workDate = todayDate(now);
    const existing = await prisma.attendanceRecord.findUnique({
      where: { employmentId_workDate: { employmentId, workDate } },
    });
    if (existing?.checkIn) throw new ConflictError('Hôm nay bạn đã chấm công vào');
    // Có ca (xếp ca hoặc ca mặc định) thì so với giờ bắt đầu ca, không thì giờ hành chính.
    const shift = await shiftService.resolve(employmentId, workDate);
    let late: boolean;
    if (shift) late = isLateForShift(now, workDate, shift);
    else {
      const { attendance } = await getSettings();
      late = isLate(now, parseHHmm(attendance.workStart), attendance.lateGraceMinutes);
    }
    const status = late ? 'LATE' : 'PRESENT';
    const shiftId = shift?.id ?? null;
    return prisma.attendanceRecord.upsert({
      where: { employmentId_workDate: { employmentId, workDate } },
      update: { checkIn: now, status, shiftId, source: 'SELF' },
      create: { employmentId, workDate, checkIn: now, status, shiftId, source: 'SELF' },
    });
  },

  async checkOut(employmentId: string, now = new Date()) {
    const workDate = todayDate(now);
    let existing = await prisma.attendanceRecord.findUnique({
      where: { employmentId_workDate: { employmentId, workDate } },
    });
    // Ca qua đêm: ra ca sáng hôm sau → đóng bản ghi của ngày hôm trước.
    if (!existing?.checkIn) {
      const prev = await prisma.attendanceRecord.findUnique({
        where: { employmentId_workDate: { employmentId, workDate: addDays(workDate, -1) } },
        include: { shift: true },
      });
      if (prev?.checkIn && !prev.checkOut && prev.shift && isOvernight(prev.shift)) existing = prev;
    }
    if (!existing?.checkIn) throw new ConflictError('Bạn chưa chấm công vào hôm nay');
    if (existing.checkOut) throw new ConflictError('Hôm nay bạn đã chấm công ra');
    return prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: { checkOut: now },
    });
  },

  // ---------- Bản ghi ----------
  listRecords(filter: { employmentId?: string; month: string }) {
    const { start, end } = monthRange(filter.month);
    return prisma.attendanceRecord.findMany({
      where: {
        workDate: { gte: start, lte: end },
        ...(filter.employmentId ? { employmentId: filter.employmentId } : {}),
      },
      orderBy: [{ workDate: 'asc' }],
      include: {
        employment: { select: { id: true, codeEmp: true, person: personSelect } },
      },
    });
  },

  /** Nhân sự nhập / sửa công một ngày. */
  async upsertRecord(input: UpsertRecordInput) {
    const emp = await prisma.employment.findFirst({
      where: { id: input.employmentId, isDelete: false },
    });
    if (!emp) throw new NotFoundError('Không tìm thấy hợp đồng lao động');
    const data = {
      status: input.status,
      checkIn: input.checkIn ?? null,
      checkOut: input.checkOut ?? null,
      note: input.note ?? null,
      source: 'MANUAL',
    };
    return prisma.attendanceRecord.upsert({
      where: {
        employmentId_workDate: {
          employmentId: input.employmentId,
          workDate: input.workDate,
        },
      },
      update: data,
      create: { employmentId: input.employmentId, workDate: input.workDate, ...data },
    });
  },

  async deleteRecord(id: string) {
    const row = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Không tìm thấy bản ghi chấm công');
    await prisma.attendanceRecord.delete({ where: { id } });
  },

  // ---------- Bảng công tháng ----------
  /**
   * Bảng công của các nhân viên còn làm việc trong tháng (hoặc một người).
   * Gộp bản ghi chấm công với đơn nghỉ đã duyệt.
   */
  async timesheet(month: string, employmentId?: string) {
    const { start, end } = monthRange(month);
    const employments = await prisma.employment.findMany({
      where: {
        isDelete: false,
        dateHire: { lte: end },
        OR: [{ dateTerminate: null }, { dateTerminate: { gte: start } }],
        ...(employmentId ? { id: employmentId } : {}),
      },
      orderBy: { codeEmp: 'asc' },
      include: {
        person: personSelect,
        attendanceRecords: {
          where: { workDate: { gte: start, lte: end } },
          select: { workDate: true, status: true },
        },
        overtimeRequests: {
          where: { status: 'APPROVED', workDate: { gte: start, lte: end } },
          select: { workDate: true, hours: true },
        },
        leaveRequests: {
          where: { status: 'APPROVED', fromDate: { lte: end }, toDate: { gte: start } },
          select: {
            fromDate: true,
            toDate: true,
            isHalfDay: true,
            leaveType: { select: { isPaid: true } },
          },
        },
      },
    });

    const holidays = await holidaySet(start, end);
    return {
      month,
      holidays: [...holidays],
      rows: employments.map((e) => ({
        employmentId: e.id,
        codeEmp: e.codeEmp,
        person: e.person,
        // Chỉ tính trong thời gian còn làm việc: vào giữa tháng / nghỉ giữa tháng.
        ...summarizeMonth(
          e.dateHire > start ? e.dateHire : start,
          e.dateTerminate && e.dateTerminate < end ? e.dateTerminate : end,
          e.attendanceRecords,
          e.leaveRequests.map((l) => ({
            fromDate: l.fromDate,
            toDate: l.toDate,
            isHalfDay: l.isHalfDay,
            isPaid: l.leaveType.isPaid,
          })),
          holidays,
          e.overtimeRequests.map((o) => ({ workDate: o.workDate, hours: Number(o.hours) })),
        ),
      })),
    };
  },
};
