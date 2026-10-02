import { Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { sendMail } from '../../common/mailer';
import { addDays, formatDate, todayDate } from '../../common/utils/dates';
import { AuthUser } from '../auth/token';

/**
 * Thông báo trong ứng dụng (chuông trên thanh menu), kèm email nếu người nhận có email
 * và hệ thống đã cấu hình SMTP. Gửi thông báo KHÔNG bao giờ làm hỏng thao tác chính:
 * mọi lỗi chỉ ghi log.
 */

export interface NoticeInput {
  title: string;
  body?: string;
  link?: string;
  /** Chống gửi trùng (vd thông báo sinh nhật mỗi ngày một lần). */
  dedupeKey?: string;
  /** Gửi kèm email (chỉ cho việc cần xử lý / kết quả quan trọng). */
  email?: boolean;
}

async function deliver(userIds: string[], n: NoticeInput) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await prisma.notification.createMany({
    data: ids.map((userId) => ({ userId, title: n.title, body: n.body ?? null, link: n.link ?? null, dedupeKey: n.dedupeKey ?? null })),
    skipDuplicates: true,
  });
  if (n.email) {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, isActive: true, person: { email: { not: null } } },
      select: { person: { select: { email: true } } },
    });
    for (const u of users) await sendMail(u.person!.email!, `[ATECH HRM] ${n.title}`, `${n.body ?? ''}\n\nXem chi tiết trong ATECH HRM.`);
  }
}

/** Bọc để lỗi thông báo không lan ra thao tác nghiệp vụ. */
function safe<A extends unknown[]>(fn: (...a: A) => Promise<void>) {
  return async (...a: A) => {
    try {
      await fn(...a);
    } catch (e) {
      console.error('Gửi thông báo thất bại:', e instanceof Error ? e.message : e);
    }
  };
}

export const notify = {
  users: safe(deliver),

  /** Tới tài khoản gắn với nhân viên (hợp đồng lao động). */
  employment: safe(async (employmentIds: string | string[], n: NoticeInput) => {
    const ids = Array.isArray(employmentIds) ? employmentIds : [employmentIds];
    const users = await prisma.user.findMany({
      where: { isActive: true, person: { employments: { some: { id: { in: ids } } } } },
      select: { id: true },
    });
    await deliver(users.map((u) => u.id), n);
  }),

  /** Tới mọi tài khoản có một trong các vai trò. */
  roles: safe(async (roles: Role[], n: NoticeInput) => {
    const users = await prisma.user.findMany({ where: { isActive: true, role: { in: roles } }, select: { id: true } });
    await deliver(users.map((u) => u.id), n);
  }),
};

// ---------- Nhắc việc định kỳ (sinh khi người dùng mở thông báo, tối đa 1 lần / giờ / người) ----------

const lastDigest = new Map<string, number>();

async function dailyDigest(user: AuthUser) {
  const last = lastDigest.get(user.id) ?? 0;
  if (Date.now() - last < 60 * 60 * 1000) return;
  lastDigest.set(user.id, Date.now());
  const today = todayDate();
  const key = formatDate(today);
  const rows: Array<{ userId: string; title: string; body: string | null; link: string | null; dedupeKey: string }> = [];

  if (user.role === 'ADMIN' || user.role === 'HR') {
    // Hợp đồng hết hạn trong 30 ngày tới.
    const expiring = await prisma.laborContract.findMany({
      where: {
        isDelete: false,
        parentId: null,
        terminatedDate: null,
        endDate: { gte: today, lte: addDays(today, 30) },
        employment: { status: { in: ['ACTIVE', 'PROBATION'] } },
      },
      select: { id: true, contractNo: true, endDate: true, employment: { select: { person: { select: { id: true, fullName: true } } } } },
    });
    for (const c of expiring) {
      const p = c.employment.person;
      rows.push({
        userId: user.id,
        title: `Hợp đồng sắp hết hạn: ${p.fullName}`,
        body: `Hợp đồng ${c.contractNo} hết hạn ngày ${formatDate(c.endDate!).split('-').reverse().join('/')}. Gia hạn hoặc ký hợp đồng mới.`,
        link: `/persons/${p.id}`,
        dedupeKey: `contract:${c.id}`,
      });
    }
    // Sinh nhật hôm nay.
    const md = `${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    const people = await prisma.$queryRaw<Array<{ id: string; fullName: string }>>`
      SELECT p.id, p."fullName" FROM person p
      WHERE p."isDelete" = false AND to_char(p."dateOfBirth", 'MM-DD') = ${md}
        AND EXISTS (SELECT 1 FROM employment e WHERE e."personId" = p.id AND e."isDelete" = false AND e.status IN ('ACTIVE', 'PROBATION'))`;
    for (const p of people) {
      rows.push({ userId: user.id, title: `🎂 Sinh nhật hôm nay: ${p.fullName}`, body: null, link: `/persons/${p.id}`, dedupeKey: `birthday:${key}:${p.id}` });
    }
  }
  if (rows.length) await prisma.notification.createMany({ data: rows, skipDuplicates: true });
}

export const notificationService = {
  async list(user: AuthUser, limit = 30) {
    await dailyDigest(user).catch((e) => console.error('Nhắc việc định kỳ lỗi:', e));
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: limit }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items, unread };
  },

  async unreadCount(user: AuthUser) {
    await dailyDigest(user).catch(() => undefined);
    return prisma.notification.count({ where: { userId: user.id, readAt: null } });
  },

  async markRead(user: AuthUser, ids?: string[]) {
    const r = await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { count: r.count };
  },
};
