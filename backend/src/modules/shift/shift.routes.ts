import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { assignSchema, rosterSetSchema, rotateSchema, shiftSchema, shiftService as svc } from './shift.service';

/** Ca làm việc: danh mục ca, ca mặc định, lịch xếp ca / xoay ca. */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.list(req.query.all === 'true') });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.create(shiftSchema.parse(req.body)) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.update(req.params.id, shiftSchema.partial().parse(req.body)) });
  }),
);

/** POST /api/shifts/assign — gán ca mặc định cho nhiều nhân viên. */
router.post(
  '/assign',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.assign(assignSchema.parse(req.body)) });
  }),
);

/** GET /api/shifts/roster?month=2026-10&orgId= — lịch ca tháng. */
router.get(
  '/roster',
  asyncHandler(async (req, res) => {
    const q = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng dạng YYYY-MM (01–12)'), orgId: z.string().uuid().optional() }).parse(req.query);
    res.json({ data: await svc.roster(q.month, q.orgId) });
  }),
);

/** PUT /api/shifts/roster — sửa từng ô lịch ca. */
router.put(
  '/roster',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.setRoster(rosterSetSchema.parse(req.body)) });
  }),
);

/** POST /api/shifts/roster/clear — bỏ lịch xếp ca, quay về ca mặc định. */
router.post(
  '/roster/clear',
  asyncHandler(async (req, res) => {
    const q = z
      .object({ employmentIds: z.array(z.string().uuid()).min(1), fromDate: z.coerce.date(), toDate: z.coerce.date() })
      .parse(req.body);
    res.json({ data: await svc.clearRoster(q.employmentIds, q.fromDate, q.toDate) });
  }),
);

/** POST /api/shifts/rotate — xoay ca theo chu kỳ. */
router.post(
  '/rotate',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.rotate(rotateSchema.parse(req.body)) });
  }),
);

export default router;
