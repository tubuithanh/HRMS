import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { requireRole } from '../../common/middleware/auth';
import { ValidationError } from '../../common/errors/AppError';
import { buildTemplate, exportEmployees, isImportType, runImport } from './import.service';

/** Nhập dữ liệu từ Excel và xuất danh sách nhân sự. */
const router = Router();

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function importType(t: string) {
  if (!isImportType(t)) throw new ValidationError(`Loại dữ liệu "${t}" không được hỗ trợ`);
  return t;
}

/** GET /api/import/templates/:type — file mẫu. */
router.get(
  '/templates/:type',
  requireRole('HR'),
  asyncHandler(async (req, res) => {
    const type = importType(req.params.type);
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="mau-nhap-${type}.xlsx"`);
    res.send(await buildTemplate(type));
  }),
);

const bodySchema = z.object({
  /** Nội dung file .xlsx mã hoá base64. */
  file: z.string().min(1).max(10_000_000, 'File quá lớn (tối đa khoảng 7MB)'),
  /** false: chỉ kiểm tra; true: kiểm tra rồi ghi nếu không có lỗi. */
  commit: z.boolean().default(false),
});

/** POST /api/import/:type — kiểm tra (commit=false) hoặc nhập (commit=true). */
router.post(
  '/:type',
  requireRole('HR'),
  asyncHandler(async (req, res) => {
    const type = importType(req.params.type);
    const { file, commit } = bodySchema.parse(req.body);
    res.json({ data: await runImport(type, file, commit) });
  }),
);

/** GET /api/import/export/employees — xuất danh sách nhân sự. */
router.get(
  '/export/employees',
  requireRole('HR', 'ACCOUNTANT'),
  asyncHandler(async (_req, res) => {
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="danh-sach-nhan-su.xlsx"`);
    res.send(await exportEmployees());
  }),
);

export default router;
