import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { monthQuery, upsertRecordSchema } from './attendance.schema';
import { attendanceService as svc } from './attendance.service';
import overtimeRoutes from '../overtime/overtime.routes';

/** Chấm công — dành cho nhân sự. Nhân viên tự chấm qua /api/me/attendance. */
const router = Router();

// Ngày lễ, làm thêm giờ
router.use('/', overtimeRoutes);

/** GET /api/attendance/timesheet?month=2026-09 — bảng công tháng. */
router.get(
  '/timesheet',
  asyncHandler(async (req, res) => {
    const q = monthQuery.parse(req.query);
    res.json({ data: await svc.timesheet(q.month, q.employmentId) });
  }),
);

router.get(
  '/records',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listRecords(monthQuery.parse(req.query)) });
  }),
);

/** PUT /api/attendance/records — nhập hoặc sửa công một ngày của một nhân viên. */
router.put(
  '/records',
  asyncHandler(async (req, res) => {
    const input = upsertRecordSchema.parse(req.body);
    res.json({ data: await svc.upsertRecord(input) });
  }),
);

router.delete(
  '/records/:id',
  asyncHandler(async (req, res) => {
    await svc.deleteRecord(req.params.id);
    res.json({ data: { deleted: true } });
  }),
);

export default router;
