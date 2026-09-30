import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { addDays } from '../../common/utils/dates';

/** Xem nhật ký thao tác — chỉ ADMIN (gắn quyền ở routes.ts). */
const router = Router();

const query = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  username: z.string().trim().optional(),
  kind: z.enum(['REQUEST', 'CHANGE', 'AUTH']).optional(),
  entity: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
  requestId: z.string().trim().optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const f = query.parse(req.query);
    const where: Prisma.AuditLogWhereInput = {
      ...(f.from || f.to ? { at: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: addDays(f.to, 1) } : {}) } } : {}),
      ...(f.username ? { username: { contains: f.username, mode: 'insensitive' } } : {}),
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.entity ? { entity: f.entity } : {}),
      ...(f.entityId ? { entityId: f.entityId } : {}),
      ...(f.requestId ? { requestId: f.requestId } : {}),
      ...(f.q ? { OR: [{ action: { contains: f.q, mode: 'insensitive' } }, { summary: { contains: f.q, mode: 'insensitive' } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    ]);
    res.json({ data: { total, page: f.page, pageSize: f.pageSize, rows } });
  }),
);

export default router;
