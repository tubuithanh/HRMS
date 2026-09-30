import { Prisma } from '@prisma/client';
import { prisma, TxClient } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/AppError';
import { previousDay } from '../../common/utils/effectiveDating';
import {
  calcProbationEndDate,
  defaultAssignmentAction,
} from './corehr.logic';
import {
  AssignInput,
  CreateEmploymentInput,
  CreatePersonInput,
  CreatePositionInput,
} from './corehr.schema';

export const coreHrService = {
  // ---------- Person ----------
  async listPersons() {
    return prisma.person.findMany({
      where: { isDelete: false },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createPerson(input: CreatePersonInput) {
    // Kiểm tra trùng trong phạm vi bản ghi CHƯA xóa mềm.
    // (Tính duy nhất thực thi bằng partial unique index ở database.)
    const dupCode = await prisma.person.findFirst({
      where: { personCode: input.personCode, isDelete: false },
    });
    if (dupCode) throw new ConflictError('Mã người đã tồn tại');

    if (input.idNo) {
      const dup = await prisma.person.findFirst({
        where: { idNo: input.idNo, isDelete: false },
      });
      if (dup) throw new ConflictError('CCCD đã tồn tại trong hệ thống');
    }
    if (input.personalTaxCode) {
      const dupTax = await prisma.person.findFirst({
        where: { personalTaxCode: input.personalTaxCode, isDelete: false },
      });
      if (dupTax) throw new ConflictError('Mã số thuế đã tồn tại');
    }

    return prisma.person.create({ data: input });
  },

  async getPerson(id: string) {
    const person = await prisma.person.findFirst({
      where: { id, isDelete: false },
      include: { employments: true, dependants: true },
    });
    if (!person) throw new NotFoundError('Không tìm thấy nhân sự');
    return person;
  },

  // ---------- Employment ----------
  async createEmployment(input: CreateEmploymentInput) {
    // Người phải tồn tại và chưa bị xóa mềm
    const person = await prisma.person.findFirst({
      where: { id: input.personId, isDelete: false },
    });
    if (!person) throw new NotFoundError('Không tìm thấy nhân sự');

    // Công ty phải tồn tại
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
    });
    if (!company) throw new NotFoundError('Không tìm thấy công ty');

    // Trùng mã nhân viên trong cùng công ty
    const dup = await prisma.employment.findUnique({
      where: {
        companyId_codeEmp: {
          companyId: input.companyId,
          codeEmp: input.codeEmp,
        },
      },
    });
    if (dup) throw new ConflictError('Mã nhân viên đã tồn tại trong công ty này');

    // Ngày kết thúc thử việc (xem corehr.logic.calcProbationEndDate).
    const probationEndDate = calcProbationEndDate(
      input.dateHire,
      input.probationDays ?? 0,
    );

    return prisma.employment.create({
      data: {
        personId: input.personId,
        companyId: input.companyId,
        codeEmp: input.codeEmp,
        codeAttendance: input.codeAttendance,
        employmentType: input.employmentType ?? 'EMPLOYEE',
        dateHire: input.dateHire,
        dateSeniority: input.dateHire,
        probationEndDate,
        status: probationEndDate ? 'PROBATION' : 'ACTIVE',
      },
    });
  },

  // ---------- Position ----------
  async createPosition(input: CreatePositionInput) {
    const dup = await prisma.position.findUnique({
      where: { code: input.code },
    });
    if (dup) throw new ConflictError('Mã vị trí đã tồn tại');

    return prisma.position.create({
      data: {
        code: input.code,
        jobId: input.jobId,
        orgStructureId: input.orgStructureId,
        parentPositionId: input.parentPositionId,
        isKeyPosition: input.isKeyPosition ?? false,
        effectiveDate: input.effectiveDate,
        status: 'VACANT',
      },
    });
  },

  // ---------- Assignment (theo ngày hiệu lực) ----------
  /**
   * Gán nhân viên vào một vị trí. Nếu đã có vị trí chính đang hiệu lực,
   * đóng dòng cũ (endDate = ngày trước ngày hiệu lực mới) rồi tạo dòng mới.
   * Toàn bộ chạy trong một giao dịch để dữ liệu luôn nhất quán.
   */
  async assign(input: AssignInput) {
    return prisma.$transaction(async (tx: TxClient) => {
      const employment = await tx.employment.findFirst({
        where: { id: input.employmentId, isDelete: false },
      });
      if (!employment) throw new NotFoundError('Không tìm thấy nhân viên');

      const position = await tx.position.findFirst({
        where: { id: input.positionId, isDelete: false },
        include: { orgStructure: true },
      });
      if (!position) throw new NotFoundError('Không tìm thấy vị trí');

      // Ngày hiệu lực không được sớm hơn ngày vào làm
      if (input.effectiveDate < employment.dateHire) {
        throw new ConflictError(
          'Ngày hiệu lực không được sớm hơn ngày vào làm',
        );
      }

      // Vị trí và nhân viên phải cùng công ty
      if (position.orgStructure.companyId !== employment.companyId) {
        throw new ConflictError(
          'Vị trí thuộc công ty khác với nhân viên',
        );
      }

      // Phòng ban lấy từ chính vị trí. Nếu người gọi có truyền orgStructureId
      // thì phải khớp, tránh dữ liệu mâu thuẫn.
      const orgStructureId = position.orgStructureId;
      if (input.orgStructureId && input.orgStructureId !== orgStructureId) {
        throw new ConflictError(
          'Phòng ban truyền vào không khớp với phòng ban của vị trí',
        );
      }

      const isPrimary = input.isPrimary ?? true;

      // Vị trí chính đang hiệu lực của nhân viên (nếu có)
      const current = await tx.assignment.findFirst({
        where: {
          employmentId: input.employmentId,
          isPrimary: true,
          endDate: null,
          isDelete: false,
        },
      });

      // Đang giữ đúng ghế này rồi -> không tạo bản ghi trùng
      if (current && current.positionId === input.positionId && isPrimary) {
        throw new ConflictError('Nhân viên đã ở vị trí này');
      }

      // Ghế mới không được đang bị người khác giữ (một ghế một người)
      const occupied = await tx.assignment.findFirst({
        where: {
          positionId: input.positionId,
          isPrimary: true,
          endDate: null,
          isDelete: false,
          employmentId: { not: input.employmentId },
        },
      });
      if (occupied) {
        throw new ConflictError('Vị trí này đang có người khác đảm nhận');
      }

      if (isPrimary && current) {
        if (current.effectiveDate >= input.effectiveDate) {
          throw new ConflictError(
            'Ngày hiệu lực phải sau ngày hiệu lực của vị trí hiện tại',
          );
        }
        await tx.assignment.update({
          where: { id: current.id },
          data: { endDate: previousDay(input.effectiveDate) },
        });
        await tx.position.update({
          where: { id: current.positionId },
          data: { status: 'VACANT' },
        });
      }

      // Lần gán đầu tiên (chưa có vị trí chính nào) là tuyển mới -> HIRE.
      const defaultAction = defaultAssignmentAction(Boolean(current));

      const assignment = await tx.assignment.create({
        data: {
          employmentId: input.employmentId,
          positionId: input.positionId,
          orgStructureId,
          isPrimary,
          actionType: input.actionType ?? defaultAction,
          actionReason: input.actionReason,
          effectiveDate: input.effectiveDate,
        },
      });

      await tx.position.update({
        where: { id: input.positionId },
        data: { status: 'FILLED' },
      });

      return assignment;
    });
  },

  /** Lấy lịch sử công tác của một nhân viên. */
  async getAssignments(employmentId: string) {
    return prisma.assignment.findMany({
      where: { employmentId, isDelete: false },
      orderBy: { effectiveDate: 'desc' },
      include: { position: true, orgStructure: true },
    });
  },
};
