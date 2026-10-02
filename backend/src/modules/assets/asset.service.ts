import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { notify } from '../notification/notification.service';

export const ASSET_CATEGORIES = { LAPTOP: 'Máy tính', PHONE: 'Điện thoại', UNIFORM: 'Đồng phục / BHLĐ', CARD: 'Thẻ ra vào', TOOL: 'Dụng cụ', OTHER: 'Khác' } as const;
export const ASSET_STATUS = { IN_STOCK: 'Trong kho', ASSIGNED: 'Đang cấp', REPAIR: 'Đang sửa', LOST: 'Mất', DISPOSED: 'Thanh lý' } as const;

export const assetSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(200),
  category: z.enum(Object.keys(ASSET_CATEGORIES) as [keyof typeof ASSET_CATEGORIES]),
  serialNo: z.string().trim().max(100).nullable().optional(),
  purchaseDate: z.coerce.date().nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  status: z.enum(['IN_STOCK', 'REPAIR', 'LOST', 'DISPOSED']).optional(),
  note: z.string().max(500).nullable().optional(),
});

export const assignSchema = z.object({
  employmentId: z.string().uuid(),
  assignedAt: z.coerce.date(),
  conditionOut: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

export const returnSchema = z.object({
  returnedAt: z.coerce.date(),
  conditionIn: z.string().max(200).optional(),
  /** Tình trạng tài sản sau khi thu hồi. */
  status: z.enum(['IN_STOCK', 'REPAIR', 'LOST']).default('IN_STOCK'),
  note: z.string().max(500).optional(),
});

const holder = {
  where: { returnedAt: null },
  include: { employment: { select: { id: true, codeEmp: true, person: { select: { id: true, fullName: true } } } } },
  take: 1,
} as const;

export const assetService = {
  list(filter: { status?: string; category?: string; q?: string }) {
    const q = filter.q?.trim();
    return prisma.asset.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.category ? { category: filter.category } : {}),
        ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { serialNo: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      include: { assignments: holder },
      orderBy: { code: 'asc' },
    });
  },

  async get(id: string) {
    const a = await prisma.asset.findUnique({
      where: { id },
      include: { assignments: { include: { employment: { select: { id: true, codeEmp: true, person: { select: { id: true, fullName: true } } } } }, orderBy: { assignedAt: 'desc' } } },
    });
    if (!a) throw new NotFoundError('Không tìm thấy tài sản');
    return a;
  },

  async create(input: z.infer<typeof assetSchema>) {
    if (await prisma.asset.findUnique({ where: { code: input.code } })) throw new ConflictError(`Mã tài sản ${input.code} đã tồn tại`);
    return prisma.asset.create({ data: { ...input, status: input.status ?? 'IN_STOCK', cost: input.cost == null ? null : input.cost.toFixed(4) } });
  },

  async update(id: string, input: Partial<z.infer<typeof assetSchema>>) {
    const a = await this.get(id);
    if (input.status && a.status === 'ASSIGNED') throw new ConflictError('Tài sản đang cấp — thu hồi trước khi đổi trạng thái');
    const { cost, ...rest } = input;
    return prisma.asset.update({ where: { id }, data: { ...rest, ...(cost !== undefined ? { cost: cost === null ? null : cost.toFixed(4) } : {}) } });
  },

  async assign(assetId: string, input: z.infer<typeof assignSchema>) {
    const a = await this.get(assetId);
    if (a.status !== 'IN_STOCK') throw new ConflictError(`Tài sản đang ở trạng thái "${a.status}" — chỉ cấp được tài sản trong kho`);
    const emp = await prisma.employment.findFirst({ where: { id: input.employmentId, isDelete: false, status: { not: 'TERMINATED' } } });
    if (!emp) throw new ValidationError('Nhân viên không tồn tại hoặc đã nghỉ việc');
    const r = await prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id: assetId }, data: { status: 'ASSIGNED' } });
      return tx.assetAssignment.create({ data: { assetId, employmentId: input.employmentId, assignedAt: input.assignedAt, conditionOut: input.conditionOut ?? null, note: input.note ?? null } });
    });
    void notify.employment(input.employmentId, { title: `Bạn được cấp tài sản: ${a.name}`, body: `Mã ${a.code}${a.serialNo ? ` · số serial ${a.serialNo}` : ''}`, link: '/me' });
    return r;
  },

  /** Thu hồi; việc "Thu hồi tài sản" trong danh sách nghỉ việc (nếu có) tự đánh dấu xong. */
  async returnAsset(assignmentId: string, input: z.infer<typeof returnSchema>, userId?: string) {
    const as = await prisma.assetAssignment.findUnique({ where: { id: assignmentId } });
    if (!as) throw new NotFoundError('Không tìm thấy lượt cấp phát');
    if (as.returnedAt) throw new ConflictError('Tài sản đã được thu hồi');
    if (input.returnedAt < as.assignedAt) throw new ValidationError('Ngày thu hồi trước ngày cấp');
    return prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id: as.assetId }, data: { status: input.status } });
      await tx.checklistTask.updateMany({
        where: { refType: 'ASSET_RETURN', refId: assignmentId, doneAt: null },
        data: { doneAt: new Date(), doneById: userId ?? null, note: input.status === 'LOST' ? 'Báo mất' : 'Đã thu hồi' },
      });
      return tx.assetAssignment.update({
        where: { id: assignmentId },
        data: { returnedAt: input.returnedAt, conditionIn: input.conditionIn ?? null, note: input.note ?? as.note },
      });
    });
  },

  /** Tài sản một nhân viên đang giữ và đã trả. */
  byEmployment(employmentId: string) {
    return prisma.assetAssignment.findMany({
      where: { employmentId },
      include: { asset: { select: { id: true, code: true, name: true, category: true, serialNo: true, cost: true } } },
      orderBy: [{ returnedAt: { sort: 'asc', nulls: 'first' } }, { assignedAt: 'desc' }],
    });
  },

  /** Tài sản chưa trả (dùng khi cho nghỉ việc). */
  outstanding(employmentId: string) {
    return prisma.assetAssignment.findMany({ where: { employmentId, returnedAt: null }, include: { asset: true } });
  },
};
