import Decimal from 'decimal.js';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/AppError';
import { notify } from '../notification/notification.service';
import { commitmentEnd, trainingRefund } from './people.logic';

export const courseSchema = z
  .object({
    code: z.string().trim().min(1).max(30),
    name: z.string().trim().min(1).max(200),
    provider: z.string().trim().max(200).nullable().optional(),
    location: z.string().trim().max(200).nullable().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    costPerPerson: z.number().nonnegative().default(0),
    commitmentMonths: z.number().int().min(0).max(120).default(0),
    status: z.enum(['PLANNED', 'ONGOING', 'DONE', 'CANCELLED']).default('PLANNED'),
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['endDate'] });

export const participantSchema = z.object({
  result: z.enum(['REGISTERED', 'PASSED', 'FAILED', 'ABSENT']).optional(),
  score: z.number().min(0).max(100).nullable().optional(),
  certificateNo: z.string().trim().max(50).nullable().optional(),
  certificateExpiry: z.coerce.date().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

const empSelect = { select: { id: true, codeEmp: true, status: true, person: { select: { id: true, fullName: true } } } } as const;

export const trainingService = {
  list() {
    return prisma.trainingCourse.findMany({
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { participants: true } } },
    });
  },

  async get(id: string) {
    const c = await prisma.trainingCourse.findUnique({
      where: { id },
      include: { participants: { include: { employment: empSelect }, orderBy: { employment: { codeEmp: 'asc' } } } },
    });
    if (!c) throw new NotFoundError('Không tìm thấy khoá học');
    return { ...c, commitmentEnd: commitmentEnd(c.endDate, c.commitmentMonths) };
  },

  async create(input: z.infer<typeof courseSchema>) {
    if (await prisma.trainingCourse.findUnique({ where: { code: input.code } })) throw new ConflictError(`Mã khoá ${input.code} đã tồn tại`);
    return prisma.trainingCourse.create({ data: { ...input, costPerPerson: input.costPerPerson.toFixed(4) } });
  },

  async update(id: string, input: Partial<z.infer<typeof courseSchema>>) {
    await this.get(id);
    const { costPerPerson, ...rest } = input;
    return prisma.trainingCourse.update({ where: { id }, data: { ...rest, ...(costPerPerson !== undefined ? { costPerPerson: costPerPerson.toFixed(4) } : {}) } });
  },

  async remove(id: string) {
    const c = await this.get(id);
    if (c.participants.some((p) => p.result === 'PASSED')) throw new ConflictError('Khoá học đã có người hoàn thành — đổi trạng thái Huỷ thay vì xoá');
    await prisma.trainingCourse.delete({ where: { id } });
  },

  async addParticipants(courseId: string, employmentIds: string[]) {
    const c = await this.get(courseId);
    // Chỉ thêm (và báo) người chưa có trong khoá.
    const existing = new Set(c.participants.map((p) => p.employmentId));
    const fresh = [...new Set(employmentIds)].filter((id) => !existing.has(id));
    if (fresh.length === 0) return { added: 0 };
    const r = await prisma.trainingParticipant.createMany({
      data: fresh.map((employmentId) => ({ courseId, employmentId })),
      skipDuplicates: true,
    });
    void notify.employment(fresh, {
      title: `Bạn được cử đi đào tạo: ${c.name}`,
      body: `${c.startDate.toISOString().slice(0, 10).split('-').reverse().join('/')}${c.location ? ` tại ${c.location}` : ''}${c.commitmentMonths ? ` · cam kết làm việc ${c.commitmentMonths} tháng sau khoá học` : ''}`,
      link: '/me',
    });
    return { added: r.count };
  },

  async updateParticipant(id: string, input: z.infer<typeof participantSchema>) {
    const p = await prisma.trainingParticipant.findUnique({ where: { id } });
    if (!p) throw new NotFoundError('Không tìm thấy học viên');
    return prisma.trainingParticipant.update({
      where: { id },
      data: { ...input, ...(input.score !== undefined ? { score: input.score === null ? null : String(input.score) } : {}) },
    });
  },

  async removeParticipant(id: string) {
    await prisma.trainingParticipant.delete({ where: { id } }).catch(() => {
      throw new NotFoundError('Không tìm thấy học viên');
    });
  },

  /** Lịch sử đào tạo của một nhân viên. */
  history(employmentId: string) {
    return prisma.trainingParticipant.findMany({
      where: { employmentId },
      include: { course: true },
      orderBy: { course: { startDate: 'desc' } },
    });
  },

  /**
   * Khoản bồi hoàn chi phí đào tạo nếu nghỉ việc vào ngày leaveDate (khoá đã hoàn thành, còn trong cam kết).
   * Dùng ở màn hình Cho nghỉ việc.
   */
  async refundsOnLeave(employmentId: string, leaveDate: Date) {
    const rows = await prisma.trainingParticipant.findMany({
      where: { employmentId, result: 'PASSED', course: { commitmentMonths: { gt: 0 }, status: { not: 'CANCELLED' } } },
      include: { course: true },
    });
    const items = rows
      .map((r) => ({
        courseId: r.courseId,
        code: r.course.code,
        name: r.course.name,
        commitmentEnd: commitmentEnd(r.course.endDate, r.course.commitmentMonths),
        cost: Number(r.course.costPerPerson),
        refund: trainingRefund(String(r.course.costPerPerson), r.course.commitmentMonths, r.course.endDate, leaveDate).toNumber(),
      }))
      .filter((x) => x.refund > 0);
    return { items, total: items.reduce((s, x) => new Decimal(s).plus(x.refund).toNumber(), 0) };
  },
};
