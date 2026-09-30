import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../common/utils/asyncHandler';

const router = Router();

/**
 * GET /api/health
 * Kiểm tra API sống và kết nối được PostgreSQL.
 * Dùng cho giám sát và để xác nhận môi trường đã cấu hình đúng.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    let dbStatus = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    res.json({
      status: 'ok',
      db: dbStatus,
      time: new Date().toISOString(),
    });
  }),
);

export default router;
