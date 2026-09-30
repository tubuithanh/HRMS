import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError } from '../../common/errors/AppError';
import { previousDay } from '../../common/utils/effectiveDating';
import {
  CreateEmployeeElementInput,
  CreatePayElementInput,
  CreatePeriodElementInput,
  UpdatePayElementInput,
} from './elements.schema';

const dec = (v: number | null | undefined) =>
  v === undefined ? undefined : v === null ? null : String(v);

async function ensureEmployment(id: string) {
  const emp = await prisma.employment.findFirst({ where: { id, isDelete: false } });
  if (!emp) throw new NotFoundError('Không tìm thấy hợp đồng lao động');
}

async function ensureElement(id: string) {
  const el = await prisma.payElement.findUnique({ where: { id } });
  if (!el || !el.isActive) throw new NotFoundError('Khoản lương không hợp lệ');
  return el;
}

/** Kỳ lương còn sửa được (chưa khoá). */
async function ensureOpenPeriod(id: string) {
  const p = await prisma.payPeriod.findUnique({ where: { id } });
  if (!p) throw new NotFoundError('Không tìm thấy kỳ lương');
  if (p.status === 'LOCKED' || p.status === 'PAID') {
    throw new ConflictError('Kỳ lương đã khoá, không thể thay đổi khoản phát sinh');
  }
  return p;
}

export const elementsService = {
  // ---------- Danh mục khoản lương ----------
  listElements() {
    return prisma.payElement.findMany({ orderBy: [{ type: 'asc' }, { code: 'asc' }] });
  },

  async createElement(input: CreatePayElementInput) {
    const dup = await prisma.payElement.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictError('Mã khoản lương đã tồn tại');
    return prisma.payElement.create({
      data: { ...input, taxExemptLimit: dec(input.taxExemptLimit) },
    });
  },

  async updateElement(id: string, input: UpdatePayElementInput) {
    const el = await prisma.payElement.findUnique({ where: { id } });
    if (!el) throw new NotFoundError('Không tìm thấy khoản lương');
    const treatment = input.taxTreatment ?? el.taxTreatment;
    const limit = input.taxExemptLimit === undefined ? el.taxExemptLimit : input.taxExemptLimit;
    if (treatment === 'PARTIAL_EXEMPT' && limit === null) {
      throw new AppError('Miễn thuế một phần cần có mức miễn thuế', 422, 'VALIDATION_ERROR');
    }
    return prisma.payElement.update({
      where: { id },
      data: { ...input, taxExemptLimit: dec(input.taxExemptLimit) },
    });
  },

  // ---------- Khoản cố định của nhân viên ----------
  async listEmployeeElements(employmentId: string) {
    await ensureEmployment(employmentId);
    return prisma.employeeElement.findMany({
      where: { employmentId, isDelete: false },
      orderBy: [{ endDate: { sort: 'asc', nulls: 'first' } }, { effectiveDate: 'desc' }],
      include: { payElement: true },
    });
  },

  /**
   * Thêm khoản cố định. Nếu nhân viên đang có dòng mở của cùng khoản đó,
   * dòng cũ tự kết thúc vào ngày trước ngày hiệu lực mới (đổi mức phụ cấp).
   */
  async addEmployeeElement(employmentId: string, input: CreateEmployeeElementInput) {
    await ensureEmployment(employmentId);
    await ensureElement(input.payElementId);
    return prisma.$transaction(async (tx) => {
      const open = await tx.employeeElement.findFirst({
        where: { employmentId, payElementId: input.payElementId, endDate: null, isDelete: false },
      });
      if (open) {
        if (open.effectiveDate >= input.effectiveDate) {
          throw new ConflictError('Ngày hiệu lực phải sau ngày hiệu lực của mức hiện tại');
        }
        await tx.employeeElement.update({
          where: { id: open.id },
          data: { endDate: previousDay(input.effectiveDate) },
        });
      }
      return tx.employeeElement.create({
        data: {
          employmentId,
          payElementId: input.payElementId,
          amount: String(input.amount),
          effectiveDate: input.effectiveDate,
        },
        include: { payElement: true },
      });
    });
  },

  async endEmployeeElement(employmentId: string, id: string, endDate: Date) {
    const row = await prisma.employeeElement.findFirst({
      where: { id, employmentId, isDelete: false },
    });
    if (!row) throw new NotFoundError('Không tìm thấy khoản cố định');
    if (endDate < row.effectiveDate) {
      throw new AppError('Ngày kết thúc phải sau ngày hiệu lực', 422, 'VALIDATION_ERROR');
    }
    return prisma.employeeElement.update({ where: { id }, data: { endDate } });
  },

  // ---------- Khoản phát sinh trong kỳ ----------
  listPeriodElements(payPeriodId: string) {
    return prisma.periodElement.findMany({
      where: { payPeriodId },
      orderBy: { createdAt: 'asc' },
      include: {
        payElement: true,
        employment: {
          select: { id: true, codeEmp: true, person: { select: { fullName: true, personCode: true } } },
        },
      },
    });
  },

  async addPeriodElement(payPeriodId: string, input: CreatePeriodElementInput) {
    await ensureOpenPeriod(payPeriodId);
    await ensureEmployment(input.employmentId);
    await ensureElement(input.payElementId);
    return prisma.periodElement.create({
      data: {
        payPeriodId,
        employmentId: input.employmentId,
        payElementId: input.payElementId,
        amount: String(input.amount),
        note: input.note,
      },
      include: { payElement: true },
    });
  },

  async removePeriodElement(payPeriodId: string, id: string) {
    await ensureOpenPeriod(payPeriodId);
    const row = await prisma.periodElement.findFirst({ where: { id, payPeriodId } });
    if (!row) throw new NotFoundError('Không tìm thấy khoản phát sinh');
    await prisma.periodElement.delete({ where: { id } });
  },
};
