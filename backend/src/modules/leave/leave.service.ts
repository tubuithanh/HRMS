import { getSettings } from '../settings/settings.service';
import Decimal from 'decimal.js';
import { LeaveStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/AppError';
import { ForbiddenError } from '../../common/middleware/auth';
import { todayDate, yearRange } from '../../common/utils/dates';
import { AuthUser } from '../auth/token';
import { holidaySet } from '../overtime/overtime.service';
import { events, leaveSummary } from '../notification/events';
import { initialApproval } from '../approval/approval.service';
import { calcLeaveDays } from './leave.logic';
import { annualEntitlement, availableDays, Usage } from './entitlement.logic';
import {
  CreateLeaveTypeInput,
  SelfLeaveRequestInput,
  UpdateLeaveTypeInput,
} from './leave.schema';

const requestInclude = {
  leaveType: { select: { id: true, code: true, name: true, isPaid: true } },
  employment: {
    select: {
      id: true,
      codeEmp: true,
      person: { select: { id: true, personCode: true, fullName: true } },
    },
  },
  reviewedBy: { select: { id: true, username: true } },
  approverEmployment: { select: { id: true, codeEmp: true, person: { select: { fullName: true } } } },
} satisfies Prisma.LeaveRequestInclude;

/** Đơn đang giữ ngày nghỉ (chưa bị từ chối / huỷ). */
const ACTIVE_STATUSES: LeaveStatus[] = ['PENDING', 'APPROVED'];

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type LeaveTypeRow = {
  id: string;
  daysPerYear: unknown;
  seniorityBonus: boolean;
  carryOverMaxDays: unknown;
  carryOverUntilMonth: number | null;
};
type EmploymentRow = { dateHire: Date; dateSeniority: Date | null; dateTerminate: Date | null };

/**
 * Số ngày được hưởng trong năm + phép tồn năm trước.
 * until: ngày chốt (khi quyết toán nghỉ việc) — tính theo tỷ lệ tháng làm việc đến ngày đó.
 */
async function entitlementOf(employmentId: string, emp: EmploymentRow, t: LeaveTypeRow, year: number, until?: Date | null) {
  const daysPerYear = num(t.daysPerYear);
  if (daysPerYear === null) return null;
  const rules = (await getSettings()).laborRules;
  const calc = (y: number, u?: Date | null) =>
    annualEntitlement({
      daysPerYear,
      seniorityBonus: t.seniorityBonus,
      dateSeniority: emp.dateSeniority ?? emp.dateHire,
      dateHire: emp.dateHire,
      until: u ?? emp.dateTerminate,
      year: y,
      seniorityStepYears: rules.seniorityStepYears,
      seniorityBonusDays: rules.seniorityBonusDays,
    });
  const entitled = emp.dateHire.getUTCFullYear() > year ? 0 : calc(year, until);

  // Phép tồn: phần năm trước chưa dùng (đã duyệt), tối đa carryOverMaxDays.
  let carry = 0;
  let carryExpiry: Date | null = null;
  const max = num(t.carryOverMaxDays);
  if (max !== null && max > 0 && t.carryOverUntilMonth && emp.dateHire.getUTCFullYear() < year) {
    const prev = yearRange(year - 1);
    const usedPrev = await sumDays({ employmentId, leaveTypeId: t.id, status: 'APPROVED', fromDate: { gte: prev.start, lte: prev.end } });
    carry = Math.max(0, Math.min(max, calc(year - 1) - usedPrev.toNumber()));
    carryExpiry = new Date(Date.UTC(year, t.carryOverUntilMonth, 0));
  }
  return { entitled, carry, carryExpiry };
}

async function usagesOf(employmentId: string, leaveTypeId: string, year: number, excludeId?: string): Promise<{ usages: Usage[]; used: number; pending: number }> {
  const { start, end } = yearRange(year);
  const rows = await prisma.leaveRequest.findMany({
    where: { employmentId, leaveTypeId, status: { in: ACTIVE_STATUSES }, fromDate: { gte: start, lte: end }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { fromDate: true, days: true, status: true },
  });
  return {
    usages: rows.map((r) => ({ fromDate: r.fromDate, days: Number(r.days) })),
    used: rows.filter((r) => r.status === 'APPROVED').reduce((s, r) => s + Number(r.days), 0),
    pending: rows.filter((r) => r.status === 'PENDING').reduce((s, r) => s + Number(r.days), 0),
  };
}

async function sumDays(where: Prisma.LeaveRequestWhereInput): Promise<Decimal> {
  const agg = await prisma.leaveRequest.aggregate({ where, _sum: { days: true } });
  return new Decimal(String(agg._sum.days ?? 0));
}

export const leaveService = {
  // ---------- Loại nghỉ ----------
  listTypes(activeOnly = false) {
    return prisma.leaveType.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { code: 'asc' },
    });
  },

  async createType(input: CreateLeaveTypeInput) {
    const dup = await prisma.leaveType.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictError('Mã loại nghỉ đã tồn tại');
    return prisma.leaveType.create({
      data: {
        ...input,
        daysPerYear:
          input.daysPerYear === undefined || input.daysPerYear === null
            ? null
            : String(input.daysPerYear),
      },
    });
  },

  async updateType(id: string, input: UpdateLeaveTypeInput) {
    const type = await prisma.leaveType.findUnique({ where: { id } });
    if (!type) throw new NotFoundError('Không tìm thấy loại nghỉ');
    return prisma.leaveType.update({
      where: { id },
      data: {
        ...input,
        daysPerYear:
          input.daysPerYear === undefined
            ? undefined
            : input.daysPerYear === null
              ? null
              : String(input.daysPerYear),
      },
    });
  },

  // ---------- Đơn nghỉ ----------
  list(filter: {
    status?: LeaveStatus;
    employmentId?: string;
    from?: Date;
    to?: Date;
  }) {
    return prisma.leaveRequest.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.employmentId ? { employmentId: filter.employmentId } : {}),
        // Đơn giao với khoảng [from, to]
        ...(filter.from ? { toDate: { gte: filter.from } } : {}),
        ...(filter.to ? { fromDate: { lte: filter.to } } : {}),
      },
      orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }],
      include: requestInclude,
    });
  },

  /** viaHr: nhân sự tạo hộ → bỏ qua bước quản lý duyệt. */
  async create(employmentId: string, input: SelfLeaveRequestInput, viaHr = false) {
    const employment = await prisma.employment.findFirst({
      where: { id: employmentId, isDelete: false },
    });
    if (!employment) throw new NotFoundError('Không tìm thấy hợp đồng lao động');
    if (employment.status === 'TERMINATED') {
      throw new AppError('Nhân viên đã nghỉ việc', 400, 'EMPLOYMENT_TERMINATED');
    }
    if (input.fromDate < employment.dateHire) {
      throw new ValidationError('Không thể xin nghỉ trước ngày vào làm');
    }
    if (employment.dateTerminate && input.toDate > employment.dateTerminate) {
      throw new ValidationError('Không thể xin nghỉ sau ngày nghỉ việc');
    }

    const type = await prisma.leaveType.findUnique({
      where: { id: input.leaveTypeId },
    });
    if (!type || !type.isActive) throw new NotFoundError('Loại nghỉ không hợp lệ');

    if (input.fromDate.getUTCFullYear() !== input.toDate.getUTCFullYear()) {
      throw new ValidationError(
        'Đơn nghỉ không được kéo dài sang năm sau, hãy tách thành hai đơn',
      );
    }

    let days: Decimal;
    try {
      const holidays = await holidaySet(input.fromDate, input.toDate);
      days = calcLeaveDays(input.fromDate, input.toDate, input.isHalfDay, holidays);
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }

    // Không trùng với đơn khác đang chờ / đã duyệt — trừ 2 đơn nửa ngày khác buổi trong cùng một ngày.
    const halfDayPart = input.isHalfDay ? (input.halfDayPart ?? 'MORNING') : null;
    const overlaps = await prisma.leaveRequest.findMany({
      where: {
        employmentId,
        status: { in: ACTIVE_STATUSES },
        fromDate: { lte: input.toDate },
        toDate: { gte: input.fromDate },
      },
    });
    const conflict = overlaps.find(
      (o) => !(halfDayPart && o.isHalfDay && o.halfDayPart && o.halfDayPart !== halfDayPart && o.fromDate.getTime() === input.fromDate.getTime()),
    );
    if (conflict) {
      throw new ConflictError(
        conflict.isHalfDay && halfDayPart ? 'Buổi này đã có đơn nghỉ nửa ngày' : 'Trùng thời gian với một đơn nghỉ khác',
      );
    }

    // Số ngày còn được nghỉ tại ngày bắt đầu nghỉ (tính thâm niên, tỷ lệ tháng, phép tồn còn hạn).
    const year = input.fromDate.getUTCFullYear();
    const ent = await entitlementOf(employmentId, employment, type, year);
    if (ent) {
      const { usages } = await usagesOf(employmentId, type.id, year);
      const left = new Decimal(availableDays(ent.entitled, ent.carry, ent.carryExpiry, usages, input.fromDate));
      if (days.gt(left)) {
        throw new AppError(
          `Không đủ ngày ${type.name}: còn ${left.toString()} ngày, đơn cần ${days.toString()} ngày`,
          400,
          'INSUFFICIENT_BALANCE',
        );
      }
    }

    const approval = await initialApproval(employmentId, viaHr);
    const created = await prisma.leaveRequest.create({
      data: {
        ...approval,
        employmentId,
        leaveTypeId: type.id,
        fromDate: input.fromDate,
        toDate: input.toDate,
        isHalfDay: input.isHalfDay ?? false,
        halfDayPart,
        days: days.toString(),
        reason: input.reason,
      },
      include: requestInclude,
    });
    void events.requestSubmitted('leave', { ...created, summary: `${type.name} ${leaveSummary(created)}` });
    return created;
  },

  async review(id: string, reviewer: AuthUser, approve: boolean, note?: string) {
    const req = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employment: { select: { personId: true } } },
    });
    if (!req) throw new NotFoundError('Không tìm thấy đơn nghỉ');
    if (req.status !== 'PENDING') {
      throw new ConflictError('Chỉ duyệt được đơn đang chờ duyệt');
    }
    // Không tự duyệt đơn của mình (trừ ADMIN).
    if (reviewer.role !== 'ADMIN' && reviewer.personId === req.employment.personId) {
      throw new ForbiddenError('Không thể tự duyệt đơn nghỉ của chính mình');
    }
    // Không duyệt đơn có ngày nghỉ rơi vào kỳ lương đã khoá (bảng công kỳ đó đã chốt).
    const locked = approve
      ? await prisma.payPeriod.findFirst({
          where: { status: { in: ['LOCKED', 'PAID'] }, dateStart: { lte: req.toDate }, dateEnd: { gte: req.fromDate } },
        })
      : null;
    if (locked) {
      throw new AppError(`Kỳ lương ${locked.code} đã khoá, không thể duyệt đơn nghỉ có ngày thuộc kỳ này`, 409, 'PERIOD_LOCKED');
    }
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        reviewNote: note,
      },
      include: requestInclude,
    });
    void events.finalReviewed('leave', { employmentId: updated.employmentId, summary: `${updated.leaveType.name} ${leaveSummary(updated)}` }, approve, note);
    return updated;
  },

  /**
   * Huỷ đơn. Đơn chờ duyệt huỷ được bất cứ lúc nào; đơn đã duyệt chỉ huỷ
   * được khi chưa đến ngày nghỉ. ownEmploymentId: nhân viên chỉ huỷ đơn của mình.
   */
  async cancel(id: string, ownEmploymentId?: string) {
    const req = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!req || (ownEmploymentId && req.employmentId !== ownEmploymentId)) {
      throw new NotFoundError('Không tìm thấy đơn nghỉ');
    }
    const cancellable =
      req.status === 'PENDING' ||
      (req.status === 'APPROVED' && req.fromDate > todayDate());
    if (!cancellable) throw new ConflictError('Đơn này không thể huỷ');
    return prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: requestInclude,
    });
  },

  /**
   * Số ngày được hưởng / phép tồn / đã dùng / đang chờ / còn lại theo từng loại nghỉ.
   * until: ngày chốt khi quyết toán nghỉ việc (được hưởng tính theo tỷ lệ đến ngày đó).
   */
  async balances(employmentId: string, year: number, until?: Date) {
    const emp = await prisma.employment.findUnique({ where: { id: employmentId } });
    if (!emp) throw new NotFoundError('Không tìm thấy hợp đồng lao động');
    const types = await prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    const at = until ?? todayDate();
    return Promise.all(
      types.map(async (t) => {
        const ent = await entitlementOf(employmentId, emp, t, year, until);
        const { usages, used, pending } = await usagesOf(employmentId, t.id, year);
        const remaining = ent ? Math.max(0, availableDays(ent.entitled, ent.carry, ent.carryExpiry, usages, at)) : null;
        return {
          leaveType: { id: t.id, code: t.code, name: t.name, isPaid: t.isPaid },
          year,
          entitled: ent ? String(ent.entitled) : null,
          carriedOver: ent && ent.carry > 0 ? String(ent.carry) : null,
          carryExpiry: ent?.carryExpiry ?? null,
          used: String(used),
          pending: String(pending),
          remaining: remaining === null ? null : String(remaining),
        };
      }),
    );
  },
};
