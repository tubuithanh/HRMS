import { NextFunction, Request, Response, Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from './common/middleware/auth';
import healthRoutes from './modules/health/health.routes';
import authRoutes from './modules/auth/auth.routes';
import meRoutes from './modules/me/me.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import coreHrRoutes from './modules/corehr/corehr.routes';
import payrollRoutes from './modules/payroll/payroll.routes';
import leaveRoutes from './modules/leave/leave.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import recruitmentRoutes from './modules/recruitment/recruitment.routes';
import importRoutes from './modules/import/import.routes';
import auditRoutes from './modules/audit/audit.routes';
import settingsRoutes from './modules/settings/settings.routes';
import shiftRoutes from './modules/shift/shift.routes';
import reportRoutes from './modules/reports/reports.routes';
import peopleRoutes from './modules/people/people.routes';
import benefitsRoutes from './modules/benefits/benefits.routes';
import assetRoutes from './modules/assets/asset.routes';
import checklistRoutes from './modules/checklist/checklist.routes';

/**
 * Phân quyền theo phân hệ: `write` được mọi phương thức,
 * `read` chỉ được GET. ADMIN luôn được phép (xem requireRole).
 */
function access(write: Role[], read: Role[] = []) {
  const canWrite = requireRole(...write);
  const canRead = requireRole(...write, ...read);
  return (req: Request, res: Response, next: NextFunction) =>
    req.method === 'GET' ? canRead(req, res, next) : canWrite(req, res, next);
}

/**
 * Gom router của tất cả các module. Mỗi phân hệ HRM đăng ký router tại đây.
 */
const router = Router();

// Công khai
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Mọi tài khoản đã đăng nhập: dữ liệu của chính mình
router.use('/me', requireAuth, meRoutes);

// Nghiệp vụ theo vai trò
router.use('/dashboard', requireAuth, access([], ['HR', 'ACCOUNTANT']), dashboardRoutes);
router.use('/corehr', requireAuth, access(['HR'], ['ACCOUNTANT']), coreHrRoutes);
router.use('/payroll', requireAuth, access(['ACCOUNTANT'], ['HR']), payrollRoutes);
router.use('/leave', requireAuth, access(['HR'], ['ACCOUNTANT']), leaveRoutes);
router.use('/attendance', requireAuth, access(['HR'], ['ACCOUNTANT']), attendanceRoutes);
router.use('/shifts', requireAuth, access(['HR'], ['ACCOUNTANT']), shiftRoutes);
// Báo cáo BHXH, thuế TNCN, chuyển lương: kế toán lập, nhân sự xem
router.use('/reports', requireAuth, access(['ACCOUNTANT'], ['HR']), reportRoutes);
// Khen thưởng – kỷ luật, đào tạo, đánh giá: nhân sự ghi, kế toán xem
router.use('/people', requireAuth, access(['HR'], ['ACCOUNTANT']), peopleRoutes);
// Chế độ BHXH: nhân sự lập hồ sơ, kế toán theo dõi chi trả
router.use('/benefits', requireAuth, access(['HR', 'ACCOUNTANT']), benefitsRoutes);
router.use('/assets', requireAuth, access(['HR'], ['ACCOUNTANT']), assetRoutes);
router.use('/checklists', requireAuth, access(['HR'], ['ACCOUNTANT']), checklistRoutes);
router.use('/recruitment', requireAuth, access(['HR']), recruitmentRoutes);
// Nhập / xuất Excel: phân quyền theo từng route bên trong
router.use('/import', requireAuth, importRoutes);
router.use('/audit', requireAuth, requireRole('ADMIN'), auditRoutes);
// Cấu hình: /public cho mọi tài khoản, phần còn lại chỉ ADMIN (kiểm tra bên trong)
router.use('/settings', requireAuth, settingsRoutes);

export default router;
