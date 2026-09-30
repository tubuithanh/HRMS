import { ApplicationStage } from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  AppError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/AppError';
import {
  CreateApplicationInput,
  CreateOpeningInput,
  UpdateApplicationInput,
  UpdateOpeningInput,
} from './recruitment.schema';

async function ensureOpening(id: string) {
  const o = await prisma.jobOpening.findFirst({ where: { id, isDelete: false } });
  if (!o) throw new NotFoundError('Không tìm thấy tin tuyển dụng');
  return o;
}

async function ensureApplication(id: string) {
  const a = await prisma.jobApplication.findFirst({ where: { id, isDelete: false } });
  if (!a) throw new NotFoundError('Không tìm thấy hồ sơ ứng tuyển');
  return a;
}

export const recruitmentService = {
  // ---------- Tin tuyển dụng ----------
  async listOpenings() {
    const openings = await prisma.jobOpening.findMany({
      where: { isDelete: false },
      orderBy: [{ status: 'asc' }, { openDate: 'desc' }],
      include: {
        orgStructure: { select: { id: true, name: true } },
        applications: { where: { isDelete: false }, select: { stage: true } },
      },
    });
    // Đếm số hồ sơ theo từng vòng thay vì trả cả danh sách.
    return openings.map(({ applications, ...o }) => {
      const stageCounts: Partial<Record<ApplicationStage, number>> = {};
      for (const a of applications) {
        stageCounts[a.stage] = (stageCounts[a.stage] ?? 0) + 1;
      }
      return { ...o, applicationCount: applications.length, stageCounts };
    });
  },

  async createOpening(input: CreateOpeningInput) {
    const dup = await prisma.jobOpening.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictError('Mã tin tuyển dụng đã tồn tại');
    return prisma.jobOpening.create({ data: input });
  },

  async updateOpening(id: string, input: UpdateOpeningInput) {
    await ensureOpening(id);
    return prisma.jobOpening.update({ where: { id }, data: input });
  },

  async deleteOpening(id: string) {
    await ensureOpening(id);
    await prisma.jobOpening.update({ where: { id }, data: { isDelete: true } });
  },

  // ---------- Hồ sơ ứng tuyển ----------
  listApplications(jobOpeningId?: string) {
    return prisma.jobApplication.findMany({
      where: { isDelete: false, ...(jobOpeningId ? { jobOpeningId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        jobOpening: { select: { id: true, code: true, title: true } },
        hiredPerson: { select: { id: true, personCode: true, fullName: true } },
      },
    });
  },

  async createApplication(input: CreateApplicationInput) {
    const opening = await ensureOpening(input.jobOpeningId);
    if (opening.status === 'CLOSED') {
      throw new AppError('Tin tuyển dụng đã đóng', 400, 'OPENING_CLOSED');
    }
    return prisma.jobApplication.create({ data: input });
  },

  async updateApplication(id: string, input: UpdateApplicationInput) {
    const app = await ensureApplication(id);
    if (app.stage === 'HIRED') {
      throw new ConflictError('Ứng viên đã nhận việc, không thể đổi vòng');
    }
    return prisma.jobApplication.update({ where: { id }, data: input });
  },

  async deleteApplication(id: string) {
    await ensureApplication(id);
    await prisma.jobApplication.update({ where: { id }, data: { isDelete: true } });
  },

  /**
   * Ứng viên nhận việc: tạo hồ sơ nhân sự (Person) từ thông tin ứng viên
   * và chuyển hồ sơ sang HIRED. Hợp đồng lao động tạo tiếp ở phân hệ Nhân sự.
   */
  async hire(id: string, personCode: string) {
    const app = await ensureApplication(id);
    if (app.stage === 'HIRED') throw new ConflictError('Ứng viên đã nhận việc');
    if (app.stage === 'REJECTED') {
      throw new ConflictError('Ứng viên đã bị loại, không thể nhận việc');
    }
    const dup = await prisma.person.findFirst({
      where: { personCode, isDelete: false },
    });
    if (dup) throw new ConflictError('Mã người đã tồn tại');

    return prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          personCode,
          fullName: app.fullName,
          email: app.email,
          phone: app.phone,
        },
      });
      return tx.jobApplication.update({
        where: { id },
        data: { stage: 'HIRED', hiredPersonId: person.id },
        include: {
          hiredPerson: { select: { id: true, personCode: true, fullName: true } },
        },
      });
    });
  },
};
