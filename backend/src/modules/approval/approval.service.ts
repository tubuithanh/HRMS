import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError } from '../../common/errors/AppError';
import { ForbiddenError } from '../../common/middleware/auth';
import { todayDate } from '../../common/utils/dates';
import { AuthUser } from '../auth/token';
import { computeManagers } from './manager.logic';
import { getSettings } from '../settings/settings.service';

/** Bản đồ nhân viên → quản lý trực tiếp, tính trên toàn bộ tổ chức hiện tại. */
export async function loadManagerMap() {
  const [orgs, assignments] = await Promise.all([
    prisma.orgStructure.findMany({ where: { isDelete: false }, select: { id: true, parentId: true } }),
    prisma.assignment.findMany({
      where: {
        isDelete: false,
        isPrimary: true,
        endDate: null,
        employment: { isDelete: false, status: { in: ['ACTIVE', 'PROBATION', 'SUSPENDED'] } },
      },
      select: {
        employmentId: true,
        orgStructureId: true,
        directManagerEmploymentId: true,
        position: { select: { isKeyPosition: true } },
      },
    }),
  ]);
  return computeManagers(
    orgs,
    assignments.map((a) => ({
      employmentId: a.employmentId,
      orgId: a.orgStructureId,
      isKeyPosition: a.position.isKeyPosition,
      directManagerEmploymentId: a.directManagerEmploymentId,
    })),
  );
}

/**
 * Bước duyệt đầu tiên cho đơn mới: có quản lý → MANAGER, không có → HR.
 * viaHr: đơn do nhân sự tạo hộ thì đi thẳng tới bước HR.
 */
export async function initialApproval(employmentId: string, viaHr = false) {
  if (viaHr || !(await getSettings()).approval.twoStep) return { approvalStage: 'HR' as const, approverEmploymentId: null };
  const managerId = (await loadManagerMap()).get(employmentId) ?? null;
  return managerId
    ? { approvalStage: 'MANAGER' as const, approverEmploymentId: managerId }
    : { approvalStage: 'HR' as const, approverEmploymentId: null };
}

async function myEmploymentIds(personId: string | null) {
  if (!personId) return [];
  const rows = await prisma.employment.findMany({ where: { personId, isDelete: false }, select: { id: true } });
  return rows.map((r) => r.id);
}

const personOf = {
  select: { id: true, codeEmp: true, person: { select: { id: true, personCode: true, fullName: true } } },
} as const;

type Kind = 'leave' | 'overtime';

export const approvalService = {
  /** Đơn đang chờ chính người này duyệt (bước quản lý). */
  async pendingForManager(user: AuthUser) {
    const mine = await myEmploymentIds(user.personId);
    if (mine.length === 0) return { leave: [], overtime: [] };
    const where = { status: 'PENDING' as const, approvalStage: 'MANAGER' as const, approverEmploymentId: { in: mine } };
    const [leave, overtime] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        orderBy: { fromDate: 'asc' },
        include: { employment: personOf, leaveType: { select: { id: true, code: true, name: true, isPaid: true } } },
      }),
      prisma.overtimeRequest.findMany({ where, orderBy: { workDate: 'asc' }, include: { employment: personOf } }),
    ]);
    return { leave, overtime };
  },

  /** Quản lý duyệt (chuyển sang HR) hoặc từ chối (kết thúc). */
  async managerReview(kind: Kind, id: string, user: AuthUser, approve: boolean, note?: string) {
    const mine = await myEmploymentIds(user.personId);
    const delegate = (kind === 'leave' ? prisma.leaveRequest : prisma.overtimeRequest) as unknown as {
      findUnique(a: unknown): Promise<{ status: string; approvalStage: string; approverEmploymentId: string | null; employmentId: string } | null>;
      update(a: unknown): Promise<unknown>;
    };
    const req = await delegate.findUnique({ where: { id } });
    if (!req) throw new NotFoundError('Không tìm thấy đơn');
    if (!req.approverEmploymentId || !mine.includes(req.approverEmploymentId)) {
      throw new ForbiddenError('Bạn không phải người duyệt đơn này');
    }
    if (mine.includes(req.employmentId)) throw new ForbiddenError('Không thể tự duyệt đơn của chính mình');
    if (req.status !== 'PENDING' || req.approvalStage !== 'MANAGER') {
      throw new ConflictError('Đơn không còn ở bước quản lý duyệt');
    }
    const now = new Date();
    return delegate.update({
      where: { id },
      data: approve
        ? { approvalStage: 'HR', managerReviewedById: user.id, managerReviewedAt: now, managerNote: note ?? null }
        : { status: 'REJECTED', managerReviewedById: user.id, managerReviewedAt: now, managerNote: note ?? null, reviewedById: user.id, reviewedAt: now, reviewNote: note ?? null },
    });
  },

  /** Nhân viên mà người này là quản lý trực tiếp, kèm tình trạng hôm nay. */
  async myTeam(user: AuthUser) {
    const mine = await myEmploymentIds(user.personId);
    if (mine.length === 0) throw new AppError('Tài khoản chưa gắn với hồ sơ nhân sự', 400, 'NO_PERSON');
    const map = await loadManagerMap();
    const ids = [...map.entries()].filter(([, m]) => m && mine.includes(m)).map(([e]) => e);
    if (ids.length === 0) return [];
    const today = todayDate();
    const emps = await prisma.employment.findMany({
      where: { id: { in: ids } },
      orderBy: { codeEmp: 'asc' },
      include: {
        person: { select: { id: true, fullName: true, phone: true, email: true } },
        assignments: {
          where: { isDelete: false, isPrimary: true, endDate: null },
          include: { position: { select: { job: { select: { name: true } } } }, orgStructure: { select: { name: true } } },
          take: 1,
        },
        attendanceRecords: { where: { workDate: today }, select: { status: true, checkIn: true, checkOut: true } },
        leaveRequests: {
          where: { status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } },
          select: { leaveType: { select: { name: true } }, toDate: true },
        },
      },
    });
    return emps.map((e) => ({
      employmentId: e.id,
      codeEmp: e.codeEmp,
      status: e.status,
      person: e.person,
      job: e.assignments[0]?.position.job.name ?? null,
      org: e.assignments[0]?.orgStructure.name ?? null,
      today: e.leaveRequests[0]
        ? { kind: 'LEAVE', label: `${e.leaveRequests[0].leaveType.name} đến ${e.leaveRequests[0].toDate.toISOString().slice(0, 10)}` }
        : e.attendanceRecords[0]
          ? { kind: e.attendanceRecords[0].status, checkIn: e.attendanceRecords[0].checkIn, checkOut: e.attendanceRecords[0].checkOut }
          : { kind: 'NONE' },
    }));
  },
};
