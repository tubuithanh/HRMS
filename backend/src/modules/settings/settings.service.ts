import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../common/errors/AppError';

/**
 * CẤU HÌNH HỆ THỐNG — lưu trong bảng system_setting, mỗi nhóm một dòng (JSON).
 * Giá trị thiếu lấy mặc định dưới đây, nên thêm tham số mới không cần migration.
 * Đọc qua getSettings() (có cache ngắn); ghi qua updateSettings() (xoá cache).
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:mm');

export const settingsSchema = z.object({
  attendance: z
    .object({
      workStart: hhmm,
      workEnd: hhmm,
      lateGraceMinutes: z.number().int().min(0).max(120),
      /** Phụ cấp làm việc ban đêm, % lương giờ — tối thiểu 30% (Điều 98 BLLĐ 2019). */
      nightAllowancePercent: z.number().int().min(30, 'Tối thiểu 30% (Điều 98 BLLĐ)').max(200),
      /** Trừ lương theo số phút đi muộn / về sớm (chỉ trả lương cho thời gian thực làm). */
      deductLateEarly: z.boolean(),
    })
    .refine((v) => v.workEnd > v.workStart, { message: 'Giờ tan ca phải sau giờ vào làm', path: ['workEnd'] }),
  payroll: z.object({
    defaultRegion: z.number().int().min(1).max(4),
    payDay: z.number().int().min(1).max(28),
  }),
  approval: z.object({
    twoStep: z.boolean(),
  }),
  /** Giới hạn vị trí khi nhân viên tự chấm công. */
  checkin: z
    .object({
      mode: z.enum(['OFF', 'GPS', 'IP', 'GPS_OR_IP']),
      lat: z.number().min(-90).max(90).nullable(),
      lng: z.number().min(-180).max(180).nullable(),
      radiusMeters: z.number().int().min(30).max(5000),
      /** IP hoặc dải CIDR, cách nhau bởi dấu phẩy / xuống dòng. */
      allowedIps: z.string().max(2000),
    })
    .refine((v) => !v.mode.includes('GPS') || (v.lat !== null && v.lng !== null), { message: 'Cần toạ độ văn phòng', path: ['lat'] })
    .refine((v) => !v.mode.includes('IP') || v.allowedIps.trim().length > 0, { message: 'Cần ít nhất một IP', path: ['allowedIps'] }),
  security: z.object({
    maxFailedLogins: z.number().int().min(3).max(20),
    lockMinutes: z.number().int().min(1).max(1440),
    sessionHours: z.number().int().min(1).max(72),
    resetTokenMinutes: z.number().int().min(5).max(1440),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;
type Group = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  attendance: { workStart: '08:30', workEnd: '17:30', lateGraceMinutes: 0, nightAllowancePercent: 30, deductLateEarly: false },
  payroll: { defaultRegion: 1, payDay: 5 },
  approval: { twoStep: true },
  checkin: { mode: 'OFF', lat: null, lng: null, radiusMeters: 200, allowedIps: '' },
  security: { maxFailedLogins: 5, lockMinutes: 15, sessionHours: 8, resetTokenMinutes: 30 },
};

let cache: { at: number; value: Settings } | null = null;
const CACHE_MS = 15_000;

/** Cấu hình hiện hành (đã gộp với mặc định). */
export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const rows = await prisma.systemSetting.findMany();
  const value = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    const group = r.key as Group;
    if (!(group in value)) continue;
    const merged = { ...value[group], ...(r.value as object) };
    const parsed = settingsSchema.shape[group].safeParse(merged);
    // Dữ liệu cũ không hợp lệ thì giữ mặc định thay vì làm hỏng hệ thống.
    if (parsed.success) (value as Record<Group, unknown>)[group] = parsed.data;
  }
  cache = { at: Date.now(), value };
  return value;
}

/** Cập nhật một hoặc nhiều nhóm. Kiểm tra toàn bộ trước khi ghi. */
export async function updateSettings(patch: Partial<Record<Group, unknown>>): Promise<Settings> {
  const current = await getSettings();
  const next: Record<string, unknown> = {};
  for (const [group, value] of Object.entries(patch)) {
    if (!(group in DEFAULT_SETTINGS)) throw new ValidationError(`Nhóm cấu hình "${group}" không tồn tại`);
    const g = group as Group;
    next[g] = settingsSchema.shape[g].parse({ ...current[g], ...(value as object) });
  }
  await prisma.$transaction(
    Object.entries(next).map(([key, value]) =>
      prisma.systemSetting.upsert({ where: { key }, update: { value: value as object }, create: { key, value: value as object } }),
    ),
  );
  cache = null;
  return getSettings();
}

/** "08:30" → { hour: 8, minute: 30 } */
export function parseHHmm(s: string) {
  const [h, m] = s.split(':').map(Number);
  return { hour: h, minute: m };
}

// ---------- Thông tin công ty ----------
export const companySchema = z.object({
  name: z.string().trim().min(1).max(200),
  taxCode: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
});

export async function getCompany() {
  const c = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!c) throw new NotFoundError('Chưa có công ty');
  return c;
}

export async function updateCompany(input: z.infer<typeof companySchema>) {
  const c = await getCompany();
  return prisma.company.update({ where: { id: c.id }, data: input });
}

export function resetSettingsCache() {
  cache = null;
}
