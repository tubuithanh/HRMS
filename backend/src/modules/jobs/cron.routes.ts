import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { NotFoundError } from '../../common/errors/AppError';
import { UnauthorizedError } from '../../common/middleware/auth';
import { runDailyJobs } from './daily';

/**
 * POST /api/cron/daily — cho dịch vụ lịch bên ngoài (cron-job.org, UptimeRobot…) gọi mỗi sáng:
 * đánh thức server (Render gói miễn phí) và chạy nhắc việc nếu hôm nay chưa chạy.
 * Header: `X-Cron-Secret: <CRON_SECRET>` (hoặc ?secret=). Chưa đặt CRON_SECRET → 404.
 */
const router = Router();

router.all(
  '/daily',
  asyncHandler(async (req, res) => {
    if (!env.CRON_SECRET) throw new NotFoundError('Chưa bật CRON_SECRET');
    const given = String(req.get('x-cron-secret') ?? req.query.secret ?? '');
    const a = Buffer.from(given);
    const b = Buffer.from(env.CRON_SECRET);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new UnauthorizedError('Sai khoá cron');
    res.json({ data: await runDailyJobs() });
  }),
);

export default router;
