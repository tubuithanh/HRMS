import { Role } from '@prisma/client';
import { prisma } from '../../config/prisma';

/**
 * PHÂN QUYỀN THEO NHÓM QUYỀN.
 * Quyền = "<phân hệ>:read" (xem) hoặc "<phân hệ>:write" (thêm / sửa / xoá / duyệt — gồm cả xem).
 * Tài khoản có quyền = hợp các nhóm được gán; chưa gán nhóm nào thì dùng nhóm hệ thống trùng mã vai trò.
 * Vai trò ADMIN luôn toàn quyền (tránh tự khoá mất quyền quản trị).
 */

export const MODULES = {
  dashboard: 'Dashboard',
  corehr: 'Hồ sơ nhân sự, tổ chức, hợp đồng',
  attendance: 'Chấm công, ca làm việc, làm thêm giờ',
  leave: 'Nghỉ phép',
  payroll: 'Tính lương',
  reports: 'Báo cáo BHXH, thuế, chuyển lương',
  benefits: 'Chế độ BHXH',
  people: 'Khen thưởng, đào tạo, đánh giá',
  assets: 'Tài sản cấp phát',
  checklists: 'Tiếp nhận / nghỉ việc',
  recruitment: 'Tuyển dụng',
  import: 'Nhập dữ liệu Excel',
  users: 'Tài khoản & nhóm quyền',
  settings: 'Cấu hình hệ thống, tham số pháp lý',
  audit: 'Nhật ký thao tác',
} as const;
export type Module = keyof typeof MODULES;
export type Action = 'read' | 'write';
export type Permission = `${Module}:${Action}`;

export const ALL_PERMISSIONS: Permission[] = (Object.keys(MODULES) as Module[]).flatMap((m) => [`${m}:read`, `${m}:write`] as Permission[]);

const rw = (...m: Module[]) => m.flatMap((x) => [`${x}:read`, `${x}:write`] as Permission[]);
const r = (...m: Module[]) => m.map((x) => `${x}:read` as Permission);

/** Nhóm hệ thống — quyền mặc định giống phân quyền theo vai trò trước đây. */
export const SYSTEM_GROUPS: Array<{ code: Role; name: string; description: string; permissions: Permission[] }> = [
  { code: 'ADMIN', name: 'Quản trị', description: 'Toàn quyền (luôn đủ quyền, không giới hạn được)', permissions: [...ALL_PERMISSIONS] },
  {
    code: 'HR',
    name: 'Nhân sự',
    description: 'Quản lý hồ sơ, chấm công, nghỉ phép, con người; xem lương và báo cáo',
    permissions: [...rw('corehr', 'attendance', 'leave', 'people', 'assets', 'checklists', 'recruitment', 'benefits', 'import'), ...r('dashboard', 'payroll', 'reports')],
  },
  {
    code: 'ACCOUNTANT',
    name: 'Kế toán',
    description: 'Tính lương, báo cáo thuế / BHXH, chế độ BHXH; xem dữ liệu nhân sự',
    permissions: [...rw('payroll', 'reports', 'benefits'), ...r('dashboard', 'corehr', 'attendance', 'leave', 'people', 'assets', 'checklists', 'import')],
  },
  { code: 'EMPLOYEE', name: 'Nhân viên', description: 'Chỉ dùng cổng nhân viên (dữ liệu của chính mình)', permissions: [] },
];

/** Tạo các nhóm hệ thống nếu chưa có (không ghi đè quyền quản trị đã sửa). */
export async function ensureSystemGroups() {
  for (const g of SYSTEM_GROUPS) {
    await prisma.permissionGroup.upsert({
      where: { code: g.code },
      update: { isSystem: true },
      create: { ...g, isSystem: true },
    });
  }
  invalidatePermissions();
}

// ---------- Tính quyền hiệu lực (cache 60 giây) ----------
let groupsCache: { at: number; byId: Map<string, string[]>; byCode: Map<string, string[]> } | null = null;

export function invalidatePermissions() {
  groupsCache = null;
}

async function groups() {
  if (groupsCache && Date.now() - groupsCache.at < 60_000) return groupsCache;
  const rows = await prisma.permissionGroup.findMany({ select: { id: true, code: true, permissions: true } });
  groupsCache = { at: Date.now(), byId: new Map(rows.map((g) => [g.id, g.permissions])), byCode: new Map(rows.map((g) => [g.code, g.permissions])) };
  return groupsCache;
}

export function effectivePermissions(
  user: { role: Role; permissionGroupIds: string[] },
  g: { byId: Map<string, string[]>; byCode: Map<string, string[]> },
): Permission[] {
  if (user.role === 'ADMIN') return [...ALL_PERMISSIONS];
  const lists = user.permissionGroupIds.length
    ? user.permissionGroupIds.map((id) => g.byId.get(id) ?? [])
    : [g.byCode.get(user.role) ?? SYSTEM_GROUPS.find((s) => s.code === user.role)?.permissions ?? []];
  const set = new Set<string>(lists.flat());
  // Có quyền sửa thì có quyền xem.
  for (const p of [...set]) if (p.endsWith(':write')) set.add(p.replace(':write', ':read'));
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

export async function permissionsOf(user: { role: Role; permissionGroupIds: string[] }) {
  return effectivePermissions(user, await groups());
}
