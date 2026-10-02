import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { ForbiddenError } from '../../common/middleware/auth';
import { AuthUser } from '../auth/token';
import { loadManagerMap } from '../approval/approval.service';
import { notify } from '../notification/notification.service';
import { Goal, ratingOf, validateGoalTemplate, weightedScore } from './people.logic';

export const cycleSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    goalTemplate: z.array(z.object({ title: z.string().trim().min(1).max(200), weight: z.number().positive() })),
    /** Bỏ trống = mọi nhân viên đang làm việc. */
    employmentIds: z.array(z.string().uuid()).optional(),
  })
  .refine((v) => v.toDate >= v.fromDate, { message: 'Đến ngày phải sau từ ngày', path: ['toDate'] });

const score = z.number().min(1).max(5).multipleOf(0.5);
export const selfSchema = z.object({
  goals: z.array(z.object({ selfScore: score.nullable(), comment: z.string().max(1000).nullable().optional() })),
  selfComment: z.string().max(2000).nullable().optional(),
  submit: z.boolean().default(false),
});
export const managerSchema = z.object({
  goals: z.array(z.object({ managerScore: score.nullable() })),
  managerComment: z.string().max(2000).nullable().optional(),
  submit: z.boolean().default(false),
});

const empSelect = { select: { id: true, codeEmp: true, person: { select: { id: true, fullName: true } } } } as const;
const reviewInclude = { employment: empSelect, reviewer: empSelect, cycle: { select: { id: true, name: true, fromDate: true, toDate: true, dueDate: true, status: true } } } as const;

async function myEmploymentIds(user: AuthUser) {
  if (!user.personId) return [];
  return (await prisma.employment.findMany({ where: { personId: user.personId, isDelete: false }, select: { id: true } })).map((e) => e.id);
}
const isStaff = (u: AuthUser) => u.role === 'ADMIN' || u.role === 'HR';

export const reviewService = {
  // ---------- Kỳ đánh giá (nhân sự) ----------
  async listCycles() {
    const cycles = await prisma.reviewCycle.findMany({ orderBy: { fromDate: 'desc' } });
    const counts = await prisma.performanceReview.groupBy({ by: ['cycleId', 'status'], _count: true });
    return cycles.map((c) => ({
      ...c,
      counts: Object.fromEntries(counts.filter((x) => x.cycleId === c.id).map((x) => [x.status, x._count])) as Record<string, number>,
    }));
  },

  async getCycle(id: string) {
    const c = await prisma.reviewCycle.findUnique({
      where: { id },
      include: { reviews: { include: reviewInclude, orderBy: { employment: { codeEmp: 'asc' } } } },
    });
    if (!c) throw new NotFoundError('Không tìm thấy kỳ đánh giá');
    const done = c.reviews.filter((r) => r.rating);
    const dist = { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>;
    for (const r of done) dist[r.rating!]++;
    return { ...c, distribution: dist };
  },

  async createCycle(input: z.infer<typeof cycleSchema>) {
    const err = validateGoalTemplate(input.goalTemplate);
    if (err) throw new ValidationError(err);
    const emps = await prisma.employment.findMany({
      where: {
        isDelete: false,
        status: { in: ['ACTIVE', 'PROBATION'] },
        ...(input.employmentIds ? { id: { in: input.employmentIds } } : {}),
      },
      select: { id: true },
    });
    if (emps.length === 0) throw new ValidationError('Không có nhân viên nào để đánh giá');
    const managers = await loadManagerMap();
    const goals: Goal[] = input.goalTemplate.map((g) => ({ title: g.title, weight: g.weight, selfScore: null, managerScore: null, comment: null }));
    const cycle = await prisma.$transaction(async (tx) => {
      const c = await tx.reviewCycle.create({
        data: { name: input.name, fromDate: input.fromDate, toDate: input.toDate, dueDate: input.dueDate, goalTemplate: input.goalTemplate },
      });
      await tx.performanceReview.createMany({
        data: emps.map((e) => ({ cycleId: c.id, employmentId: e.id, reviewerEmploymentId: managers.get(e.id) ?? null, goals: goals as object[] })),
      });
      return c;
    });
    void notify.employment(emps.map((e) => e.id), {
      title: `Tự đánh giá: ${input.name}`,
      body: `Hạn hoàn thành ${input.dueDate.toISOString().slice(0, 10).split('-').reverse().join('/')}`,
      link: '/me/reviews',
      email: true,
    });
    return { ...cycle, reviewCount: emps.length };
  },

  async closeCycle(id: string, close: boolean) {
    await this.getCycle(id);
    return prisma.reviewCycle.update({ where: { id }, data: { status: close ? 'CLOSED' : 'OPEN' } });
  },

  async removeCycle(id: string) {
    const c = await this.getCycle(id);
    if (c.reviews.some((r) => r.status !== 'SELF')) throw new ConflictError('Kỳ đã có người nộp đánh giá — đóng kỳ thay vì xoá');
    await prisma.reviewCycle.delete({ where: { id } });
  },

  /** Mở lại phiếu về bước tự đánh giá (nhân sự). */
  async reopen(reviewId: string) {
    return prisma.performanceReview.update({ where: { id: reviewId }, data: { status: 'SELF', finalScore: null, rating: null, completedAt: null } });
  },

  // ---------- Phiếu đánh giá ----------
  async get(id: string, user: AuthUser) {
    const r = await prisma.performanceReview.findUnique({ where: { id }, include: reviewInclude });
    if (!r) throw new NotFoundError('Không tìm thấy phiếu đánh giá');
    const mine = await myEmploymentIds(user);
    const isSelf = mine.includes(r.employmentId);
    const isReviewer = !!r.reviewerEmploymentId && mine.includes(r.reviewerEmploymentId);
    if (!isSelf && !isReviewer && !isStaff(user)) throw new NotFoundError('Không tìm thấy phiếu đánh giá');
    // Nhân viên chưa xem được điểm quản lý cho tới khi hoàn tất. Nhân sự chỉ chấm thay người không có quản lý trực tiếp.
    const goals = (r.goals as unknown as Goal[]).map((g) => (isSelf && !isReviewer && !isStaff(user) && r.status !== 'DONE' ? { ...g, managerScore: null } : g));
    return { ...r, goals, canSelf: isSelf && r.status === 'SELF' && r.cycle.status === 'OPEN', canManage: (isReviewer || (isStaff(user) && !isSelf && !r.reviewerEmploymentId)) && r.status === 'MANAGER' && r.cycle.status === 'OPEN' };
  },

  /** Phiếu của tôi (được đánh giá) và phiếu tôi cần chấm (quản lý). */
  async mine(user: AuthUser) {
    const mine = await myEmploymentIds(user);
    const [own, toReview] = await Promise.all([
      prisma.performanceReview.findMany({ where: { employmentId: { in: mine } }, include: reviewInclude, orderBy: { createdAt: 'desc' } }),
      prisma.performanceReview.findMany({ where: { reviewerEmploymentId: { in: mine }, employmentId: { notIn: mine } }, include: reviewInclude, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
    ]);
    return { own: own.map((r) => ({ ...r, goals: undefined, finalScore: r.status === 'DONE' ? r.finalScore : null })), toReview: toReview.map((r) => ({ ...r, goals: undefined })) };
  },

  async saveSelf(id: string, user: AuthUser, input: z.infer<typeof selfSchema>) {
    const r = await this.get(id, user);
    if (!r.canSelf) throw new ConflictError('Phiếu không còn ở bước tự đánh giá');
    const goals = (r.goals as Goal[]).map((g, i) => ({ ...g, selfScore: input.goals[i]?.selfScore ?? null, comment: input.goals[i]?.comment ?? g.comment ?? null }));
    const selfScore = weightedScore(goals, 'selfScore');
    if (input.submit && selfScore === null) throw new ValidationError('Chấm đủ điểm cho mọi mục tiêu trước khi nộp');
    const updated = await prisma.performanceReview.update({
      where: { id },
      data: {
        goals: goals as object[],
        selfComment: input.selfComment ?? null,
        selfScore: selfScore === null ? null : String(selfScore),
        ...(input.submit ? { status: 'MANAGER', submittedAt: new Date() } : {}),
      },
    });
    if (input.submit) {
      const n = { title: `Chờ bạn đánh giá: ${r.employment.person.fullName}`, body: r.cycle.name, link: '/me/reviews', email: true };
      if (r.reviewerEmploymentId) void notify.employment(r.reviewerEmploymentId, n);
      else void notify.roles(['HR'], { ...n, link: `/reviews/${r.cycle.id}` });
    }
    return updated;
  },

  async saveManager(id: string, user: AuthUser, input: z.infer<typeof managerSchema>) {
    const r = await this.get(id, user);
    if (!r.canManage) throw new ForbiddenError('Bạn không chấm được phiếu này ở bước hiện tại');
    const goals = (r.goals as Goal[]).map((g, i) => ({ ...g, managerScore: input.goals[i]?.managerScore ?? null }));
    const final = weightedScore(goals, 'managerScore');
    if (input.submit && final === null) throw new ValidationError('Chấm đủ điểm cho mọi mục tiêu trước khi hoàn tất');
    const updated = await prisma.performanceReview.update({
      where: { id },
      data: {
        goals: goals as object[],
        managerComment: input.managerComment ?? null,
        ...(input.submit && final !== null ? { status: 'DONE', finalScore: String(final), rating: ratingOf(final), completedAt: new Date() } : {}),
      },
    });
    if (input.submit) void notify.employment(r.employmentId, { title: `Đã có kết quả đánh giá: ${r.cycle.name}`, body: `Xếp loại ${updated.rating}`, link: '/me/reviews' });
    return updated;
  },
};
