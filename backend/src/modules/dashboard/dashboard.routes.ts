import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { addDays, formatDate, isWeekend, todayDate } from '../../common/utils/dates';
import {
  AGE_BUCKETS,
  bucketize,
  fullYears,
  headcountTrend,
  isEmployedAt,
  TENURE_BUCKETS,
  turnoverYtd,
} from './dashboard.logic';
import { sum, toDbString } from '../../common/utils/money';
import { contractService } from '../corehr/contract.service';

const router = Router();

const ACTIVE = ['ACTIVE', 'PROBATION'] as const;

/** GET /api/dashboard — số liệu tổng quan cho trang chủ quản lý. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const today = todayDate();
    const in60Days = addDays(today, 60);
    const in30Days = addDays(today, 30);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

    const [
      activeEmployees,
      probationEmployees,
      newHiresThisMonth,
      pendingLeaves,
      onLeaveTodayList,
      openOpenings,
      activeApplications,
      expiringPermits,
      expiringCards,
      latestPeriod,
      expiringContracts,
      todayRecords,
      assignments,
      genders,
      probationEnding,
      pendingLeaveList,
      upcomingInterviews,
      pendingOvertime,
    ] = await Promise.all([
      prisma.employment.count({ where: { isDelete: false, status: { in: [...ACTIVE] } } }),
      prisma.employment.count({ where: { isDelete: false, status: 'PROBATION' } }),
      prisma.employment.count({ where: { isDelete: false, dateHire: { gte: monthStart, lte: today } } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING', approvalStage: 'HR' } }),
      prisma.leaveRequest.findMany({
        where: { status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } },
        include: {
          leaveType: { select: { name: true } },
          employment: { select: { codeEmp: true, person: { select: { id: true, fullName: true } } } },
        },
      }),
      prisma.jobOpening.count({ where: { isDelete: false, status: 'OPEN' } }),
      prisma.jobApplication.count({
        where: { isDelete: false, stage: { in: ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'] } },
      }),
      prisma.workPermit.count({ where: { isDelete: false, expiryDate: { not: null, lte: in60Days } } }),
      prisma.residenceCard.count({ where: { isDelete: false, expiryDate: { not: null, lte: in60Days } } }),
      prisma.payPeriod.findFirst({
        orderBy: { dateStart: 'desc' },
        include: { results: { select: { grossIncome: true, netPay: true, companyInsurance: true, pitAmount: true } } },
      }),
      contractService.expiring(30),
      prisma.attendanceRecord.groupBy({ by: ['status'], where: { workDate: today }, _count: true }),
      prisma.assignment.findMany({
        where: {
          isDelete: false,
          isPrimary: true,
          endDate: null,
          employment: { isDelete: false, status: { in: [...ACTIVE] } },
        },
        select: { orgStructure: { select: { id: true, name: true } } },
      }),
      prisma.person.groupBy({
        by: ['gender'],
        where: { isDelete: false, employments: { some: { isDelete: false, status: { in: [...ACTIVE] } } } },
        _count: true,
      }),
      prisma.employment.findMany({
        where: { isDelete: false, status: 'PROBATION', probationEndDate: { gte: today, lte: in30Days } },
        orderBy: { probationEndDate: 'asc' },
        select: { id: true, codeEmp: true, probationEndDate: true, person: { select: { id: true, fullName: true } } },
      }),
      prisma.leaveRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { fromDate: 'asc' },
        take: 5,
        include: {
          leaveType: { select: { name: true } },
          employment: { select: { codeEmp: true, person: { select: { fullName: true } } } },
        },
      }),
      prisma.jobApplication.findMany({
        where: { isDelete: false, stage: 'INTERVIEW', interviewAt: { gte: new Date() } },
        orderBy: { interviewAt: 'asc' },
        take: 5,
        select: { id: true, fullName: true, interviewAt: true, jobOpening: { select: { id: true, title: true } } },
      }),
      prisma.overtimeRequest.count({ where: { status: 'PENDING', approvalStage: 'HR' } }),
    ]);

    // Nhân sự theo khối (đơn vị cấp 2 trong cây tổ chức), theo vị trí chính đang hiệu lực.
    const orgs = await prisma.orgStructure.findMany({
      where: { isDelete: false },
      select: { id: true, code: true, name: true, path: true, parentId: true },
    });
    const byCode = new Map(orgs.map((o) => [o.code, o]));
    const blockOf = (orgId: string) => {
      const o = orgs.find((x) => x.id === orgId);
      const segments = o?.path?.split('/').filter(Boolean) ?? [];
      // path = /ROOT/KHOI/...; nhân sự đặt ngay ở gốc thì tính vào gốc.
      return byCode.get(segments[1] ?? segments[0] ?? '') ?? o;
    };
    const byOrg = new Map<string, { name: string; count: number }>();
    for (const a of assignments) {
      const block = blockOf(a.orgStructure.id);
      const key = block?.id ?? a.orgStructure.id;
      const cur = byOrg.get(key) ?? { name: block?.name ?? a.orgStructure.name, count: 0 };
      cur.count++;
      byOrg.set(key, cur);
    }
    const headcountByOrg = [...byOrg.values()].sort((x, y) => y.count - x.count);
    const unassigned = activeEmployees - assignments.length;
    if (unassigned > 0) headcountByOrg.push({ name: 'Chưa gán phòng ban', count: unassigned });

    const attendanceToday = Object.fromEntries(todayRecords.map((r) => [r.status, r._count]));

    const results = latestPeriod?.results ?? [];
    const payrollTotals = latestPeriod && {
      id: latestPeriod.id,
      code: latestPeriod.code,
      status: latestPeriod.status,
      dateStart: latestPeriod.dateStart,
      dateEnd: latestPeriod.dateEnd,
      employees: results.length,
      gross: toDbString(sum(results.map((r) => String(r.grossIncome)))),
      net: toDbString(sum(results.map((r) => String(r.netPay)))),
      pit: toDbString(sum(results.map((r) => String(r.pitAmount)))),
      companyInsurance: toDbString(sum(results.map((r) => String(r.companyInsurance)))),
    };

    res.json({
      data: {
        activeEmployees,
        probationEmployees,
        newHiresThisMonth,
        pendingLeaves,
        pendingOvertime,
        onLeaveToday: onLeaveTodayList.length,
        onLeaveTodayList,
        openOpenings,
        activeApplications,
        expiringDocuments: expiringPermits + expiringCards,
        expiringContracts: expiringContracts.length,
        attendanceToday,
        headcountByOrg,
        genders: Object.fromEntries(genders.map((g) => [g.gender ?? 'UNKNOWN', g._count])),
        probationEnding,
        pendingLeaveList,
        upcomingInterviews,
        payroll: payrollTotals ?? null,
      },
    });
  }),
);

/**
 * GET /api/dashboard/trends?months=12 — chuỗi số liệu theo thời gian:
 * quân số, tuyển mới/nghỉ việc, chi phí lương theo kỳ, tỷ lệ đi làm 14 ngày,
 * ngày nghỉ theo loại, cơ cấu thâm niên và độ tuổi.
 */
router.get(
  '/trends',
  asyncHandler(async (req, res) => {
    const months = Math.min(Math.max(Number(req.query.months) || 12, 3), 24);
    const today = todayDate();
    const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

    // 14 ngày làm việc gần nhất (tính cả hôm nay nếu là ngày thường).
    const workdays: Date[] = [];
    for (let d = today; workdays.length < 14; d = addDays(d, -1)) {
      if (!isWeekend(d)) workdays.unshift(d);
    }

    const [employments, periods, records, leaves, leaveByType] = await Promise.all([
      prisma.employment.findMany({
        where: { isDelete: false },
        select: {
          dateHire: true,
          dateTerminate: true,
          status: true,
          person: { select: { dateOfBirth: true } },
        },
      }),
      prisma.payPeriod.findMany({
        where: { results: { some: {} } },
        orderBy: { dateStart: 'desc' },
        take: Math.min(months, 12),
        select: { id: true, code: true, status: true },
      }),
      prisma.attendanceRecord.groupBy({
        by: ['workDate', 'status'],
        where: { workDate: { gte: workdays[0], lte: today } },
        _count: true,
      }),
      prisma.leaveRequest.findMany({
        where: { status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: workdays[0] } },
        select: { fromDate: true, toDate: true },
      }),
      prisma.leaveRequest.groupBy({
        by: ['leaveTypeId'],
        where: { status: 'APPROVED', fromDate: { gte: yearStart, lte: today } },
        _sum: { days: true },
      }),
    ]);

    // ----- Quân số -----
    const headcount = headcountTrend(employments, today, months);
    const active = employments.filter((e) => isEmployedAt(e, today));

    // ----- Chi phí lương theo kỳ (cũ → mới) -----
    const sums = await prisma.payrollResult.groupBy({
      by: ['payPeriodId'],
      where: { payPeriodId: { in: periods.map((p) => p.id) } },
      _sum: { grossIncome: true, netPay: true, companyInsurance: true, pitAmount: true },
      _count: true,
    });
    const payroll = [...periods].reverse().map((p) => {
      const s = sums.find((x) => x.payPeriodId === p.id);
      return {
        code: p.code,
        status: p.status,
        employees: s?._count ?? 0,
        gross: String(s?._sum.grossIncome ?? 0),
        net: String(s?._sum.netPay ?? 0),
        companyInsurance: String(s?._sum.companyInsurance ?? 0),
        pit: String(s?._sum.pitAmount ?? 0),
      };
    });

    // ----- Tỷ lệ đi làm 14 ngày -----
    const attendance = workdays.map((day) => {
      const key = formatDate(day);
      const count = (s: string) =>
        records.find((r) => formatDate(r.workDate) === key && r.status === s)?._count ?? 0;
      const staff = employments.filter((e) => isEmployedAt(e, day)).length;
      const onLeave = leaves.filter((l) => l.fromDate <= day && l.toDate >= day).length;
      const worked = count('PRESENT') + count('LATE') + count('REMOTE');
      const expected = Math.max(staff - onLeave, 0);
      return {
        date: key,
        staff,
        worked,
        late: count('LATE'),
        onLeave,
        rate: expected > 0 ? Math.round((worked / expected) * 1000) / 10 : null,
      };
    });

    // ----- Nghỉ phép theo loại (từ đầu năm) -----
    const types = await prisma.leaveType.findMany({ select: { id: true, name: true } });
    const leaveDays = leaveByType
      .map((g) => ({
        label: types.find((t) => t.id === g.leaveTypeId)?.name ?? '—',
        days: Number(g._sum.days ?? 0),
      }))
      .sort((a, b) => b.days - a.days);

    // ----- Cơ cấu -----
    const tenure = bucketize(active.map((e) => fullYears(e.dateHire, today)), TENURE_BUCKETS);
    const age = bucketize(
      active.map((e) => (e.person.dateOfBirth ? fullYears(e.person.dateOfBirth, today) : null)),
      AGE_BUCKETS,
    );
    const avgTenure =
      active.length > 0
        ? Math.round(
            (active.reduce((s, e) => s + (today.getTime() - e.dateHire.getTime()), 0) / active.length / (365.25 * 86_400_000)) * 10,
          ) / 10
        : null;

    res.json({
      data: {
        months,
        headcount,
        turnoverYtd: turnoverYtd(employments, today),
        avgTenureYears: avgTenure,
        payroll,
        attendance,
        leaveDays,
        tenure,
        age,
      },
    });
  }),
);

export default router;
