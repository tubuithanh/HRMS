import { getSettings } from '../settings/settings.service';
import { prisma } from '../../config/prisma';
import { sendMail } from '../../common/mailer';
import { addDays, formatDate, todayDate } from '../../common/utils/dates';
import { loadManagerMap } from '../approval/approval.service';
import { OWNERS } from '../checklist/checklist.service';
import { withoutScope } from '../../common/scope/scope';

/**
 * NHẮC VIỆC HẰNG NGÀY — chạy một lần mỗi ngày (sau 7:00 giờ Việt Nam):
 * - Nhân sự / quản trị: hợp đồng hết hạn trong 30 ngày, sinh nhật hôm nay, hết thử việc trong 7 ngày,
 *   chứng chỉ đào tạo hết hạn trong 30 ngày, giấy phép lao động / thẻ tạm trú hết hạn trong 60 ngày.
 * - Người được giao việc tiếp nhận / nghỉ việc: việc đến hạn hôm nay hoặc đã quá hạn.
 * - Kỳ đánh giá còn ≤ 3 ngày: nhắc người chưa tự đánh giá và quản lý chưa chấm.
 * Mỗi mục có khoá chống trùng → không nhắc lại. Ai có email (và đã cấu hình SMTP) nhận thêm một email tổng hợp.
 *
 * Kích hoạt: lịch trong server (khi đang chạy), tự bù khi có người dùng mở thông báo, hoặc dịch vụ ngoài gọi
 * POST /api/cron/daily (kèm CRON_SECRET) — cần cho Render gói miễn phí vì server ngủ khi không có người dùng.
 */

const STATE_KEY = 'jobsState';

interface Item {
  userId: string;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey: string;
}

const dmy = (d: Date) => formatDate(d).split('-').reverse().join('/');

async function usersByRole(roles: Array<'ADMIN' | 'HR' | 'ACCOUNTANT'>) {
  return (await prisma.user.findMany({ where: { isActive: true, role: { in: roles } }, select: { id: true } })).map((u) => u.id);
}
async function usersOfEmployments(ids: string[]) {
  const rows = await prisma.user.findMany({
    where: { isActive: true, person: { employments: { some: { id: { in: ids } } } } },
    select: { id: true, person: { select: { employments: { where: { id: { in: ids } }, select: { id: true } } } } },
  });
  const map = new Map<string, string[]>();
  for (const u of rows) for (const e of u.person?.employments ?? []) map.set(e.id, [...(map.get(e.id) ?? []), u.id]);
  return map;
}

/** Tạo các mục chưa có (theo khoá chống trùng), trả về mục mới theo người nhận. */
async function deliver(items: Item[]) {
  if (items.length === 0) return new Map<string, Item[]>();
  const existing = await prisma.notification.findMany({
    where: { dedupeKey: { in: [...new Set(items.map((i) => i.dedupeKey))] }, userId: { in: [...new Set(items.map((i) => i.userId))] } },
    select: { userId: true, dedupeKey: true },
  });
  const seen = new Set(existing.map((e) => `${e.userId}|${e.dedupeKey}`));
  const fresh = items.filter((i) => {
    const k = `${i.userId}|${i.dedupeKey}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (fresh.length) {
    await prisma.notification.createMany({
      data: fresh.map((i) => ({ userId: i.userId, title: i.title, body: i.body ?? null, link: i.link ?? null, dedupeKey: i.dedupeKey })),
      skipDuplicates: true,
    });
  }
  const byUser = new Map<string, Item[]>();
  for (const i of fresh) byUser.set(i.userId, [...(byUser.get(i.userId) ?? []), i]);
  return byUser;
}

/** Tính toàn bộ mục nhắc việc của ngày (không ghi). */
export async function collectDailyItems(today = todayDate()): Promise<Item[]> {
  const items: Item[] = [];
  const cfg = (await getSettings()).reminders;
  const staff = await usersByRole(['ADMIN', 'HR']);
  const toStaff = (it: Omit<Item, 'userId'>) => staff.forEach((userId) => items.push({ ...it, userId }));
  const working = { status: { in: ['ACTIVE', 'PROBATION'] as Array<'ACTIVE' | 'PROBATION'> }, isDelete: false };

  // Hợp đồng hết hạn trong 30 ngày
  const contracts = await prisma.laborContract.findMany({
    where: { isDelete: false, parentId: null, terminatedDate: null, endDate: { gte: today, lte: addDays(today, cfg.contractDays) }, employment: working },
    select: { id: true, contractNo: true, endDate: true, employment: { select: { person: { select: { id: true, fullName: true } } } } },
  });
  for (const c of contracts) {
    toStaff({ title: `Hợp đồng sắp hết hạn: ${c.employment.person.fullName}`, body: `Hợp đồng ${c.contractNo} hết hạn ngày ${dmy(c.endDate!)}. Gia hạn hoặc ký hợp đồng mới.`, link: `/persons/${c.employment.person.id}`, dedupeKey: `contract:${c.id}` });
  }

  // Sinh nhật hôm nay
  const md = `${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  const birthdays = await prisma.$queryRaw<Array<{ id: string; fullName: string }>>`
    SELECT p.id, p."fullName" FROM person p
    WHERE p."isDelete" = false AND to_char(p."dateOfBirth", 'MM-DD') = ${md}
      AND EXISTS (SELECT 1 FROM employment e WHERE e."personId" = p.id AND e."isDelete" = false AND e.status IN ('ACTIVE', 'PROBATION'))`;
  for (const p of birthdays) toStaff({ title: `🎂 Sinh nhật hôm nay: ${p.fullName}`, link: `/persons/${p.id}`, dedupeKey: `birthday:${formatDate(today)}:${p.id}` });

  // Hết thử việc trong 7 ngày
  const probation = await prisma.employment.findMany({
    where: { isDelete: false, status: 'PROBATION', probationEndDate: { gte: today, lte: addDays(today, cfg.probationDays) } },
    select: { id: true, probationEndDate: true, person: { select: { id: true, fullName: true } } },
  });
  for (const e of probation) {
    toStaff({ title: `Sắp hết thử việc: ${e.person.fullName}`, body: `Hết thử việc ngày ${dmy(e.probationEndDate!)} — đánh giá và ký hợp đồng chính thức.`, link: `/persons/${e.person.id}`, dedupeKey: `probation:${e.id}` });
  }

  // Chứng chỉ đào tạo hết hạn trong 30 ngày
  const certs = await prisma.trainingParticipant.findMany({
    where: { result: 'PASSED', certificateExpiry: { gte: today, lte: addDays(today, cfg.certificateDays) }, employment: working },
    select: { id: true, certificateNo: true, certificateExpiry: true, course: { select: { name: true } }, employment: { select: { person: { select: { id: true, fullName: true } } } } },
  });
  for (const c of certs) {
    toStaff({ title: `Chứng chỉ sắp hết hạn: ${c.employment.person.fullName}`, body: `${c.course.name}${c.certificateNo ? ` (${c.certificateNo})` : ''} hết hạn ${dmy(c.certificateExpiry!)} — xếp lịch đào tạo lại.`, link: `/persons/${c.employment.person.id}`, dedupeKey: `cert:${c.id}` });
  }

  // Giấy phép lao động / thẻ tạm trú hết hạn trong 60 ngày
  const [permits, cards] = await Promise.all([
    prisma.workPermit.findMany({ where: { expiryDate: { gte: today, lte: addDays(today, cfg.permitDays) }, person: { isDelete: false, employments: { some: working } } }, select: { id: true, expiryDate: true, person: { select: { id: true, fullName: true } } } }),
    prisma.residenceCard.findMany({ where: { expiryDate: { gte: today, lte: addDays(today, cfg.permitDays) }, person: { isDelete: false, employments: { some: working } } }, select: { id: true, expiryDate: true, person: { select: { id: true, fullName: true } } } }),
  ]);
  for (const p of permits) toStaff({ title: `Giấy phép lao động sắp hết hạn: ${p.person.fullName}`, body: `Hết hạn ${dmy(p.expiryDate!)} — gia hạn trước ít nhất 5 ngày làm việc.`, link: `/persons/${p.person.id}`, dedupeKey: `permit:${p.id}` });
  for (const c of cards) toStaff({ title: `Thẻ tạm trú sắp hết hạn: ${c.person.fullName}`, body: `Hết hạn ${dmy(c.expiryDate!)}.`, link: `/persons/${c.person.id}`, dedupeKey: `residence:${c.id}` });

  // Việc tiếp nhận / nghỉ việc đến hạn hoặc quá hạn → người phụ trách
  const tasks = await prisma.checklistTask.findMany({
    where: { doneAt: null, dueDate: { lte: today }, checklist: { status: 'OPEN' } },
    select: { id: true, title: true, owner: true, dueDate: true, checklist: { select: { id: true, kind: true, employmentId: true, employment: { select: { person: { select: { fullName: true } } } } } } },
  });
  if (tasks.length) {
    const [hr, acc, admin] = await Promise.all([usersByRole(['HR']), usersByRole(['ACCOUNTANT']), usersByRole(['ADMIN'])]);
    const managers = await loadManagerMap();
    const mgrIds = [...new Set(tasks.filter((t) => t.owner === 'MANAGER').map((t) => managers.get(t.checklist.employmentId)).filter((x): x is string => !!x))];
    const empUsers = await usersOfEmployments([...new Set([...mgrIds, ...tasks.filter((t) => t.owner === 'EMPLOYEE').map((t) => t.checklist.employmentId)])]);
    for (const t of tasks) {
      const recipients =
        t.owner === 'HR' ? hr
        : t.owner === 'ACCOUNTANT' ? acc
        : t.owner === 'IT' ? admin
        : t.owner === 'MANAGER' ? empUsers.get(managers.get(t.checklist.employmentId) ?? '') ?? []
        : empUsers.get(t.checklist.employmentId) ?? [];
      const overdue = t.dueDate! < today;
      for (const userId of recipients) {
        items.push({
          userId,
          title: `${overdue ? 'Quá hạn' : 'Đến hạn hôm nay'}: ${t.title}`,
          body: `${t.checklist.kind === 'ONBOARDING' ? 'Tiếp nhận' : 'Nghỉ việc'} ${t.checklist.employment.person.fullName} · ${OWNERS[t.owner as keyof typeof OWNERS]} · hạn ${dmy(t.dueDate!)}`,
          link: `/tasks/${t.checklist.id}`,
          dedupeKey: `task:${t.id}:${overdue ? 'overdue' : 'due'}`,
        });
      }
    }
  }

  // Kỳ đánh giá sắp hết hạn (≤ 3 ngày)
  const reviews = await prisma.performanceReview.findMany({
    where: { status: { in: ['SELF', 'MANAGER'] }, cycle: { status: 'OPEN', dueDate: { gte: today, lte: addDays(today, cfg.reviewDays) } } },
    select: { id: true, status: true, employmentId: true, reviewerEmploymentId: true, cycle: { select: { name: true, dueDate: true } }, employment: { select: { person: { select: { fullName: true } } } } },
  });
  if (reviews.length) {
    const ids = [...new Set(reviews.flatMap((r) => (r.status === 'SELF' ? [r.employmentId] : r.reviewerEmploymentId ? [r.reviewerEmploymentId] : [])))];
    const u = await usersOfEmployments(ids);
    for (const r of reviews) {
      const target = r.status === 'SELF' ? r.employmentId : r.reviewerEmploymentId;
      for (const userId of target ? u.get(target) ?? [] : []) {
        items.push({
          userId,
          title: r.status === 'SELF' ? `Sắp hết hạn tự đánh giá: ${r.cycle.name}` : `Sắp hết hạn chấm điểm: ${r.employment.person.fullName}`,
          body: `Hạn ${dmy(r.cycle.dueDate)}`,
          link: '/me/reviews',
          dedupeKey: `review-due:${r.id}:${r.status}`,
        });
      }
    }
  }
  return items;
}

let running: Promise<unknown> | null = null;

/**
 * Chạy nhắc việc nếu hôm nay chưa chạy (và đã qua 7:00). force = chạy ngay, bỏ qua giờ và trạng thái.
 * An toàn khi gọi nhiều lần / đồng thời.
 */
export async function runDailyJobs(opts: { force?: boolean; now?: Date } = {}) {
  if (running) return running;
  running = withoutScope(async () => {
    const now = opts.now ?? new Date();
    const today = todayDate(now);
    const key = formatDate(today);
    const state = await prisma.systemSetting.findUnique({ where: { key: STATE_KEY } });
    const last = (state?.value as { lastDailyRun?: string } | null)?.lastDailyRun;
    if (!opts.force && (last === key || now.getHours() < (await getSettings()).reminders.runAfterHour)) return { skipped: true, lastDailyRun: last ?? null };
    const items = await collectDailyItems(today);
    const byUser = await deliver(items);
    // Email tổng hợp cho người có mục mới
    let emails = 0;
    if (byUser.size) {
      const users = await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] }, person: { email: { not: null } } }, select: { id: true, person: { select: { email: true } } } });
      for (const u of users) {
        const list = byUser.get(u.id)!;
        await sendMail(u.person!.email!, `[ATECH HRM] ${list.length} việc cần chú ý hôm nay`, list.map((i) => `• ${i.title}${i.body ? `\n  ${i.body}` : ''}`).join('\n'));
        emails++;
      }
    }
    const summary = { date: key, items: items.length, created: [...byUser.values()].reduce((n, l) => n + l.length, 0), users: byUser.size, emails, ranAt: new Date().toISOString() };
    await prisma.systemSetting.upsert({ where: { key: STATE_KEY }, update: { value: { lastDailyRun: key, lastSummary: summary } }, create: { key: STATE_KEY, value: { lastDailyRun: key, lastSummary: summary } } });
    console.log(`⏰ Nhắc việc ${key}: ${summary.created} thông báo mới cho ${summary.users} người, ${emails} email`);
    return { skipped: false, ...summary };
  });
  try {
    return await running;
  } finally {
    running = null;
  }
}

export async function jobsState() {
  const s = await prisma.systemSetting.findUnique({ where: { key: STATE_KEY } });
  return (s?.value as object | null) ?? null;
}

/** Lịch trong server: kiểm tra 15 phút một lần (chỉ chạy khi server đang thức). */
export function startScheduler() {
  const tick = () => runDailyJobs().catch((e) => console.error('Nhắc việc hằng ngày lỗi:', e instanceof Error ? e.message : e));
  setTimeout(tick, 15_000);
  return setInterval(tick, 15 * 60_000);
}
