import { Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { sendMail } from '../../common/mailer';
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

// ---------- Nhắc việc định kỳ ----------
// Server có thể ngủ lúc 7:00 (Render miễn phí) → khi có người mở thông báo thì chạy bù nếu hôm nay chưa chạy.
// Không chờ: lần mở đầu tiên trong ngày vẫn trả về ngay, thông báo mới hiện ở lần cập nhật kế tiếp.
async function dailyDigest(_user: AuthUser) {
  const { runDailyJobs } = await import('../jobs/daily');
  void runDailyJobs().catch((e) => console.error('Nhắc việc hằng ngày lỗi:', e instanceof Error ? e.message : e));
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
