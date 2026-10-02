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
    res.json({ data: await attendanceService.checkIn(employmentId) });
  }),
);

router.post(
  '/attendance/check-out',
  asyncHandler(async (req, res) => {
    const employmentId = await myEmploymentId(req);
    res.json({ data: await attendanceService.checkOut(employmentId) });
  }),
);

// ---------- Làm thêm giờ ----------
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

export default router;
