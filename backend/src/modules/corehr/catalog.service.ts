import { EmploymentStatus, Prisma } from '@prisma/client';
import { prisma, TxClient } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/AppError';
import { previousDay } from '../../common/utils/effectiveDating';
import {
  CreateJobInput,
  CreateSalaryInput,
  CreateTaxProfileInput,
  UpdateEmploymentInput,
} from './catalog.schema';

async function ensureEmployment(id: string) {
  const emp = await prisma.employment.findFirst({
    where: { id, isDelete: false },
  });
  if (!emp) throw new NotFoundError('Không tìm thấy hợp đồng lao động');
  return emp;
}

/**
 * Chèn dòng mới theo ngày hiệu lực: dòng đang mở (endDate = null) được đóng
 * vào ngày liền trước. Không cho chèn trước dòng đang mở để tránh chồng lấn.
 */
async function closeOpenRow(
  tx: TxClient,
  model: 'employeeSalary' | 'employeeTaxProfile',
  employmentId: string,
  effectiveDate: Date,
) {
  const where =
    model === 'employeeSalary'
      ? { employmentId, endDate: null, isDelete: false }
      : { employmentId, endDate: null };
  // Hai model có cùng các trường cần dùng; ép kiểu để dùng chung.
  const delegate = tx[model] as unknown as {
    findFirst(a: unknown): Promise<{ id: string; effectiveDate: Date } | null>;
    update(a: unknown): Promise<unknown>;
  };
  const open = await delegate.findFirst({ where });
  if (!open) return;
  if (open.effectiveDate >= effectiveDate) {
    throw new ConflictError(
      'Ngày hiệu lực phải sau ngày hiệu lực của bản ghi hiện tại',
    );
  }
  await delegate.update({
    where: { id: open.id },
    data: { endDate: previousDay(effectiveDate) },
  });
}

export const catalogService = {
  // ---------- Công ty ----------
  listCompanies() {
    return prisma.company.findMany({ orderBy: { code: 'asc' } });
  },

  // ---------- Chức danh (Job) ----------
  listJobs() {
    return prisma.job.findMany({
      where: { isDelete: false },
      orderBy: { code: 'asc' },
    });
  },

  async createJob(input: CreateJobInput) {
    const dup = await prisma.job.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictError('Mã chức danh đã tồn tại');
    return prisma.job.create({ data: input });
  },

  // ---------- Vị trí ----------
  listPositions(orgStructureId?: string) {
    return prisma.position.findMany({
      where: { isDelete: false, ...(orgStructureId ? { orgStructureId } : {}) },
      orderBy: { code: 'asc' },
      include: {
        job: { select: { id: true, code: true, name: true } },
        orgStructure: { select: { id: true, code: true, name: true } },
      },
    });
  },

  // ---------- Hợp đồng lao động (Employment) ----------
  /** Danh sách hợp đồng kèm người và vị trí chính đang hiệu lực. */
  listEmployments(filter: { status?: EmploymentStatus; companyId?: string } = {}) {
    return prisma.employment.findMany({
      where: {
        isDelete: false,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
      },
      orderBy: { codeEmp: 'asc' },
      include: {
        person: { select: { id: true, personCode: true, fullName: true } },
        company: { select: { id: true, code: true, name: true } },
        assignments: {
          where: { isDelete: false, isPrimary: true, endDate: null },
          include: {
            position: {
              select: { code: true, job: { select: { name: true } } },
            },
            orgStructure: { select: { name: true } },
          },
          take: 1,
        },
      },
    });
  },

  async getEmployment(id: string) {
    const emp = await prisma.employment.findFirst({
      where: { id, isDelete: false },
      include: {
        person: { select: { id: true, personCode: true, fullName: true } },
        company: { select: { id: true, code: true, name: true } },
        assignments: {
          where: { isDelete: false },
          orderBy: { effectiveDate: 'desc' },
          include: {
            position: { include: { job: true } },
            orgStructure: true,
          },
        },
        salaries: {
          where: { isDelete: false },
          orderBy: { effectiveDate: 'desc' },
        },
        taxProfiles: { orderBy: { effectiveDate: 'desc' } },
      },
    });
    if (!emp) throw new NotFoundError('Không tìm thấy hợp đồng lao động');
    return emp;
  },

  async updateEmployment(id: string, input: UpdateEmploymentInput) {
    await ensureEmployment(id);
    return prisma.employment.update({ where: { id }, data: input });
  },

  // ---------- Lương cơ bản ----------
  async addSalary(employmentId: string, input: CreateSalaryInput) {
    await ensureEmployment(employmentId);
    return prisma.$transaction(async (tx) => {
      await closeOpenRow(tx, 'employeeSalary', employmentId, input.effectiveDate);
      return tx.employeeSalary.create({
        data: {
          employmentId,
          salaryType: input.salaryType ?? 'GROSS',
          // Truyền chuỗi để Prisma giữ đúng giá trị Decimal.
          baseAmount: String(input.baseAmount),
          insuranceSalary:
            input.insuranceSalary !== undefined
              ? String(input.insuranceSalary)
              : undefined,
          effectiveDate: input.effectiveDate,
          sourceType: 'MANUAL',
        },
      });
    });
  },

  // ---------- Hồ sơ thuế ----------
  async addTaxProfile(employmentId: string, input: CreateTaxProfileInput) {
    await ensureEmployment(employmentId);
    return prisma.$transaction(async (tx) => {
      await closeOpenRow(
        tx,
        'employeeTaxProfile',
        employmentId,
        input.effectiveDate,
      );
      return tx.employeeTaxProfile.create({
        data: { employmentId, ...input },
      });
    });
  },
};
