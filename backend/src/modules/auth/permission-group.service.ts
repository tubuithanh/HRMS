import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError } from '../../common/errors/AppError';
import { ALL_PERMISSIONS, invalidatePermissions, MODULES, Permission, SYSTEM_GROUPS } from './permissions';

const permission = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]);

export const groupSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,40}$/, 'Mã nhóm 2–40 ký tự: A-Z, 0-9, _'),
  name: z.string().trim().min(1, 'Nhập tên nhóm').max(100),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(permission).max(ALL_PERMISSIONS.length),
});
export const updateGroupSchema = groupSchema.omit({ code: true }).partial();

/** Có quyền sửa thì tự thêm quyền xem (lưu gọn, dễ đọc). */
const normalize = (perms: Permission[]) => {
  const s = new Set<string>(perms);
  for (const p of perms) if (p.endsWith(':write')) s.add(p.replace(':write', ':read'));
  return ALL_PERMISSIONS.filter((p) => s.has(p));
};

export const permissionGroupService = {
  /** Danh mục phân hệ + nhóm quyền kèm số tài khoản đang dùng. */
  async list() {
    const [groups, users] = await Promise.all([
      prisma.permissionGroup.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] }),
      prisma.user.findMany({ select: { role: true, permissionGroupIds: true } }),
    ]);
    return {
      modules: Object.entries(MODULES).map(([key, label]) => ({ key, label })),
      groups: groups.map((g) => ({
        ...g,
        // Đếm cả tài khoản chưa gán nhóm mà dùng nhóm hệ thống theo vai trò.
        userCount: users.filter((u) => u.permissionGroupIds.includes(g.id) || (g.isSystem && u.permissionGroupIds.length === 0 && u.role === g.code)).length,
      })),
    };
  },

  async create(input: z.infer<typeof groupSchema>) {
    if (await prisma.permissionGroup.findUnique({ where: { code: input.code } })) throw new ConflictError('Mã nhóm đã tồn tại');
    const g = await prisma.permissionGroup.create({ data: { ...input, permissions: normalize(input.permissions), isSystem: false } });
    invalidatePermissions();
    return g;
  },

  async update(id: string, input: z.infer<typeof updateGroupSchema>) {
    const g = await prisma.permissionGroup.findUnique({ where: { id } });
    if (!g) throw new NotFoundError('Không tìm thấy nhóm quyền');
    if (g.code === 'ADMIN' && input.permissions) throw new AppError('Nhóm Quản trị luôn toàn quyền, không giới hạn được', 400, 'ADMIN_GROUP');
    const updated = await prisma.permissionGroup.update({
      where: { id },
      data: { ...input, ...(input.permissions ? { permissions: normalize(input.permissions) } : {}) },
    });
    invalidatePermissions();
    return updated;
  },

  /** Khôi phục quyền mặc định của nhóm hệ thống. */
  async resetSystem(id: string) {
    const g = await prisma.permissionGroup.findUnique({ where: { id } });
    const def = g && SYSTEM_GROUPS.find((s) => s.code === g.code);
    if (!g || !g.isSystem || !def) throw new NotFoundError('Không phải nhóm hệ thống');
    const updated = await prisma.permissionGroup.update({ where: { id }, data: { permissions: def.permissions } });
    invalidatePermissions();
    return updated;
  },

  async remove(id: string) {
    const g = await prisma.permissionGroup.findUnique({ where: { id } });
    if (!g) throw new NotFoundError('Không tìm thấy nhóm quyền');
    if (g.isSystem) throw new AppError('Không xoá được nhóm hệ thống', 400, 'SYSTEM_GROUP');
    const used = await prisma.user.count({ where: { permissionGroupIds: { has: id } } });
    if (used) throw new ConflictError(`Nhóm đang gán cho ${used} tài khoản — gỡ khỏi tài khoản trước khi xoá`);
    await prisma.permissionGroup.delete({ where: { id } });
    invalidatePermissions();
  },
};
