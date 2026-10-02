import { Request, Router } from 'express';
import { prisma } from '../../config/prisma';
import { AppError, NotFoundError } from '../../common/errors/AppError';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { todayDate } from '../../common/utils/dates';
import { leaveService } from '../leave/leave.service';
import { selfLeaveRequestSchema } from '../leave/leave.schema';
import { attendanceService } from '../attendance/attendance.service';
import { monthQuery } from '../attendance/attendance.schema';
import { payrollService } from '../payroll/payroll.service';
import { sendPayslipPdf } from '../payroll/payslip.pdf';
import { overtimeService, selfOvertimeSchema } from '../overtime/overtime.service';
import { approvalService } from '../approval/approval.service';
import { reviewLeaveSchema } from '../leave/leave.schema';
import { pitCertificateService } from '../reports/pit-certificate';
import { notificationService } from '../notification/notification.service';
import { managerSchema, reviewService, selfSchema } from '../people/review.service';
import { rewardService } from '../people/reward.service';
import { trainingService } from '../people/training.service';
import { checklistService } from '../checklist/checklist.service';
import { assetService } from '../assets/asset.service';
import { insuranceService } from '../benefits/insurance.service';
import { overtimeSuggestions } from '../overtime/overtime.suggest';
import { z } from 'zod';
import { getSettings } from '../settings/settings.service';

/**
 * Tự phục vụ cho mọi tài khoản đã đăng nhập: xem hồ sơ, phiếu lương,
 * xin nghỉ, chấm công. Chỉ thấy dữ liệu của chính mình, qua Person gắn
 * với tài khoản.
 */
const router = Router();

function myPersonId(req: Request): string {
  const personId = req.user!.personId;
  if (!personId) {
    throw new AppError(
      'Tài khoản chưa được gắn với hồ sơ nhân sự. Hãy liên hệ quản trị.',
      400,
      'NO_PERSON',
    );
  }
  return personId;
}

/** Hợp đồng đang làm việc (mới nhất) của người đang đăng nhập. */
async function myEmploymentId(req: Request): Promise<string> {
  const emp = await prisma.employment.findFirst({
    where: {
      personId: myPersonId(req),
      isDelete: false,
      status: { in: ['PROBATION', 'ACTIVE', 'SUSPENDED'] },
    },
    orderBy: { dateHire: 'desc' },
  });
  if (!emp) {
    throw new AppError('Bạn không có hợp đồng lao động đang hiệu lực', 400, 'NO_EMPLOYMENT');
  }
  return emp.id;
}

/** Vị trí gửi kèm khi tự chấm công: toạ độ GPS từ trình duyệt + IP (sau proxy). */
function locationOf(req: Request) {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { lat: num(req.body?.lat), lng: num(req.body?.lng), ip: req.ip ?? null };
}

// ---------- Hồ sơ ----------
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const person = await prisma.person.findFirst({
      where: { id: myPersonId(req), isDelete: false },
      include: {
        employments: {
          where: { isDelete: false },
          orderBy: { dateHire: 'desc' },
          include: {
            company: { select: { name: true } },
            assignments: {
              where: { isDelete: false, isPrimary: true, endDate: null },
              include: {
                position: { select: { code: true, job: { select: { name: true } } } },
                orgStructure: { select: { name: true } },
              },
            },
          },
        },
        dependants: { where: { isDelete: false } },
      },
    });
    if (!person) throw new NotFoundError('Không tìm thấy hồ sơ nhân sự');
    res.json({ data: person });
  }),
);

// ---------- Phiếu lương (chỉ kỳ đã khoá) ----------
router.get(
  '/payslips',
  asyncHandler(async (req, res) => {
    const results = await prisma.payrollResult.findMany({
      where: {
        employment: { personId: myPersonId(req) },
        payPeriod: { status: { in: ['LOCKED', 'PAID'] } },
      },
      orderBy: { payPeriod: { dateStart: 'desc' } },
      include: { payPeriod: { select: { code: true, dateStart: true, dateEnd: true, payDate: true } } },
    });
    res.json({ data: results });
  }),
);

router.get(
  '/payslips/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await payrollService.payslipForResult(req.params.id, myPersonId(req)) });
  }),
);

router.get(
  '/payslips/:id/pdf',
  asyncHandler(async (req, res) => {
    const data = await payrollService.payslipForResult(req.params.id, myPersonId(req));
    await sendPayslipPdf(res, data);
  }),
);

// ---------- Nghỉ phép ----------
router.get(
  '/leave/types',
  asyncHandler(async (_req, res) => {
    res.json({ data: await leaveService.listTypes(true) });
  }),
);

router.get(
  '/leave/requests',
  asyncHandler(async (req, res) => {
    const personId = myPersonId(req);
    const data = await prisma.leaveRequest.findMany({
      where: { employment: { personId } },
      orderBy: { fromDate: 'desc' },
      include: {
        leaveType: { select: { id: true, code: true, name: true, isPaid: true } },
        reviewedBy: { select: { username: true } },
        approverEmployment: { select: { person: { select: { fullName: true } } } },
      },
    });
    res.json({ data });
  }),
);

router.post(
  '/leave/requests',
  asyncHandler(async (req, res) => {
    const input = selfLeaveRequestSchema.parse(req.body);
    const employmentId = await myEmploymentId(req);
    res.status(201).json({ data: await leaveService.create(employmentId, input) });
  }),
);

router.post(
  '/leave/requests/:id/cancel',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    res.json({ data: await leaveService.cancel(req.params.id, employmentId) });
  }),
);

router.get(
  '/leave/balances',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const employmentId = await myEmploymentId(req);
    res.json({ data: await leaveService.balances(employmentId, year) });
  }),
);

// ---------- Chấm công ----------
router.get(
  '/attendance/today',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    const record = await prisma.attendanceRecord.findUnique({
      where: { employmentId_workDate: { employmentId, workDate: todayDate() } },
    });
    res.json({ data: record });
  }),
);

router.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const { month } = monthQuery.parse(req.query);
    const employmentId = await myEmploymentId(req);
    const sheet = await attendanceService.timesheet(month, employmentId);
    const records = await attendanceService.listRecords({ month, employmentId });
    res.json({ data: { summary: sheet.rows[0] ?? null, records } });
  }),
);

router.post(
  '/attendance/check-in',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    res.json({ data: await attendanceService.checkIn(employmentId, new Date(), locationOf(req)) });
  }),
);

router.post(
  '/attendance/check-out',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    res.json({ data: await attendanceService.checkOut(employmentId, new Date(), locationOf(req)) });
  }),
);

// ---------- Làm thêm giờ ----------
/** Giới hạn và hệ số làm thêm giờ đang áp dụng (Cấu hình hệ thống) — để hiển thị cho mọi người. */
router.get(
  '/overtime-rules',
  asyncHandler(async (_req, res) => {
    res.json({ data: (await getSettings()).overtime });
  }),
);

router.get(
  '/overtime',
  asyncHandler(async (req, res) => {
    const data = await prisma.overtimeRequest.findMany({
      where: { employment: { personId: myPersonId(req) } },
      orderBy: { workDate: 'desc' },
      include: {
        reviewedBy: { select: { username: true } },
        approverEmployment: { select: { person: { select: { fullName: true } } } },
      },
    });
    res.json({ data });
  }),
);

router.post(
  '/overtime',
  asyncHandler(async (req, res) => {
    const input = selfOvertimeSchema.parse(req.body);
    const employmentId = await myEmploymentId(req);
    res.status(201).json({ data: await overtimeService.create(employmentId, input) });
  }),
);

router.post(
  '/overtime/:id/cancel',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    res.json({ data: await overtimeService.cancel(req.params.id, employmentId) });
  }),
);

// ---------- Quản lý trực tiếp: duyệt đơn của nhân viên, xem nhóm ----------
router.get(
  '/approvals',
  asyncHandler(async (req, res) => {
    res.json({ data: await approvalService.pendingForManager(req.user!) });
  }),
);

router.post(
  '/approvals/:kind/:id',
  asyncHandler(async (req, res) => {
    const kind = req.params.kind === 'overtime' ? 'overtime' : req.params.kind === 'leave' ? 'leave' : null;
    if (!kind) throw new NotFoundError('Loại đơn không hợp lệ');
    const { approve, note } = reviewLeaveSchema.parse(req.body);
    res.json({ data: await approvalService.managerReview(kind, req.params.id, req.user!, approve, note) });
  }),
);

router.get(
  '/team',
  asyncHandler(async (req, res) => {
    res.json({ data: await approvalService.myTeam(req.user!) });
  }),
);

// ---------- Chứng từ khấu trừ thuế TNCN ----------
router.get(
  '/pit-certificates',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    res.json({ data: await pitCertificateService.list({ year, personId: myPersonId(req) }) });
  }),
);

router.get(
  '/pit-certificates/:id/pdf',
  asyncHandler(async (req, res) => {
    const pdf = await pitCertificateService.pdf([req.params.id], myPersonId(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="chung-tu-khau-tru-TNCN.pdf"');
    res.send(pdf);
  }),
);

// ---------- Thông báo ----------
router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    res.json({ data: await notificationService.list(req.user!) });
  }),
);

router.get(
  '/notifications/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ data: { unread: await notificationService.unreadCount(req.user!) } });
  }),
);

/** POST /api/me/notifications/read — { ids?: string[] }; bỏ trống = đánh dấu tất cả đã đọc. */
router.post(
  '/notifications/read',
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string') : undefined;
    res.json({ data: await notificationService.markRead(req.user!, ids) });
  }),
);

// ---------- Đánh giá hiệu suất (nhân viên tự đánh giá, quản lý chấm) ----------
router.get('/reviews', asyncHandler(async (req, res) => res.json({ data: await reviewService.mine(req.user!) })));
router.get('/reviews/:id', asyncHandler(async (req, res) => res.json({ data: await reviewService.get(req.params.id, req.user!) })));
router.put(
  '/reviews/:id/self',
  asyncHandler(async (req, res) => {
    res.json({ data: await reviewService.saveSelf(req.params.id, req.user!, selfSchema.parse(req.body)) });
  }),
);
router.put(
  '/reviews/:id/manager',
  asyncHandler(async (req, res) => {
    res.json({ data: await reviewService.saveManager(req.params.id, req.user!, managerSchema.parse(req.body)) });
  }),
);

// ---------- Khen thưởng – kỷ luật, đào tạo của tôi ----------
router.get(
  '/rewards',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    res.json({ data: await rewardService.list({ employmentId }) });
  }),
);
router.get(
  '/trainings',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    res.json({ data: await trainingService.history(employmentId) });
  }),
);

// ---------- Việc cần làm (tiếp nhận / nghỉ việc) ----------
router.get('/tasks', asyncHandler(async (req, res) => res.json({ data: await checklistService.myTasks(req.user!) })));
router.get('/checklists/:id', asyncHandler(async (req, res) => res.json({ data: await checklistService.get(req.params.id, req.user!) })));
router.post(
  '/checklist-tasks/:id',
  asyncHandler(async (req, res) => {
    const b = z.object({ done: z.boolean(), note: z.string().max(500).optional() }).parse(req.body);
    res.json({ data: await checklistService.toggleTask(req.params.id, req.user!, b.done, b.note) });
  }),
);

// ---------- Tài sản đang giữ, chế độ BHXH của tôi ----------
router.get(
  '/assets',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    res.json({ data: await assetService.byEmployment(employmentId) });
  }),
);
router.get(
  '/insurance-claims',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    res.json({ data: await insuranceService.list({ employmentId }) });
  }),
);

/** Gợi ý đơn làm thêm giờ từ dữ liệu chấm công của tôi. */
router.get(
  '/overtime-suggestions',
  asyncHandler(async (req, res) => {
    const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng dạng YYYY-MM').parse(req.query.month);
    const employmentId = await myEmploymentId(req);
    res.json({ data: await overtimeSuggestions(month, employmentId) });
  }),
);

export default router;
