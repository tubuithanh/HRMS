import { getSettings } from '../settings/settings.service';
import { LaborRules } from '../settings/labor-rules';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { countWorkingDays, formatDate } from '../../common/utils/dates';
import { pickEffective } from '../../common/utils/effectiveDating';
import { calcFinalSettlement } from '../payroll/final-settlement';
import { leaveService } from '../leave/leave.service';
import { trainingService } from '../people/training.service';
import { assetService } from '../assets/asset.service';
import { checklistService } from '../checklist/checklist.service';
import {
  estimateInsuredMonths,
  fullMonthsBetween,
  severanceEligibility,
  TERMINATION_LABELS,
  TerminationType,
} from './offboarding.logic';

const TYPES = Object.keys(TERMINATION_LABELS) as [TerminationType, ...TerminationType[]];

export const previewQuery = z.object({
  date: z.coerce.date(),
  type: z.enum(TYPES),
  // Số liệu người dùng sửa (tuỳ chọn) — tính lại quyết toán theo các số này.
  totalWorkedMonths: z.coerce.number().int().min(0).optional(),
  unemploymentInsuredMonths: z.coerce.number().int().min(0).optional(),
  avgSalary6Months: z.coerce.number().nonnegative().optional(),
  unusedLeaveDays: z.coerce.number().min(0).optional(),
});

export const offboardSchema = z.object({
  dateTerminate: z.coerce.date(),
  type: z.enum(TYPES),
  note: z.string().trim().max(500).optional(),
  lockAccount: z.boolean().default(true),
  /** Đưa trợ cấp + tiền phép vào kỳ lương chứa ngày nghỉ việc (nếu kỳ đó đang mở). */
  includeInPayroll: z.boolean().default(true),
  // Các số liệu quyết toán (đã xem trước, người dùng có thể sửa)
  totalWorkedMonths: z.number().int().min(0),
  unemploymentInsuredMonths: z.number().int().min(0),
  avgSalary6Months: z.number().nonnegative(),
  unusedLeaveDays: z.number().min(0),
  /** Bồi hoàn chi phí đào tạo (còn trong thời gian cam kết) — trừ vào kỳ lương cuối. */
  trainingRefund: z.number().min(0).default(0),
});

export type OffboardInput = z.infer<typeof offboardSchema>;

async function loadEmployment(id: string) {
  const emp = await prisma.employment.findFirst({
    where: { id, isDelete: false },
    include: {
      person: { select: { id: true, fullName: true, user: { select: { id: true, username: true, isActive: true } } } },
      salaries: { where: { isDelete: false } },
      payrollResults: { select: { empInsurance: true } },
      advances: { where: { status: { in: ['APPROVED', 'DEDUCTING'] } }, include: { schedule: { where: { isDeducted: false } } } },
    },
  });
  if (!emp) throw new NotFoundError('Không tìm thấy hợp đồng lao động');
  return emp;
}

/** Số liệu quyết toán gợi ý cho một ngày nghỉ việc. */
async function suggest(emp: Awaited<ReturnType<typeof loadEmployment>>, date: Date) {
  const from = emp.dateSeniority ?? emp.dateHire;
  const totalWorkedMonths = fullMonthsBetween(from, date);
  const probationMonths = emp.probationEndDate ? fullMonthsBetween(emp.dateHire, emp.probationEndDate) : 0;
  const uninsured = emp.payrollResults.filter((r) => new Decimal(String(r.empInsurance)).isZero()).length;
  const unemploymentInsuredMonths = estimateInsuredMonths(totalWorkedMonths, probationMonths, uninsured);

  // Lương bình quân 6 tháng liền kề theo hợp đồng (lương cơ bản hiệu lực cuối mỗi tháng).
  const samples: Decimal[] = [];
  for (let i = 0; i < 6; i++) {
    const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - i + 1, 0));
    const at = monthEnd > date ? date : monthEnd;
    const s = pickEffective(emp.salaries, at);
    if (s) samples.push(new Decimal(String(s.baseAmount)));
  }
  const avgSalary6Months = samples.length
    ? samples.reduce((a, b) => a.plus(b), new Decimal(0)).div(samples.length).toDecimalPlaces(0).toNumber()
    : 0;

  // Phép năm còn lại (tính theo số tháng làm việc trong năm nghỉ việc).
  const balances = await leaveService.balances(emp.id, date.getUTCFullYear(), date);
  const annual = balances.find((b) => b.leaveType.code === 'PN');
  const unusedLeaveDays = annual?.remaining ? Number(annual.remaining) : 0;

  const remainingAdvance = emp.advances
    .flatMap((a) => a.schedule)
    .reduce((s, x) => s.plus(String(x.amount)), new Decimal(0));

  return { totalWorkedMonths, unemploymentInsuredMonths, avgSalary6Months, unusedLeaveDays, remainingAdvance: remainingAdvance.toNumber() };
}

/** Số ngày làm việc bình thường của tháng liền kề trước ngày nghỉ việc (NĐ 145/2020 Điều 67) — để quy ra lương ngày. */
function standardDaysBefore(date: Date): number {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
  return countWorkingDays(from, to) || 22;
}

function settle(rules: LaborRules, type: TerminationType, date: Date, v: { totalWorkedMonths: number; unemploymentInsuredMonths: number; avgSalary6Months: number; unusedLeaveDays: number }) {
  const eligibility = severanceEligibility(type, v.totalWorkedMonths, rules.severanceMinMonths);
  const r = calcFinalSettlement({
    totalWorkedMonths: v.totalWorkedMonths,
    // Không đủ điều kiện: coi như toàn bộ thời gian đã đóng BHTN → trợ cấp 0.
    unemploymentInsuredMonths: eligibility.eligible ? v.unemploymentInsuredMonths : v.totalWorkedMonths,
    avgSalary6Months: v.avgSalary6Months,
    unusedLeaveDays: v.unusedLeaveDays,
    isRedundancy: eligibility.isRedundancy,
    standardDaysPerMonth: standardDaysBefore(date),
    rules,
  });
  return {
    eligibility,
    severanceYears: r.severanceYears.toString(),
    severanceAmount: r.severanceAmount.toFixed(0),
    unusedLeaveAmount: r.unusedLeaveAmount.toFixed(0),
    total: r.total.toFixed(0),
  };
}

async function lockedUntil() {
  const p = await prisma.payPeriod.findFirst({ where: { status: { in: ['LOCKED', 'PAID'] } }, orderBy: { dateEnd: 'desc' } });
  return p?.dateEnd ?? null;
}

async function ensureElement(code: string, name: string, taxTreatment: 'TAXABLE' | 'EXEMPT', type: 'EARNING' | 'DEDUCTION' = 'EARNING') {
  return prisma.payElement.upsert({
    where: { code },
    update: {},
    create: { code, name, type, taxTreatment, isInsuranceBase: false, isProrated: false },
  });
}

export const offboardingService = {
  async preview(id: string, q: z.infer<typeof previewQuery>) {
    const { date, type } = q;
    const emp = await loadEmployment(id);
    const s = await suggest(emp, date);
    const used = {
      totalWorkedMonths: q.totalWorkedMonths ?? s.totalWorkedMonths,
      unemploymentInsuredMonths: q.unemploymentInsuredMonths ?? s.unemploymentInsuredMonths,
      avgSalary6Months: q.avgSalary6Months ?? s.avgSalary6Months,
      unusedLeaveDays: q.unusedLeaveDays ?? s.unusedLeaveDays,
    };
    const period = await prisma.payPeriod.findFirst({ where: { dateStart: { lte: date }, dateEnd: { gte: date } } });
    return {
      employee: { id: emp.id, codeEmp: emp.codeEmp, fullName: emp.person.fullName, dateHire: emp.dateHire, status: emp.status },
      suggested: s,
      settlement: settle((await getSettings()).laborRules, type, date, used),
      account: emp.person.user,
      period: period ? { id: period.id, code: period.code, status: period.status } : null,
      lockedUntil: await lockedUntil(),
      trainingRefunds: await trainingService.refundsOnLeave(id, date),
      assets: (await assetService.outstanding(id)).map((a) => ({ id: a.id, code: a.asset.code, name: a.asset.name, assignedAt: a.assignedAt })),
    };
  },

  /** Cho nghỉ việc: mọi bước trong một giao dịch. */
  async offboard(id: string, input: OffboardInput) {
    const emp = await loadEmployment(id);
    const date = input.dateTerminate;
    if (emp.status === 'TERMINATED') throw new ConflictError('Nhân viên đã nghỉ việc');
    if (date < emp.dateHire) throw new ValidationError('Ngày nghỉ việc phải sau ngày vào làm');
    const locked = await lockedUntil();
    if (locked && date <= locked) {
      throw new AppError(`Ngày nghỉ việc rơi vào kỳ lương đã khoá (đến ${formatDate(locked)})`, 409, 'PERIOD_LOCKED');
    }
    const result = settle((await getSettings()).laborRules, input.type, date, input);
    const period = await prisma.payPeriod.findFirst({ where: { dateStart: { lte: date }, dateEnd: { gte: date } } });
    const canPay = input.includeInPayroll && period && period.status !== 'LOCKED' && period.status !== 'PAID';
    const [severanceEl, leaveEl, refundEl] = canPay
      ? await Promise.all([
          ensureElement('TRO_CAP_TV', 'Trợ cấp thôi việc / mất việc', 'EXEMPT'),
          ensureElement('THANH_TOAN_PHEP', 'Thanh toán phép năm chưa nghỉ', 'TAXABLE'),
          ensureElement('BOI_HOAN_DT', 'Bồi hoàn chi phí đào tạo', 'EXEMPT', 'DEDUCTION'),
        ])
      : [null, null, null];

    const summary = await prisma.$transaction(async (tx) => {
      await tx.employment.update({
        where: { id },
        data: { status: 'TERMINATED', dateTerminate: date, terminationType: input.type, terminationNote: input.note ?? null },
      });
      // Vị trí công việc đang giữ → kết thúc, vị trí trở về trống.
      const open = await tx.assignment.findMany({ where: { employmentId: id, isDelete: false, endDate: null } });
      for (const a of open) {
        await tx.assignment.update({ where: { id: a.id }, data: { endDate: date } });
        await tx.position.update({ where: { id: a.positionId }, data: { status: 'VACANT' } });
      }
      // Hợp đồng lao động đang hiệu lực → chấm dứt; hợp đồng chưa bắt đầu → huỷ.
      const contracts = await tx.laborContract.findMany({ where: { employmentId: id, isDelete: false, terminatedDate: null } });
      let contractsEnded = 0;
      for (const c of contracts) {
        if (c.startDate > date) {
          await tx.laborContract.update({ where: { id: c.id }, data: { isDelete: true } });
        } else if (!c.endDate || c.endDate >= date) {
          await tx.laborContract.update({ where: { id: c.id }, data: { terminatedDate: date, terminateReason: TERMINATION_LABELS[input.type] } });
          contractsEnded++;
        }
      }
      // Phụ cấp cố định dừng từ ngày nghỉ.
      const elements = await tx.employeeElement.updateMany({ where: { employmentId: id, isDelete: false, endDate: null }, data: { endDate: date } });
      // Đơn nghỉ / làm thêm sau ngày nghỉ việc → huỷ.
      const leaves = await tx.leaveRequest.updateMany({
        where: { employmentId: id, status: { in: ['PENDING', 'APPROVED'] }, toDate: { gt: date } },
        data: { status: 'CANCELLED' },
      });
      const overtime = await tx.overtimeRequest.updateMany({
        where: { employmentId: id, status: { in: ['PENDING', 'APPROVED'] }, workDate: { gt: date } },
        data: { status: 'CANCELLED' },
      });
      // Khoá tài khoản đăng nhập (nếu không còn làm ở pháp nhân khác).
      let accountLocked = false;
      if (input.lockAccount && emp.person.user?.isActive) {
        const otherActive = await tx.employment.count({
          where: { personId: emp.personId, id: { not: id }, isDelete: false, status: { in: ['ACTIVE', 'PROBATION', 'SUSPENDED'] } },
        });
        if (otherActive === 0) {
          await tx.user.update({ where: { id: emp.person.user.id }, data: { isActive: false } });
          accountLocked = true;
        }
      }
      // Quyết toán vào kỳ lương.
      let paidIn: string | null = null;
      if (canPay && period) {
        if (Number(result.severanceAmount) > 0) {
          await tx.periodElement.create({
            data: { payPeriodId: period.id, employmentId: id, payElementId: severanceEl!.id, amount: result.severanceAmount, note: `${result.severanceYears} năm × ${input.type === 'REDUNDANCY' ? '1' : '1/2'} tháng lương` },
          });
        }
        if (Number(result.unusedLeaveAmount) > 0) {
          await tx.periodElement.create({
            data: { payPeriodId: period.id, employmentId: id, payElementId: leaveEl!.id, amount: result.unusedLeaveAmount, note: `${input.unusedLeaveDays} ngày phép chưa nghỉ` },
          });
        }
        if (input.trainingRefund > 0) {
          await tx.periodElement.create({
            data: { payPeriodId: period.id, employmentId: id, payElementId: refundEl!.id, amount: input.trainingRefund.toFixed(4), note: 'Nghỉ việc trước hết thời gian cam kết đào tạo' },
          });
        }
        paidIn = period.code;
      }
      return {
        positionsVacated: open.length,
        contractsEnded,
        elementsEnded: elements.count,
        leavesCancelled: leaves.count,
        overtimeCancelled: overtime.count,
        accountLocked,
        paidIn,
      };
    });
    // Danh sách việc nghỉ việc (kèm thu hồi tài sản còn giữ) — không chặn nếu lỗi.
    let checklistId: string | null = null;
    try {
      checklistId = (await checklistService.start(id, 'OFFBOARDING', date)).id;
    } catch (e) {
      console.error('Không tạo được danh sách việc nghỉ việc:', e instanceof Error ? e.message : e);
    }
    return { ...summary, settlement: result, checklistId };
  },
};
