import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/AppError';
import { UpdatePersonInput } from './corehr.types';

/** Kiểm tra nhân sự tồn tại, ném lỗi nếu không. */
async function ensurePerson(personId: string) {
  const p = await prisma.person.findFirst({
    where: { id: personId, isDelete: false },
  });
  if (!p) throw new NotFoundError('Không tìm thấy nhân sự');
  return p;
}

/**
 * Xóa mềm một bản ghi con, có kiểm tra:
 *  - bản ghi tồn tại và chưa bị xóa
 *  - bản ghi thuộc đúng nhân sự trên URL (chống xóa nhầm của người khác)
 * delegate là một model Prisma (prisma.relative, prisma.personSkill...).
 */
async function removeOwnedChild(
  delegate: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    update: (args: unknown) => Promise<unknown>;
  },
  personId: string,
  subId: string,
  notFoundMsg: string,
) {
  const row = await delegate.findFirst({
    where: { id: subId, personId, isDelete: false },
  });
  if (!row) throw new NotFoundError(notFoundMsg);
  return delegate.update({ where: { id: subId }, data: { isDelete: true } });
}

export const personSubService = {
  // ---------- Sửa / xóa nhân sự ----------
  async updatePerson(id: string, input: UpdatePersonInput) {
    await ensurePerson(id);
    if (input.idNo) {
      const dup = await prisma.person.findFirst({
        where: { idNo: input.idNo, id: { not: id }, isDelete: false },
      });
      if (dup) throw new ConflictError('CCCD đã thuộc về nhân sự khác');
    }
    return prisma.person.update({ where: { id }, data: input });
  },

  /**
   * Xóa mềm nhân sự — chỉ khi không còn lần làm việc chưa kết thúc.
   * Gồm cả trạng thái UPCOMING (sắp vào làm) để không bỏ sót.
   */
  async deletePerson(id: string) {
    await ensurePerson(id);
    const activeEmployment = await prisma.employment.count({
      where: {
        personId: id,
        status: { in: ['UPCOMING', 'PROBATION', 'ACTIVE', 'SUSPENDED'] },
        isDelete: false,
      },
    });
    if (activeEmployment > 0) {
      throw new ConflictError(
        'Không thể xóa: nhân sự còn lần làm việc chưa kết thúc',
      );
    }
    return prisma.person.update({ where: { id }, data: { isDelete: true } });
  },

  // ---------- Người thân ----------
  async listRelatives(personId: string) {
    await ensurePerson(personId);
    return prisma.relative.findMany({
      where: { personId, isDelete: false },
      orderBy: { createdAt: 'desc' },
    });
  },
  async addRelative(personId: string, data: Record<string, unknown>) {
    await ensurePerson(personId);
    return prisma.relative.create({ data: { personId, ...(data as any) } });
  },
  async removeRelative(personId: string, subId: string) {
    return removeOwnedChild(prisma.relative as any, personId, subId, 'Không tìm thấy người thân');
  },

  // ---------- Người phụ thuộc ----------
  async listDependants(personId: string) {
    await ensurePerson(personId);
    return prisma.dependant.findMany({
      where: { personId, isDelete: false },
      orderBy: { createdAt: 'desc' },
    });
  },
  async addDependant(personId: string, data: Record<string, unknown>) {
    await ensurePerson(personId);
    return prisma.dependant.create({ data: { personId, ...(data as any) } });
  },
  async removeDependant(personId: string, subId: string) {
    return removeOwnedChild(prisma.dependant as any, personId, subId, 'Không tìm thấy người phụ thuộc');
  },

  // ---------- Học vấn ----------
  async listEducations(personId: string) {
    await ensurePerson(personId);
    return prisma.personEducation.findMany({ where: { personId, isDelete: false } });
  },
  async addEducation(personId: string, data: Record<string, unknown>) {
    await ensurePerson(personId);
    return prisma.personEducation.create({ data: { personId, ...(data as any) } });
  },
  async removeEducation(personId: string, subId: string) {
    return removeOwnedChild(prisma.personEducation as any, personId, subId, 'Không tìm thấy quá trình học vấn');
  },

  // ---------- Chứng chỉ ----------
  async listCertificates(personId: string) {
    await ensurePerson(personId);
    return prisma.personCertificate.findMany({ where: { personId, isDelete: false } });
  },
  async addCertificate(personId: string, data: Record<string, unknown>) {
    await ensurePerson(personId);
    return prisma.personCertificate.create({ data: { personId, ...(data as any) } });
  },
  async removeCertificate(personId: string, subId: string) {
    return removeOwnedChild(prisma.personCertificate as any, personId, subId, 'Không tìm thấy chứng chỉ');
  },

  // ---------- Kinh nghiệm ----------
  async listExperiences(personId: string) {
    await ensurePerson(personId);
    return prisma.personExperience.findMany({ where: { personId, isDelete: false } });
  },
  async addExperience(personId: string, data: Record<string, unknown>) {
    await ensurePerson(personId);
    return prisma.personExperience.create({ data: { personId, ...(data as any) } });
  },
  async removeExperience(personId: string, subId: string) {
    return removeOwnedChild(prisma.personExperience as any, personId, subId, 'Không tìm thấy kinh nghiệm');
  },

  // ---------- Kỹ năng ----------
  async listSkills(personId: string) {
    await ensurePerson(personId);
    return prisma.personSkill.findMany({ where: { personId, isDelete: false } });
  },
  async addSkill(personId: string, data: Record<string, unknown>) {
    await ensurePerson(personId);
    return prisma.personSkill.create({ data: { personId, ...(data as any) } });
  },
  async removeSkill(personId: string, subId: string) {
    return removeOwnedChild(prisma.personSkill as any, personId, subId, 'Không tìm thấy kỹ năng');
  },

  // ---------- Tài liệu ----------
  async listDocuments(personId: string) {
    await ensurePerson(personId);
    return prisma.personDocument.findMany({ where: { personId, isDelete: false } });
  },
  async addDocument(personId: string, data: Record<string, unknown>) {
    await ensurePerson(personId);
    return prisma.personDocument.create({ data: { personId, ...(data as any) } });
  },
  async removeDocument(personId: string, subId: string) {
    return removeOwnedChild(prisma.personDocument as any, personId, subId, 'Không tìm thấy tài liệu');
  },

  // ---------- Giấy phép lao động ----------
  async listWorkPermits(personId: string) {
    await ensurePerson(personId);
    return prisma.workPermit.findMany({ where: { personId, isDelete: false } });
  },
  async addWorkPermit(personId: string, data: Record<string, unknown>) {
    await ensurePerson(personId);
    return prisma.workPermit.create({ data: { personId, ...(data as any) } });
  },
  async removeWorkPermit(personId: string, subId: string) {
    return removeOwnedChild(prisma.workPermit as any, personId, subId, 'Không tìm thấy giấy phép lao động');
  },

  // ---------- Thẻ tạm trú ----------
  async listResidenceCards(personId: string) {
    await ensurePerson(personId);
    return prisma.residenceCard.findMany({ where: { personId, isDelete: false } });
  },
  async addResidenceCard(personId: string, data: Record<string, unknown>) {
    await ensurePerson(personId);
    return prisma.residenceCard.create({ data: { personId, ...(data as any) } });
  },
  async removeResidenceCard(personId: string, subId: string) {
    return removeOwnedChild(prisma.residenceCard as any, personId, subId, 'Không tìm thấy thẻ tạm trú');
  },

  // ---------- Cảnh báo hết hạn ----------
  /**
   * Giấy tờ sắp/đã hết hạn trong `days` ngày tới, có thể lọc theo công ty.
   * Gộp: giấy phép lao động, thẻ tạm trú, chứng chỉ bắt buộc.
   */
  async expiringDocuments(days = 60, companyId?: string) {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + days);

    // Lọc theo công ty qua employment của person (nếu có yêu cầu).
    const personFilter = companyId
      ? { person: { employments: { some: { companyId, isDelete: false } } } }
      : {};

    const [permits, cards, certs] = await Promise.all([
      prisma.workPermit.findMany({
        where: { isDelete: false, expiryDate: { not: null, lte: until }, ...personFilter },
        include: { person: { select: { fullName: true, personCode: true } } },
      }),
      prisma.residenceCard.findMany({
        where: { isDelete: false, expiryDate: { not: null, lte: until }, ...personFilter },
        include: { person: { select: { fullName: true, personCode: true } } },
      }),
      prisma.personCertificate.findMany({
        where: {
          isDelete: false,
          isMandatory: true,
          expiryDate: { not: null, lte: until },
          ...personFilter,
        },
        include: { person: { select: { fullName: true, personCode: true } } },
      }),
    ]);

    const mark = (d: Date | null) => (d && d < now ? 'EXPIRED' : 'EXPIRING');

    return {
      workPermits: permits.map((p: (typeof permits)[number]) => ({ ...p, warning: mark(p.expiryDate) })),
      residenceCards: cards.map((c: (typeof cards)[number]) => ({ ...c, warning: mark(c.expiryDate) })),
      mandatoryCertificates: certs.map((c: (typeof certs)[number]) => ({ ...c, warning: mark(c.expiryDate) })),
    };
  },
};
