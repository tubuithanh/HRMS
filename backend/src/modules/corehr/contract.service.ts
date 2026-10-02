import { getSettings } from '../settings/settings.service';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { todayDate } from '../../common/utils/dates';
import { expiryWarning, validateContract } from './contract.logic';

export const createContractSchema = z.object({
  contractNo: z.string().trim().min(1).max(50),
  contractType: z.enum(['PROBATION', 'FIXED_TERM', 'INDEFINITE', 'SERVICE']),
  /** Phụ lục: id hợp đồng gốc. Loại hợp đồng lấy theo hợp đồng gốc. */
  parentId: z.string().uuid().optional(),
  signDate: z.coerce.date(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  salaryAmount: z.number().positive().optional(),
  jobTitle: z.string().trim().max(150).optional(),
  note: z.string().trim().max(1000).optional(),
  filePath: z.string().trim().max(500).optional(),
});

export const terminateContractSchema = z.object({
  terminatedDate: z.coerce.date(),
  terminateReason: z.string().trim().max(500).optional(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;

const employmentSummary = {
  select: {
    id: true,
    codeEmp: true,
    status: true,
    person: { select: { id: true, personCode: true, fullName: true } },
  },
} as const;

export const contractService = {
  list(employmentId: string) {
    return prisma.laborContract.findMany({
      where: { employmentId, isDelete: false },
      orderBy: [{ startDate: 'desc' }],
      include: { parent: { select: { id: true, contractNo: true } } },
    });
  },

  async create(employmentId: string, input: CreateContractInput) {
    const emp = await prisma.employment.findFirst({
      where: { id: employmentId, isDelete: false },
      include: {
        assignments: {
          where: { isDelete: false, isPrimary: true, endDate: null },
          include: { position: { include: { job: true } } },
          take: 1,
        },
      },
    });
    if (!emp) throw new NotFoundError('Không tìm thấy hợp đồng lao động');

    const dup = await prisma.laborContract.findUnique({ where: { contractNo: input.contractNo } });
    if (dup) throw new ConflictError('Số hợp đồng đã tồn tại');

    let contractType = input.contractType;
    if (input.parentId) {
      // Phụ lục: cùng nhân viên, không đổi loại hợp đồng, không bắt đầu trước hợp đồng gốc.
      const parent = await prisma.laborContract.findFirst({
        where: { id: input.parentId, employmentId, isDelete: false, parentId: null },
      });
      if (!parent) throw new NotFoundError('Không tìm thấy hợp đồng gốc của phụ lục');
      if (input.startDate < parent.startDate) {
        throw new ValidationError('Phụ lục không được hiệu lực trước hợp đồng gốc');
      }
      contractType = parent.contractType;
    } else {
      const existing = await prisma.laborContract.findMany({
        where: { employmentId, isDelete: false, parentId: null },
      });
      const maxProbation = emp.assignments[0]?.position.job.maxProbationDays ?? null;
      const error = validateContract(
        { contractType, startDate: input.startDate, endDate: input.endDate ?? null },
        existing,
        maxProbation,
        (await getSettings()).laborRules,
      );
      if (error) throw new ValidationError(error);
    }

    return prisma.laborContract.create({
      data: {
        ...input,
        contractType,
        employmentId,
        salaryAmount: input.salaryAmount === undefined ? undefined : String(input.salaryAmount),
      },
    });
  },

  async terminate(id: string, terminatedDate: Date, reason?: string) {
    const c = await prisma.laborContract.findFirst({ where: { id, isDelete: false } });
    if (!c) throw new NotFoundError('Không tìm thấy hợp đồng');
    if (c.terminatedDate) throw new ConflictError('Hợp đồng đã chấm dứt');
    if (terminatedDate < c.startDate) {
      throw new ValidationError('Ngày chấm dứt phải sau ngày bắt đầu hợp đồng');
    }
    if (c.endDate && terminatedDate > c.endDate) {
      throw new AppError('Ngày chấm dứt sau ngày hết hạn hợp đồng', 422, 'VALIDATION_ERROR');
    }
    return prisma.laborContract.update({
      where: { id },
      data: { terminatedDate, terminateReason: reason },
    });
  },

  async remove(id: string) {
    const c = await prisma.laborContract.findFirst({ where: { id, isDelete: false } });
    if (!c) throw new NotFoundError('Không tìm thấy hợp đồng');
    const children = await prisma.laborContract.count({ where: { parentId: id, isDelete: false } });
    if (children > 0) throw new ConflictError('Cần xoá các phụ lục trước');
    await prisma.laborContract.update({ where: { id }, data: { isDelete: true } });
  },

  /**
   * Hợp đồng sắp hết hạn (trong `days` ngày) hoặc đã hết hạn mà chưa ký tiếp,
   * của nhân viên chưa nghỉ việc.
   */
  async expiring(days: number) {
    const today = todayDate();
    const contracts = await prisma.laborContract.findMany({
      where: {
        isDelete: false,
        parentId: null,
        employment: { isDelete: false, status: { not: 'TERMINATED' } },
      },
      include: { employment: employmentSummary },
    });
    const byEmployment = new Map<string, typeof contracts>();
    for (const c of contracts) {
      byEmployment.set(c.employmentId, [...(byEmployment.get(c.employmentId) ?? []), c]);
    }
    return contracts
      .map((c) => ({ ...c, warning: expiryWarning(c, byEmployment.get(c.employmentId)!, today, days) }))
      .filter((c) => c.warning !== null)
      .sort((a, b) => a.endDate!.getTime() - b.endDate!.getTime());
  },
};
