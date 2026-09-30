import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import {
  createLeaveTypeSchema,
  leaveRequestSchema,
  reviewLeaveSchema,
  updateLeaveTypeSchema,
} from './leave.schema';
import { leaveService as svc } from './leave.service';

/** Nghỉ phép — dành cho nhân sự. Nhân viên dùng /api/me/leave. */
const router = Router();

const listQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  employmentId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ----- Loại nghỉ -----
router.get(
  '/types',
  asyncHandler(async (_req, res) => {
    res.json({ data: await svc.listTypes() });
  }),
);

router.post(
  '/types',
  asyncHandler(async (req, res) => {
    const input = createLeaveTypeSchema.parse(req.body);
    res.status(201).json({ data: await svc.createType(input) });
  }),
);

router.patch(
  '/types/:id',
  asyncHandler(async (req, res) => {
    const input = updateLeaveTypeSchema.parse(req.body);
    res.json({ data: await svc.updateType(req.params.id, input) });
  }),
);

// ----- Đơn nghỉ -----
router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.list(listQuery.parse(req.query)) });
  }),
);

router.post(
  '/requests',
  asyncHandler(async (req, res) => {
    const { employmentId, ...input } = leaveRequestSchema.parse(req.body);
    res.status(201).json({ data: await svc.create(employmentId, input, true) });
  }),
);

router.post(
  '/requests/:id/review',
  asyncHandler(async (req, res) => {
    const { approve, note } = reviewLeaveSchema.parse(req.body);
    res.json({
      data: await svc.review(req.params.id, req.user!, approve, note),
    });
  }),
);

router.post(
  '/requests/:id/cancel',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.cancel(req.params.id) });
  }),
);

router.get(
  '/balances/:employmentId',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    res.json({ data: await svc.balances(req.params.employmentId, year) });
  }),
);

export default router;
