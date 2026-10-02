import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { monthQuery, upsertRecordSchema } from './attendance.schema';
import { attendanceService as svc } from './attendance.service';
import overtimeRoutes from '../overtime/overtime.routes';
import { z } from 'zod';
import { importPunches, punchTemplateCsv } from './punch.service';

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

// ---------- Dữ liệu máy chấm công ----------
/** POST /api/attendance/punches — { file: base64 (xlsx / csv), commit }: kiểm tra hoặc ghi. */
router.post(
  '/punches',
  asyncHandler(async (req, res) => {
    const { file, commit } = z
      .object({ file: z.string().min(1).max(10_000_000, 'File quá lớn (tối đa khoảng 7MB)'), commit: z.boolean().default(false) })
      .parse(req.body);
    res.json({ data: await importPunches(file, commit) });
  }),
);

router.get('/punches/template', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mau-may-cham-cong.csv"');
  res.send(punchTemplateCsv());
});

export default router;
