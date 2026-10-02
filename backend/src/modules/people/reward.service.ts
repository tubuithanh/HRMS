import Decimal from 'decimal.js';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { todayDate } from '../../common/utils/dates';
import { notify } from '../notification/notification.service';
import { DISCIPLINE_FORMS, disciplineExpiry, REWARD_FORMS } from './people.logic';

export const rewardSchema = z
  .object({
    employmentIds: z.array(z.string().uuid()).min(1).max(500),
    kind: z.enum(['REWARD', 'DISCIPLINE']),
    form: z.string(),
    decisionNo: z.string().trim().max(50).optional(),
    decisionDate: z.coerce.date(),
    effectiveDate: z.coerce.date(),
    reason: z.string().trim().min(3).max(1000),
    /** Khen thưởng: tiền thưởng. Kỷ luật: tiền bồi thường thiệt hại (Điều 129), không phải tiền phạt. */
    amount: z.number().nonnegative().optional(),
  })
  .superRefine((v, ctx) => {
    const forms = v.kind === 'REWARD' ? REWARD_FORMS : DISCIPLINE_FORMS;
    if (!(v.form in forms)) ctx.addIssue({ code: 'custom', path: ['form'], message: 'Hình thức không hợp lệ' });
    if (v.kind === 'REWARD' && v.form === 'CASH' && !(v.amount && v.amount > 0)) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Thưởng tiền cần số tiền' });
    }
    if (v.effectiveDate < v.decisionDate) ctx.addIssue({ code: 'custom', path: ['effectiveDate'], message: 'Ngày hiệu lực không trước ngày quyết định' });
  });

const PAY_ELEMENT: Record<'REWARD' | 'DISCIPLINE', string> = { REWARD: 'THUONG', DISCIPLINE: 'BOI_THUONG' };

/** Kỳ lương chưa khoá chứa ngày hiệu lực (để đưa tiền thưởng / bồi thường vào lương). */
async function openPeriodFor(date: Date) {
  return prisma.payPeriod.findFirst({
    where: { dateStart: { lte: date }, dateEnd: { gte: date }, status: { notIn: ['LOCKED', 'PAID', 'CANCELLED'] }, periodType: 'REGULAR' },
  });
}

const include = {
  employment: { select: { id: true, codeEmp: true, person: { select: { id: true, fullName: true } } } },
} as const;

export const rewardService = {
  list(filter: { employmentId?: string; kind?: 'REWARD' | 'DISCIPLINE'; year?: number }) {
    return prisma.rewardDiscipline.findMany({
      where: {
        ...(filter.employmentId ? { employmentId: filter.employmentId } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.year ? { decisionDate: { gte: new Date(Date.UTC(filter.year, 0, 1)), lte: new Date(Date.UTC(filter.year, 11, 31)) } } : {}),
      },
      include,
      orderBy: [{ decisionDate: 'desc' }, { createdAt: 'desc' }],
    });
  },

  /** Một quyết định cho một hoặc nhiều người (khen thưởng tập thể). */
  async create(input: z.infer<typeof rewardSchema>, userId?: string) {
    const emps = await prisma.employment.findMany({ where: { id: { in: input.employmentIds }, isDelete: false }, select: { id: true, status: true } });
    if (emps.length !== input.employmentIds.length) throw new NotFoundError('Có nhân viên không tồn tại');
    const amount = input.amount && input.amount > 0 ? new Decimal(input.amount) : null;

    let periodNote: string | null = null;
    let element: { id: string } | null = null;
    let period: { id: string; code: string } | null = null;
    if (amount) {
      element = await prisma.payElement.findFirst({ where: { code: PAY_ELEMENT[input.kind] } });
      if (!element) throw new ValidationError(`Thiếu khoản lương ${PAY_ELEMENT[input.kind]} — chạy "npm run seed" để bổ sung danh mục`);
      period = await openPeriodFor(input.effectiveDate);
      if (!period) periodNote = 'Chưa có kỳ lương mở chứa ngày hiệu lực — tiền chưa được đưa vào lương, thêm khoản phát sinh thủ công.';
    }

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const employmentId of input.employmentIds) {
        let periodElementId: string | null = null;
        if (amount && element && period) {
          const pe = await tx.periodElement.create({
            data: {
              payPeriodId: period.id,
              employmentId,
              payElementId: element.id,
              amount: amount.toFixed(4),
              note: `${input.kind === 'REWARD' ? 'Khen thưởng' : 'Bồi thường thiệt hại'}${input.decisionNo ? ` QĐ ${input.decisionNo}` : ''}`,
            },
          });
          periodElementId = pe.id;
        }
        rows.push(
          await tx.rewardDiscipline.create({
            data: {
              employmentId,
              kind: input.kind,
              form: input.form,
              decisionNo: input.decisionNo ?? null,
              decisionDate: input.decisionDate,
              effectiveDate: input.effectiveDate,
              reason: input.reason,
              amount: amount ? amount.toFixed(4) : null,
              expiryDate: input.kind === 'DISCIPLINE' ? disciplineExpiry(input.form, input.effectiveDate) : null,
              periodElementId,
              createdById: userId ?? null,
            },
            include,
          }),
        );
      }
      return rows;
    });

    const label = input.kind === 'REWARD' ? REWARD_FORMS[input.form as keyof typeof REWARD_FORMS] : DISCIPLINE_FORMS[input.form as keyof typeof DISCIPLINE_FORMS];
    void notify.employment(input.employmentIds, {
      title: input.kind === 'REWARD' ? `Bạn được khen thưởng: ${label}` : `Quyết định kỷ luật: ${label}`,
      body: `${input.decisionNo ? `QĐ ${input.decisionNo} — ` : ''}${input.reason}`,
      link: '/me',
      email: true,
    });
    return {
      items: created,
      payPeriod: period?.code ?? null,
      warnings: [
        ...(periodNote ? [periodNote] : []),
        ...(input.kind === 'DISCIPLINE' && input.form === 'DISMISS' ? ['Sa thải: dùng chức năng "Cho nghỉ việc" (lý do Sa thải) để kết thúc hợp đồng.'] : []),
      ],
    };
  },

  /** Xoá quyết định; khoản tiền trong kỳ lương chưa khoá cũng bị xoá. */
  async remove(id: string) {
    const r = await prisma.rewardDiscipline.findUnique({ where: { id } });
    if (!r) throw new NotFoundError('Không tìm thấy quyết định');
    if (r.periodElementId) {
      const pe = await prisma.periodElement.findUnique({ where: { id: r.periodElementId }, include: { payPeriod: true } });
      if (pe && (pe.payPeriod.status === 'LOCKED' || pe.payPeriod.status === 'PAID')) {
        throw new ConflictError(`Tiền đã vào kỳ lương ${pe.payPeriod.code} (đã khoá) — không xoá được`);
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.rewardDiscipline.delete({ where: { id } });
      if (r.periodElementId) await tx.periodElement.deleteMany({ where: { id: r.periodElementId } });
    });
  },

  /** Kỷ luật còn hiệu lực (chưa đến ngày xoá) của một người. */
  async activeDisciplines(employmentId: string) {
    const today = todayDate();
    return prisma.rewardDiscipline.findMany({
      where: { employmentId, kind: 'DISCIPLINE', OR: [{ expiryDate: null }, { expiryDate: { gt: today } }] },
      orderBy: { effectiveDate: 'desc' },
    });
  },
};
