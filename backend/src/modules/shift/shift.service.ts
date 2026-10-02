import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { addDays, formatDate, isWeekend, monthRange } from '../../common/utils/dates';
import { pickEffective, previousDay } from '../../common/utils/effectiveDating';
import { rotationShiftFor, ShiftTimes } from './shift.logic';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:mm');

export const shiftSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  startTime: hhmm,
  endTime: hhmm,
  breakMinutes: z.number().int().min(0).max(240).default(60),
  lateGraceMinutes: z.number().int().min(0).max(120).default(0),
  color: z.string().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const assignSchema = z.object({
  employmentIds: z.array(z.string().uuid()).min(1),
  shiftId: z.string().uuid(),
  effectiveDate: z.coerce.date(),
});

export const rosterSetSchema = z.object({
  cells: z
    .array(
      z.object({
        employmentId: z.string().uuid(),
        workDate: z.coerce.date(),
        shiftId: z.string().uuid().nullable(), // null = ngày nghỉ
      }),
    )
    .min(1)
    .max(5000),
});

export const rotateSchema = z.object({
  employmentIds: z.array(z.string().uuid()).min(1),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  pattern: z.array(z.string().uuid().nullable()).min(1).max(14), // null = nghỉ
  daysPerStep: z.number().int().min(1).max(31),
  /** Lệch chu kỳ giữa các người: người thứ i bắt đầu ở bước i × staggerSteps. */
  staggerSteps: z.number().int().min(0).max(14).default(0),
});

export interface ResolvedShift extends ShiftTimes {
  id: string;
  code: string;
  name: string;
}

export const shiftService = {
  list(includeInactive = false) {
    return prisma.shift.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ startTime: 'asc' }, { code: 'asc' }],
    });
  },

  async create(input: z.infer<typeof shiftSchema>) {
    if (await prisma.shift.findUnique({ where: { code: input.code } })) {
      throw new ConflictError(`Mã ca ${input.code} đã tồn tại`);
    }
    return prisma.shift.create({ data: input });
  },

  async update(id: string, input: Partial<z.infer<typeof shiftSchema>>) {
    await this.get(id);
    return prisma.shift.update({ where: { id }, data: input });
  },

  async get(id: string) {
    const s = await prisma.shift.findUnique({ where: { id } });
    if (!s) throw new NotFoundError('Không tìm thấy ca');
    return s;
  },

  /** Gán ca mặc định từ ngày hiệu lực; dòng cũ tự kết thúc vào ngày trước đó. */
  async assign(input: z.infer<typeof assignSchema>) {
    await this.get(input.shiftId);
    return prisma.$transaction(async (tx) => {
      for (const employmentId of input.employmentIds) {
        await tx.shiftAssignment.deleteMany({ where: { employmentId, effectiveDate: { gte: input.effectiveDate } } });
        await tx.shiftAssignment.updateMany({
          where: { employmentId, effectiveDate: { lt: input.effectiveDate }, OR: [{ endDate: null }, { endDate: { gte: input.effectiveDate } }] },
          data: { endDate: previousDay(input.effectiveDate) },
        });
        await tx.shiftAssignment.create({ data: { employmentId, shiftId: input.shiftId, effectiveDate: input.effectiveDate } });
      }
      return { count: input.employmentIds.length };
    });
  },

  /** Ca của một nhân viên vào một ngày: lịch xếp ca ưu tiên, sau đó ca mặc định (thứ 2 – thứ 6). undefined = không có ca (giờ hành chính). */
  async resolve(employmentId: string, workDate: Date): Promise<ResolvedShift | null | undefined> {
    const roster = await prisma.shiftRoster.findUnique({
      where: { employmentId_workDate: { employmentId, workDate } },
      include: { shift: true },
    });
    if (roster) return roster.shift; // null = ngày nghỉ theo lịch
    if (isWeekend(workDate)) return undefined;
    const assignments = await prisma.shiftAssignment.findMany({ where: { employmentId }, include: { shift: true } });
    return pickEffective(assignments, workDate)?.shift;
  },

  /** Lịch ca một tháng cho nhiều người: { employmentId: { 'YYYY-MM-DD': shiftId | null } }. */
  async roster(month: string, orgId?: string) {
    const { start, end } = monthRange(month);
    const employments = await prisma.employment.findMany({
      where: {
        isDelete: false,
        dateHire: { lte: end },
        OR: [{ dateTerminate: null }, { dateTerminate: { gte: start } }],
        ...(orgId
          ? { assignments: { some: { orgStructureId: orgId, effectiveDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] } } }
          : {}),
      },
      select: {
        id: true,
        codeEmp: true,
        person: { select: { fullName: true } },
        shiftAssignments: { select: { shiftId: true, effectiveDate: true, endDate: true } },
        shiftRosters: { where: { workDate: { gte: start, lte: end } }, select: { workDate: true, shiftId: true } },
      },
      orderBy: { codeEmp: 'asc' },
    });
    const days: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(formatDate(d));
    return {
      month,
      days,
      rows: employments.map((e) => {
        const cells: Record<string, { shiftId: string | null; source: 'ROSTER' | 'DEFAULT' } | undefined> = {};
        const byDay = new Map(e.shiftRosters.map((r) => [formatDate(r.workDate), r.shiftId]));
        for (let d = start; d <= end; d = addDays(d, 1)) {
          const key = formatDate(d);
          if (byDay.has(key)) cells[key] = { shiftId: byDay.get(key)!, source: 'ROSTER' };
          else if (!isWeekend(d)) {
            // Ca mặc định chỉ áp ngày thường; cuối tuần muốn đi làm thì xếp lịch riêng.
            const a = pickEffective(e.shiftAssignments, d);
            if (a) cells[key] = { shiftId: a.shiftId, source: 'DEFAULT' };
          }
        }
        return { employmentId: e.id, codeEmp: e.codeEmp, fullName: e.person.fullName, cells };
      }),
    };
  },

  async setRoster(input: z.infer<typeof rosterSetSchema>) {
    await prisma.$transaction(
      input.cells.map((c) =>
        prisma.shiftRoster.upsert({
          where: { employmentId_workDate: { employmentId: c.employmentId, workDate: c.workDate } },
          update: { shiftId: c.shiftId },
          create: c,
        }),
      ),
    );
    return { count: input.cells.length };
  },

  /** Bỏ lịch xếp ca của các ngày → quay về ca mặc định. */
  async clearRoster(employmentIds: string[], fromDate: Date, toDate: Date) {
    const r = await prisma.shiftRoster.deleteMany({
      where: { employmentId: { in: employmentIds }, workDate: { gte: fromDate, lte: toDate } },
    });
    return { count: r.count };
  },

  /** Xoay ca: sinh lịch từng ngày theo chu kỳ, ghi đè lịch cũ trong khoảng. */
  async rotate(input: z.infer<typeof rotateSchema>) {
    if (input.toDate < input.fromDate) throw new ValidationError('Đến ngày phải sau từ ngày');
    const days = Math.round((input.toDate.getTime() - input.fromDate.getTime()) / 86_400_000) + 1;
    if (days > 93) throw new ValidationError('Mỗi lần xếp tối đa 93 ngày');
    const ids = input.pattern.filter((x): x is string => !!x);
    const found = await prisma.shift.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) throw new ValidationError('Chu kỳ có ca không tồn tại');

    const cells: z.infer<typeof rosterSetSchema>['cells'] = [];
    input.employmentIds.forEach((employmentId, i) => {
      for (let k = 0; k < days; k++) {
        cells.push({
          employmentId,
          workDate: addDays(input.fromDate, k),
          shiftId: rotationShiftFor(input.pattern, input.daysPerStep, k, i * input.staggerSteps),
        });
      }
    });
    await prisma.$transaction([
      prisma.shiftRoster.deleteMany({
        where: { employmentId: { in: input.employmentIds }, workDate: { gte: input.fromDate, lte: input.toDate } },
      }),
      prisma.shiftRoster.createMany({ data: cells }),
    ]);
    return { count: cells.length };
  },
};
