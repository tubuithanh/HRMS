import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { claimSchema, insuranceService as svc } from './insurance.service';
import { REGIME_LABEL } from './insurance.logic';

/** Chế độ BHXH ngắn hạn: ốm đau, thai sản, dưỡng sức. Nhân sự và kế toán. */
const router = Router();

router.get('/regimes', (_req, res) => res.json({ data: REGIME_LABEL }));

router.get(
  '/claims',
  asyncHandler(async (req, res) => {
    const q = z
      .object({ year: z.coerce.number().int().optional(), status: z.string().optional(), employmentId: z.string().uuid().optional(), regime: z.string().optional() })
      .parse(req.query);
    res.json({ data: await svc.list(q) });
  }),
);

/** POST /api/benefits/claims/preview — tính thử, không ghi. */
router.post('/claims/preview', asyncHandler(async (req, res) => res.json({ data: await svc.preview(claimSchema.parse(req.body)) })));
router.post('/claims', asyncHandler(async (req, res) => res.status(201).json({ data: await svc.create(claimSchema.parse(req.body), req.user?.id) })));
router.post(
  '/claims/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['DRAFT', 'SUBMITTED', 'PAID', 'REJECTED']) }).parse(req.body);
    res.json({ data: await svc.setStatus(req.params.id, status) });
  }),
);
router.post(
  '/claims/:id/payroll',
  asyncHandler(async (req, res) => {
    const { payPeriodId } = z.object({ payPeriodId: z.string().uuid() }).parse(req.body);
    res.json({ data: await svc.payViaPayroll(req.params.id, payPeriodId) });
  }),
);
router.delete(
  '/claims/:id',
  asyncHandler(async (req, res) => {
    await svc.remove(req.params.id);
    res.json({ data: { ok: true } });
  }),
);
router.get(
  '/claims/export',
  asyncHandler(async (req, res) => {
    const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng dạng YYYY-MM').parse(req.query.month);
    const f = await svc.exportXlsx(month);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
    res.send(f.buffer);
  }),
);

export default router;
