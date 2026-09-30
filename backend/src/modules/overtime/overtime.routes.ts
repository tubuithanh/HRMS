import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import {
  holidaySchema,
  overtimeSchema,
  overtimeService as svc,
  reviewOvertimeSchema,
} from './overtime.service';

/** Ngày lễ và làm thêm giờ — dành cho nhân sự. Nhân viên dùng /api/me/overtime. */
const router = Router();

// ----- Ngày lễ -----
router.get(
  '/holidays',
  asyncHandler(async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : undefined;
    res.json({ data: await svc.listHolidays(year) });
  }),
);

router.post(
  '/holidays',
  asyncHandler(async (req, res) => {
    const { date, name } = holidaySchema.parse(req.body);
    res.status(201).json({ data: await svc.addHoliday(date, name) });
  }),
);

router.delete(
  '/holidays/:id',
  asyncHandler(async (req, res) => {
    await svc.removeHoliday(req.params.id);
    res.json({ data: { deleted: true } });
  }),
);

// ----- Đơn làm thêm giờ -----
const listQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  employmentId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

router.get(
  '/overtime',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.list(listQuery.parse(req.query)) });
  }),
);

router.post(
  '/overtime',
  asyncHandler(async (req, res) => {
    const { employmentId, ...input } = overtimeSchema.parse(req.body);
    res.status(201).json({ data: await svc.create(employmentId, input, true) });
  }),
);

router.post(
  '/overtime/:id/review',
  asyncHandler(async (req, res) => {
    const { approve, note } = reviewOvertimeSchema.parse(req.body);
    res.json({ data: await svc.review(req.params.id, req.user!, approve, note) });
  }),
);

router.post(
  '/overtime/:id/cancel',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.cancel(req.params.id) });
  }),
);

export default router;
