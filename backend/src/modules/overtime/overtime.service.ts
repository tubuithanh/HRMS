import Decimal from 'decimal.js';
import { OvertimeStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { ForbiddenError } from '../../common/middleware/auth';
import { formatDate, monthRange, todayDate } from '../../common/utils/dates';
import { AuthUser } from '../auth/token';
import { multiplierOf, overtimeTypeOf, validateOvertime } from './overtime.logic';
import { events, overtimeSummary } from '../notification/events';
import { initialApproval } from '../approval/approval.service';

// ---------- Schema ----------
export const holidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().trim().min(1).max(100),
});

export const selfOvertimeSchema = z.object({
  workDate: z.coerce.date(),
  hours: z.number().positive().max(12),
  isNight: z.boolean().optional(),
  reason: z.string().trim().min(1, 'Cần ghi nội dung công việc').max(500),
});

export const overtimeSchema = selfOvertimeSchema.extend({ employmentId: z.string().uuid() });

export const reviewOvertimeSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

export type SelfOvertimeInput = z.infer<typeof selfOvertimeSchema>;

const include = {
  employment: {
    select: { id: true, codeEmp: true, person: { select: { id: true, personCode: true, fullName: true } } },
  },
  reviewedBy: { select: { username: true } },
  approverEmployment: { select: { id: true, codeEmp: true, person: { select: { fullName: true } } } },
} satisfies Prisma.OvertimeRequestInclude;

const ACTIVE: OvertimeStatus[] = ['PENDING', 'APPROVED'];

async function sumHours(where: Prisma.OvertimeRequestWhereInput) {
  const agg = await prisma.overtimeRequest.aggregate({ where, _sum: { hours: true } });
  return new Decimal(String(agg._sum.hours ?? 0));
}

/** Tập ngày lễ (YYYY-MM-DD) trong khoảng. */
export async function holidaySet(from: Date, to: Date): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true } });
  return new Set(rows.map((r) => formatDate(r.date)));
}

export const overtimeService = {
  // ---------- Ngày lễ ----------
  listHolidays(year?: number) {
    return prisma.holiday.findMany({
      where: year ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } } : {},
      orderBy: { date: 'asc' },
    });
  },

  async addHoliday(date: Date, name: string) {
    const dup = await prisma.holiday.findUnique({ where: { date } });
    if (dup) throw new ConflictError('Ngày này đã có trong danh sách nghỉ lễ');
    return prisma.holiday.create({ data: { date, name } });
  },

  async removeHoliday(id: string) {
    const row = await prisma.holiday.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Không tìm thấy ngày lễ');
    await prisma.holiday.delete({ where: { id } });
  },

  // ---------- Đơn làm thêm giờ ----------
  list(filter: { status?: OvertimeStatus; employmentId?: string; month?: string }) {
    const range = filter.month ? monthRange(filter.month) : null;
    return prisma.overtimeRequest.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.employmentId ? { employmentId: filter.employmentId } : {}),
        ...(range ? { workDate: { gte: range.start, lte: range.end } } : {}),
      },
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      include,
    });
  },

  /** viaHr: nhân sự tạo hộ → bỏ qua bước quản lý duyệt. */
  async create(employmentId: string, input: SelfOvertimeInput, viaHr = false) {
    const emp = await prisma.employment.findFirst({ where: { id: employmentId, isDelete: false } });
    if (!emp) throw new NotFoundError('Không tìm thấy hợp đồng lao động');
    if (emp.status === 'TERMINATED' || input.workDate < emp.dateHire || (emp.dateTerminate && input.workDate > emp.dateTerminate)) {
      throw new ValidationError('Ngày làm thêm nằm ngoài thời gian làm việc');
    }
    // Chỉ đăng ký trong khoảng 30 ngày trước đến 30 ngày sau hôm nay.
    const today = todayDate();
    const diff = (input.workDate.getTime() - today.getTime()) / 86_400_000;
    if (diff < -30 || diff > 30) {
      throw new ValidationError('Chỉ đăng ký làm thêm trong vòng 30 ngày trước hoặc sau hôm nay');
    }

    const holidays = await holidaySet(input.workDate, input.workDate);
    const otType = overtimeTypeOf(input.workDate, holidays);
    const { start, end } = monthRange(formatDate(input.workDate).slice(0, 7));
    const [usedInDay, usedInMonth] = await Promise.all([
      sumHours({ employmentId, status: { in: ACTIVE }, workDate: input.workDate }),
      sumHours({ employmentId, status: { in: ACTIVE }, workDate: { gte: start, lte: end } }),
    ]);
    const error = validateOvertime(input.hours, otType, usedInDay, usedInMonth);
    if (error) throw new ValidationError(error);

    const approval = await initialApproval(employmentId, viaHr);
    const created = await prisma.overtimeRequest.create({
      data: {
        ...approval,
        employmentId,
        workDate: input.workDate,
        hours: String(input.hours),
        otType,
        isNight: input.isNight ?? false,
        multiplier: multiplierOf(otType, input.isNight ?? false).toString(),
        reason: input.reason,
      },
      include,
    });
    void events.requestSubmitted('overtime', { ...created, summary: overtimeSummary(created) });
    return created;
  },

  async review(id: string, reviewer: AuthUser, approve: boolean, note?: string) {
    const req = await prisma.overtimeRequest.findUnique({
      where: { id },
      include: { employment: { select: { personId: true } } },
    });
    if (!req) throw new NotFoundError('Không tìm thấy đơn làm thêm giờ');
    if (req.status !== 'PENDING') throw new ConflictError('Chỉ duyệt được đơn đang chờ duyệt');
    if (reviewer.role !== 'ADMIN' && reviewer.personId === req.employment.personId) {
      throw new ForbiddenError('Không thể tự duyệt đơn của chính mình');
    }
    // Không duyệt vào kỳ lương đã khoá.
    const locked = await prisma.payPeriod.findFirst({
      where: { status: { in: ['LOCKED', 'PAID'] }, dateStart: { lte: req.workDate }, dateEnd: { gte: req.workDate } },
    });
    if (locked && approve) {
      throw new AppError(`Kỳ lương ${locked.code} đã khoá, không thể duyệt làm thêm giờ của kỳ này`, 409, 'PERIOD_LOCKED');
    }
    const updated = await prisma.overtimeRequest.update({
      where: { id },
      data: { status: approve ? 'APPROVED' : 'REJECTED', reviewedById: reviewer.id, reviewedAt: new Date(), reviewNote: note },
      include,
    });
    void events.finalReviewed('overtime', { employmentId: updated.employmentId, summary: overtimeSummary(updated) }, approve, note);
    return updated;
  },

  async cancel(id: string, ownEmploymentId?: string) {
    const req = await prisma.overtimeRequest.findUnique({ where: { id } });
    if (!req || (ownEmploymentId && req.employmentId !== ownEmploymentId)) {
      throw new NotFoundError('Không tìm thấy đơn làm thêm giờ');
    }
    if (req.status !== 'PENDING') throw new ConflictError('Chỉ huỷ được đơn đang chờ duyệt');
    return prisma.overtimeRequest.update({ where: { id }, data: { status: 'CANCELLED' }, include });
  },
};
