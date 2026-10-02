import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/AppError';
import { ForbiddenError } from '../../common/middleware/auth';
import { addDays, todayDate } from '../../common/utils/dates';
import { AuthUser } from '../auth/token';
import { loadManagerMap } from '../approval/approval.service';
import { notify } from '../notification/notification.service';

/**
 * Danh sách việc cần làm khi tiếp nhận (onboarding) / cho nghỉ việc (offboarding).
 * Mỗi việc giao cho một vai trò: HR, IT (quản trị), MANAGER (quản lý trực tiếp), EMPLOYEE (chính nhân viên), ACCOUNTANT.
 */

export const OWNERS = { HR: 'Nhân sự', IT: 'IT / quản trị', MANAGER: 'Quản lý trực tiếp', EMPLOYEE: 'Nhân viên', ACCOUNTANT: 'Kế toán' } as const;
type Owner = keyof typeof OWNERS;
const ownerEnum = z.enum(Object.keys(OWNERS) as [Owner, ...Owner[]]);

export const templateSchema = z.object({
  kind: z.enum(['ONBOARDING', 'OFFBOARDING']),
  name: z.string().trim().min(1).max(150),
  isDefault: z.boolean().default(false),
  items: z.array(z.object({ title: z.string().trim().min(1).max(200), owner: ownerEnum, dueDays: z.number().int().min(-60).max(180) })).min(1).max(50),
});

export const DEFAULT_TEMPLATES: Array<z.infer<typeof templateSchema>> = [
  {
    kind: 'ONBOARDING',
    name: 'Tiếp nhận nhân viên mới',
    isDefault: true,
    items: [
      { title: 'Ký hợp đồng thử việc / hợp đồng lao động', owner: 'HR', dueDays: 0 },
      { title: 'Thu hồ sơ: CCCD, sơ yếu lý lịch, bằng cấp, giấy khám sức khoẻ', owner: 'HR', dueDays: 3 },
      { title: 'Khai mã số thuế, người phụ thuộc, số tài khoản nhận lương', owner: 'EMPLOYEE', dueDays: 5 },
      { title: 'Tạo email, tài khoản phần mềm, tài khoản ATECH HRM', owner: 'IT', dueDays: 0 },
      { title: 'Cấp máy tính / dụng cụ, thẻ ra vào, đồng phục', owner: 'HR', dueDays: 0 },
      { title: 'Đăng ký mã chấm công trên máy', owner: 'HR', dueDays: 1 },
      { title: 'Giới thiệu đội nhóm, giao việc tuần đầu', owner: 'MANAGER', dueDays: 1 },
      { title: 'Đào tạo hội nhập: nội quy, an toàn lao động', owner: 'HR', dueDays: 7 },
      { title: 'Báo tăng lao động tham gia BHXH (D02-LT)', owner: 'ACCOUNTANT', dueDays: 30 },
      { title: 'Đánh giá kết thúc thử việc', owner: 'MANAGER', dueDays: 55 },
    ],
  },
  {
    kind: 'OFFBOARDING',
    name: 'Cho nghỉ việc',
    isDefault: true,
    items: [
      { title: 'Bàn giao công việc, tài liệu', owner: 'MANAGER', dueDays: 0 },
      { title: 'Khoá email, tài khoản phần mềm', owner: 'IT', dueDays: 0 },
      { title: 'Quyết toán lương, trợ cấp thôi việc, phép năm', owner: 'ACCOUNTANT', dueDays: 7 },
      { title: 'Báo giảm lao động BHXH (D02-LT), chốt sổ BHXH', owner: 'ACCOUNTANT', dueDays: 30 },
      { title: 'Cấp chứng từ khấu trừ thuế TNCN (nếu được yêu cầu)', owner: 'ACCOUNTANT', dueDays: 7 },
      { title: 'Trả sổ BHXH và giấy tờ gốc', owner: 'HR', dueDays: 14 },
    ],
  },
];

export async function ensureDefaultTemplates() {
  for (const t of DEFAULT_TEMPLATES) {
    const exists = await prisma.checklistTemplate.findFirst({ where: { kind: t.kind, isDefault: true } });
    if (!exists) await prisma.checklistTemplate.create({ data: { ...t, items: t.items } });
  }
}

const empSelect = { select: { id: true, codeEmp: true, dateHire: true, dateTerminate: true, person: { select: { id: true, fullName: true } } } } as const;

async function myEmploymentIds(user: AuthUser) {
  if (!user.personId) return [];
  return (await prisma.employment.findMany({ where: { personId: user.personId, isDelete: false }, select: { id: true } })).map((e) => e.id);
}

/** Vai trò của người dùng đối với một danh sách: được đánh dấu việc nào. */
async function ownersFor(user: AuthUser, employmentId: string): Promise<Set<Owner>> {
  const s = new Set<Owner>();
  if (user.role === 'ADMIN') (Object.keys(OWNERS) as Owner[]).forEach((o) => s.add(o));
  if (user.role === 'HR') s.add('HR');
  if (user.role === 'ACCOUNTANT') s.add('ACCOUNTANT');
  const mine = await myEmploymentIds(user);
  if (mine.includes(employmentId)) s.add('EMPLOYEE');
  const mgr = (await loadManagerMap()).get(employmentId);
  if (mgr && mine.includes(mgr)) s.add('MANAGER');
  return s;
}

export const checklistService = {
  listTemplates() {
    return prisma.checklistTemplate.findMany({ orderBy: [{ kind: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }] });
  },
  async saveTemplate(id: string | null, input: z.infer<typeof templateSchema>) {
    return prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.checklistTemplate.updateMany({ where: { kind: input.kind, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
      return id ? tx.checklistTemplate.update({ where: { id }, data: { ...input, items: input.items } }) : tx.checklistTemplate.create({ data: { ...input, items: input.items } });
    });
  },
  async removeTemplate(id: string) {
    await prisma.checklistTemplate.delete({ where: { id } }).catch(() => {
      throw new NotFoundError('Không tìm thấy mẫu');
    });
  },

  /**
   * Mở danh sách việc cho một nhân viên từ mẫu (mặc định của loại đó).
   * Nghỉ việc: tự thêm việc "Thu hồi tài sản" cho từng tài sản chưa trả.
   */
  async start(employmentId: string, kind: 'ONBOARDING' | 'OFFBOARDING', startDate: Date, templateId?: string) {
    await ensureDefaultTemplates();
    const tpl = templateId
      ? await prisma.checklistTemplate.findUnique({ where: { id: templateId } })
      : await prisma.checklistTemplate.findFirst({ where: { kind, isDefault: true } });
    if (!tpl) throw new NotFoundError('Không tìm thấy mẫu danh sách việc');
    const open = await prisma.employeeChecklist.findFirst({ where: { employmentId, kind, status: 'OPEN' } });
    if (open) throw new ConflictError('Nhân viên đã có danh sách việc loại này đang mở');
    const items = tpl.items as Array<{ title: string; owner: Owner; dueDays: number }>;
    const assets = kind === 'OFFBOARDING' ? await prisma.assetAssignment.findMany({ where: { employmentId, returnedAt: null }, include: { asset: true } }) : [];
    const cl = await prisma.employeeChecklist.create({
      data: {
        employmentId,
        kind,
        name: tpl.name,
        startDate,
        tasks: {
          create: [
            ...items.map((it, i) => ({ sortOrder: i, title: it.title, owner: it.owner, dueDate: addDays(startDate, it.dueDays) })),
            ...assets.map((a, i) => ({
              sortOrder: items.length + i,
              title: `Thu hồi tài sản: ${a.asset.code} · ${a.asset.name}`,
              owner: 'HR',
              dueDate: startDate,
              refType: 'ASSET_RETURN',
              refId: a.id,
            })),
          ],
        },
      },
      include: { employment: empSelect, tasks: true },
    });
    void notify.roles(['HR'], {
      title: `${kind === 'ONBOARDING' ? 'Tiếp nhận' : 'Nghỉ việc'}: ${cl.employment.person.fullName}`,
      body: `${cl.tasks.length} việc cần làm${assets.length ? ` · ${assets.length} tài sản cần thu hồi` : ''}`,
      link: `/checklists/${cl.id}`,
    });
    return cl;
  },

  async list(filter: { kind?: string; status?: string }) {
    const rows = await prisma.employeeChecklist.findMany({
      where: { ...(filter.kind ? { kind: filter.kind } : {}), ...(filter.status ? { status: filter.status } : {}) },
      include: { employment: empSelect, tasks: { select: { doneAt: true, dueDate: true, owner: true } } },
      orderBy: [{ status: 'desc' }, { startDate: 'desc' }],
    });
    const today = todayDate();
    return rows.map(({ tasks, ...c }) => ({
      ...c,
      total: tasks.length,
      done: tasks.filter((t) => t.doneAt).length,
      overdue: tasks.filter((t) => !t.doneAt && t.dueDate && t.dueDate < today).length,
    }));
  },

  async get(id: string, user: AuthUser) {
    const c = await prisma.employeeChecklist.findUnique({ where: { id }, include: { employment: empSelect, tasks: { orderBy: { sortOrder: 'asc' } } } });
    if (!c) throw new NotFoundError('Không tìm thấy danh sách việc');
    const owners = await ownersFor(user, c.employmentId);
    if (owners.size === 0) throw new NotFoundError('Không tìm thấy danh sách việc');
    return { ...c, myOwners: [...owners] };
  },

  async toggleTask(taskId: string, user: AuthUser, done: boolean, note?: string) {
    const t = await prisma.checklistTask.findUnique({ where: { id: taskId }, include: { checklist: true } });
    if (!t) throw new NotFoundError('Không tìm thấy việc');
    const owners = await ownersFor(user, t.checklist.employmentId);
    if (!owners.has(t.owner as Owner)) throw new ForbiddenError(`Việc này do ${OWNERS[t.owner as Owner]} thực hiện`);
    if (t.refType === 'ASSET_RETURN' && done) {
      const as = await prisma.assetAssignment.findUnique({ where: { id: t.refId! } });
      if (as && !as.returnedAt) throw new ConflictError('Ghi nhận thu hồi ở trang Tài sản — việc này tự đánh dấu xong');
    }
    await prisma.checklistTask.update({ where: { id: taskId }, data: done ? { doneAt: new Date(), doneById: user.id, note: note ?? t.note } : { doneAt: null, doneById: null } });
    // Đủ hết việc → đóng danh sách; bỏ đánh dấu → mở lại.
    const remaining = await prisma.checklistTask.count({ where: { checklistId: t.checklistId, doneAt: null } });
    await prisma.employeeChecklist.update({ where: { id: t.checklistId }, data: { status: remaining === 0 ? 'DONE' : 'OPEN' } });
    return { remaining };
  },

  async addTask(checklistId: string, input: { title: string; owner: Owner; dueDate?: Date }) {
    const max = await prisma.checklistTask.aggregate({ where: { checklistId }, _max: { sortOrder: true } });
    await prisma.employeeChecklist.update({ where: { id: checklistId }, data: { status: 'OPEN' } });
    return prisma.checklistTask.create({ data: { checklistId, title: input.title, owner: input.owner, dueDate: input.dueDate ?? null, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  },

  async remove(id: string) {
    await prisma.employeeChecklist.delete({ where: { id } }).catch(() => {
      throw new NotFoundError('Không tìm thấy danh sách việc');
    });
  },

  /** Việc chưa xong của người dùng (theo vai trò, là quản lý trực tiếp, hoặc là chính nhân viên). */
  async myTasks(user: AuthUser) {
    const open = await prisma.employeeChecklist.findMany({
      where: { status: 'OPEN' },
      include: { employment: empSelect, tasks: { where: { doneAt: null }, orderBy: { sortOrder: 'asc' } } },
    });
    const mine = await myEmploymentIds(user);
    const managers = await loadManagerMap();
    const out = [];
    for (const c of open) {
      const roles = new Set<Owner>();
      if (user.role === 'ADMIN') roles.add('IT');
      if (user.role === 'HR' || user.role === 'ADMIN') roles.add('HR');
      if (user.role === 'ACCOUNTANT' || user.role === 'ADMIN') roles.add('ACCOUNTANT');
      if (mine.includes(c.employmentId)) roles.add('EMPLOYEE');
      const m = managers.get(c.employmentId);
      if (m && mine.includes(m)) roles.add('MANAGER');
      for (const t of c.tasks) if (roles.has(t.owner as Owner)) out.push({ ...t, checklist: { id: c.id, kind: c.kind, name: c.name, employment: c.employment } });
    }
    return out.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
  },
};
