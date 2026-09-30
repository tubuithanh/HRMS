import { Prisma } from '@prisma/client';
import { prisma, TxClient } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/AppError';
import { money, toDbString } from '../../common/utils/money';
import { buildInstallmentSchedule } from './advance';

export interface CreateAdvanceInput {
  employmentId: string;
  requestDate: Date;
  amount: number;
  reason?: string;
  installments: number;
}

export const advanceService = {
  /**
   * Tạo tạm ứng và sinh lịch khấu trừ. Kỳ cuối gánh phần chênh lệch để
   * tổng lịch khấu trừ khớp tuyệt đối với số tạm ứng.
   */
  async create(input: CreateAdvanceInput) {
    const emp = await prisma.employment.findFirst({
      where: { id: input.employmentId, isDelete: false },
    });
    if (!emp) throw new NotFoundError('Không tìm thấy nhân viên');
    if (input.installments <= 0) {
      throw new ConflictError('Số kỳ khấu trừ phải lớn hơn 0');
    }

    const schedule = buildInstallmentSchedule(input.amount, input.installments);

    return prisma.$transaction(async (tx: TxClient) => {
      const advance = await tx.advance.create({
        data: {
          employmentId: input.employmentId,
          requestDate: input.requestDate,
          amount: toDbString(money(input.amount)),
          reason: input.reason,
          installments: input.installments,
          status: 'APPROVED',
        },
      });

      for (const item of schedule) {
        await tx.advanceSchedule.create({
          data: {
            advanceId: advance.id,
            index: item.index,
            amount: toDbString(item.amount),
          },
        });
      }

      return tx.advance.findUnique({
        where: { id: advance.id },
        include: { schedule: { orderBy: { index: 'asc' } } },
      });
    });
  },

  async list(employmentId: string) {
    return prisma.advance.findMany({
      where: { employmentId },
      include: { schedule: { orderBy: { index: 'asc' } } },
      orderBy: { requestDate: 'desc' },
    });
  },

  /** Đánh dấu một kỳ đã được khấu trừ trong một kỳ lương. */
  async markDeducted(scheduleId: string, payPeriodId: string) {
    const item = await prisma.advanceSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!item) throw new NotFoundError('Không tìm thấy kỳ khấu trừ');
    if (item.isDeducted) throw new ConflictError('Kỳ này đã khấu trừ');

    return prisma.advanceSchedule.update({
      where: { id: scheduleId },
      data: { isDeducted: true, payPeriodId },
    });
  },
};
