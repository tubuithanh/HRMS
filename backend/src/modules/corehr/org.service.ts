import { Prisma } from '@prisma/client';
import { prisma, TxClient } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/AppError';
import { CreateOrgInput, UpdateOrgInput } from './org.schema';
import { replacePrefix, isDescendantPath } from './org.path';

/** Tính path dạng /Ma1/Ma2/ dựa trên phòng ban cha. */
async function buildPath(
  code: string,
  parentId: string | null | undefined,
  tx: TxClient = prisma,
): Promise<string> {
  if (!parentId) return `/${code}/`;
  const parent = await tx.orgStructure.findFirst({
    where: { id: parentId, isDelete: false },
  });
  if (!parent) throw new NotFoundError('Không tìm thấy phòng ban cha');
  return `${parent.path ?? `/${parent.code}/`}${code}/`;
}

export const orgService = {
  /** Trả về cây tổ chức (danh sách phẳng, có parentId để dựng cây ở client). */
  async list(companyId?: string) {
    return prisma.orgStructure.findMany({
      where: { isDelete: false, ...(companyId ? { companyId } : {}) },
      orderBy: { path: 'asc' },
    });
  },

  async create(input: CreateOrgInput) {
    const dup = await prisma.orgStructure.findUnique({
      where: {
        companyId_code: { companyId: input.companyId, code: input.code },
      },
    });
    if (dup) throw new ConflictError('Mã phòng ban đã tồn tại trong công ty');

    const path = await buildPath(input.code, input.parentId);

    return prisma.orgStructure.create({
      data: {
        companyId: input.companyId,
        code: input.code,
        name: input.name,
        orgType: input.orgType ?? 'DEPARTMENT',
        parentId: input.parentId,
        isRoot: input.isRoot ?? false,
        path,
        effectiveDate: input.effectiveDate,
      },
    });
  },

  async update(id: string, input: UpdateOrgInput) {
    return prisma.$transaction(async (tx: TxClient) => {
      const org = await tx.orgStructure.findFirst({
        where: { id, isDelete: false },
      });
      if (!org) throw new NotFoundError('Không tìm thấy phòng ban');

      // Xử lý khi đổi cha
      let newPath = org.path;
      if (input.parentId !== undefined) {
        // 1. Không tự làm cha của chính mình
        if (input.parentId === id) {
          throw new ConflictError('Phòng ban không thể là cha của chính nó');
        }
        // 2. Không chọn một phòng ban con làm cha (chống vòng lặp).
        //    Cha mới không được nằm trong nhánh con của phòng ban này.
        if (input.parentId && org.path) {
          const newParent = await tx.orgStructure.findFirst({
            where: { id: input.parentId, isDelete: false },
          });
          if (!newParent) throw new NotFoundError('Không tìm thấy phòng ban cha');
          if (newParent.path && isDescendantPath(newParent.path, org.path)) {
            throw new ConflictError(
              'Không thể chọn một phòng ban con làm phòng ban cha (gây vòng lặp)',
            );
          }
        }
        newPath = await buildPath(org.code, input.parentId, tx);
      }

      const oldPath = org.path;

      const updated = await tx.orgStructure.update({
        where: { id },
        data: {
          name: input.name,
          orgType: input.orgType,
          parentId: input.parentId,
          path: newPath,
        },
      });

      // Cập nhật path cho toàn bộ nhánh con, thay đúng prefix ở đầu chuỗi.
      if (oldPath && newPath && oldPath !== newPath) {
        const children = await tx.orgStructure.findMany({
          where: {
            path: { startsWith: oldPath },
            id: { not: id },
            isDelete: false,
          },
        });
        for (const child of children) {
          if (!child.path) continue;
          await tx.orgStructure.update({
            where: { id: child.id },
            data: { path: replacePrefix(child.path, oldPath, newPath) },
          });
        }
      }

      return updated;
    });
  },

  /** Xóa mềm — chỉ cho xóa khi không còn phòng ban con và không còn nhân viên. */
  async remove(id: string) {
    const org = await prisma.orgStructure.findFirst({
      where: { id, isDelete: false },
    });
    if (!org) throw new NotFoundError('Không tìm thấy phòng ban');

    const childCount = await prisma.orgStructure.count({
      where: { parentId: id, isDelete: false },
    });
    if (childCount > 0) {
      throw new ConflictError('Không thể xóa: phòng ban còn đơn vị con');
    }

    const assignmentCount = await prisma.assignment.count({
      where: { orgStructureId: id, endDate: null, isDelete: false },
    });
    if (assignmentCount > 0) {
      throw new ConflictError(
        'Không thể xóa: phòng ban còn nhân viên đang làm việc',
      );
    }

    return prisma.orgStructure.update({
      where: { id },
      data: { isDelete: true },
    });
  },
};
