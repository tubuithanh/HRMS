import { Prisma } from '@prisma/client';
import { prisma, TxClient } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../common/errors/AppError';
import { pickEffective } from '../../common/utils/effectiveDating';
import { toDbString } from '../../common/utils/money';
import { calcPayroll } from './payroll.calc';
import { aggregateElements } from './pay-element';
import { buildPayrollInput, calcPaidDays, ElementDef } from './payroll.inputs';
import { countWorkingDays } from '../../common/utils/dates';
import { summarizeMonth } from '../attendance/attendance.logic';
import { holidaySet } from '../overtime/overtime.service';
import { buildDetailedPayslip, PayrollSnapshot } from './payslip.detail';
import { legalSummary, loadLegalParams } from './legal.service';

export interface CreatePayPeriodInput {
  code: string;
  periodType?: string;
  dateStart: Date;
  dateEnd: Date;
  payDate?: Date;
}

export interface RunPayrollInput {
  payPeriodId: string;
  /** Vùng lương tối thiểu áp dụng (đơn giản hoá: một vùng cho cả kỳ). */
  region: number;
  /** Giới hạn theo danh sách nhân viên; để trống là toàn bộ đang làm việc. */
  employmentIds?: string[];
}

/** Chuyển bản ghi PayElement của Prisma sang định nghĩa dùng cho tính lương. */
function toElementDef(e: {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  taxTreatment: 'TAXABLE' | 'PARTIAL_EXEMPT' | 'EXEMPT';
  taxExemptLimit: Prisma.Decimal | null;
  isInsuranceBase: boolean;
  isProrated: boolean;
}): ElementDef {
  return {
    code: e.code,
    name: e.name,
    type: e.type,
    taxTreatment: e.taxTreatment,
    taxExemptLimit: e.taxExemptLimit === null ? null : String(e.taxExemptLimit),
    isInsuranceBase: e.isInsuranceBase,
    isProrated: e.isProrated,
  };
}

/** Trả các kỳ tạm ứng đã gán cho kỳ lương này về trạng thái chưa trừ. */
async function resetAdvancesForPeriod(payPeriodId: string) {
  const items = await prisma.advanceSchedule.findMany({
    where: { payPeriodId },
    select: { advanceId: true },
  });
  if (items.length === 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.advanceSchedule.updateMany({
      where: { payPeriodId },
      data: { isDeducted: false, payPeriodId: null },
    });
    await refreshAdvanceStatus(tx, items.map((i) => i.advanceId));
  });
}

/** APPROVED: chưa trừ kỳ nào; DEDUCTING: đang trừ; DONE: đã trừ hết. */
async function refreshAdvanceStatus(tx: TxClient, advanceIds: string[]) {
  for (const id of new Set(advanceIds)) {
    const [done, total] = await Promise.all([
      tx.advanceSchedule.count({ where: { advanceId: id, isDeducted: true } }),
      tx.advanceSchedule.count({ where: { advanceId: id } }),
    ]);
    await tx.advance.update({
      where: { id },
      data: { status: done === 0 ? 'APPROVED' : done === total ? 'DONE' : 'DEDUCTING' },
    });
  }
}

export const payrollService = {
  // ---------- Kỳ lương ----------
  async createPeriod(input: CreatePayPeriodInput) {
    const dup = await prisma.payPeriod.findUnique({
      where: { code: input.code },
    });
    if (dup) throw new ConflictError('Kỳ lương đã tồn tại');
    if (input.dateEnd < input.dateStart) {
      throw new ConflictError('Ngày kết thúc phải sau ngày bắt đầu');
    }
    return prisma.payPeriod.create({
      data: {
        code: input.code,
        periodType: input.periodType ?? 'REGULAR',
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
        payDate: input.payDate,
        status: 'OPEN',
      },
    });
  },

  async listPeriods() {
    return prisma.payPeriod.findMany({ orderBy: { dateStart: 'desc' } });
  },

  async getPeriodResults(payPeriodId: string) {
    const period = await prisma.payPeriod.findUnique({
      where: { id: payPeriodId },
      include: {
        results: {
          include: {
            employment: {
              include: { person: { select: { fullName: true, personCode: true } } },
            },
          },
        },
      },
    });
    if (!period) throw new NotFoundError('Không tìm thấy kỳ lương');
    return period;
  },

  // ---------- Chạy tính lương hàng loạt ----------
  /**
   * Tính lương cho một kỳ và LƯU kết quả từng nhân viên.
   * - Chặn chạy nếu kỳ đã khóa.
   * - Với mỗi nhân viên làm việc trong kỳ (kể cả nghỉ việc giữa kỳ):
   *   lương cơ bản + khoản cố định đang hiệu lực (theo ngày cuối kỳ), khoản
   *   phát sinh của kỳ, tạm ứng đến hạn, ngày công từ bảng công → calcPayroll.
   *   Quy tắc chia theo công và BH: xem payroll.inputs.ts.
   * - Lưu kèm snapshot dữ liệu đầu vào để kiểm tra lại về sau.
   * - Dùng upsert theo (payPeriodId, employmentId) để chạy lại được; các kỳ
   *   tạm ứng đã gán cho kỳ này được trả lại trước khi tính lại.
   */
  async run(input: RunPayrollInput) {
    const period = await prisma.payPeriod.findUnique({
      where: { id: input.payPeriodId },
    });
    if (!period) throw new NotFoundError('Không tìm thấy kỳ lương');
    if (period.status === 'LOCKED' || period.status === 'PAID') {
      throw new ConflictError('Kỳ lương đã khóa, không thể tính lại');
    }

    const start = period.dateStart;
    const asOf = period.dateEnd;
    const standardDays = countWorkingDays(start, asOf);

    // Chạy lại: trả các kỳ tạm ứng đã trừ ở lần chạy trước về chưa trừ.
    await resetAdvancesForPeriod(period.id);

    // Nhân viên có làm việc trong kỳ
    const employments = await prisma.employment.findMany({
      where: {
        isDelete: false,
        dateHire: { lte: asOf },
        OR: [
          { status: { in: ['ACTIVE', 'PROBATION'] } },
          { status: 'TERMINATED', dateTerminate: { gte: start } },
        ],
        ...(input.employmentIds && input.employmentIds.length > 0
          ? { id: { in: input.employmentIds } }
          : {}),
      },
      include: {
        salaries: { where: { isDelete: false } },
        taxProfiles: true,
        person: { include: { dependants: { where: { isDelete: false } } } },
        recurringElements: {
          where: { isDelete: false, payElement: { isActive: true } },
          include: { payElement: true },
        },
        periodElements: {
          where: { payPeriodId: period.id },
          include: { payElement: true },
        },
        attendanceRecords: {
          where: { workDate: { gte: start, lte: asOf } },
          select: { workDate: true, status: true },
        },
        leaveRequests: {
          where: { status: 'APPROVED', fromDate: { lte: asOf }, toDate: { gte: start } },
          select: { fromDate: true, toDate: true, isHalfDay: true, leaveType: { select: { isPaid: true } } },
        },
        overtimeRequests: {
          where: { status: 'APPROVED', workDate: { gte: start, lte: asOf } },
          select: { workDate: true, hours: true, multiplier: true },
        },
        advances: {
          where: { status: { in: ['APPROVED', 'DEDUCTING'] } },
          include: { schedule: { where: { isDeducted: false }, orderBy: { index: 'asc' } } },
        },
      },
    });

    const holidays = await holidaySet(start, asOf);
    // Tham số pháp lý (giảm trừ, lương cơ sở, biểu thuế, tỷ lệ BH) hiệu lực vào ngày cuối kỳ.
    const legal = await loadLegalParams(asOf);

    const errors: Array<{ employmentId: string; message: string }> = [];
    const warnings: Array<{ employmentId: string; message: string }> = [];
    let success = 0;

    for (const emp of employments) {
      try {
        // Lương đang hiệu lực tại ngày cuối kỳ
        type SalaryRow = {
          effectiveDate: Date;
          endDate: Date | null;
          baseAmount: unknown;
          insuranceSalary: unknown;
        };
        const salary = pickEffective<SalaryRow>(
          emp.salaries as SalaryRow[],
          asOf,
        );
        if (!salary) {
          errors.push({
            employmentId: emp.id,
            message: 'Không có lương hiệu lực trong kỳ',
          });
          continue;
        }

        // Hồ sơ thuế đang hiệu lực (mặc định lũy tiến nếu chưa khai)
        type TaxRow = {
          effectiveDate: Date;
          endDate: Date | null;
          taxMethod: string;
        };
        const taxProfile = pickEffective<TaxRow>(
          emp.taxProfiles as TaxRow[],
          asOf,
        );
        const taxMethod =
          taxProfile?.taxMethod === 'FLAT_10'
            ? 'FLAT_10'
            : taxProfile?.taxMethod === 'FLAT_20'
              ? 'FLAT_20'
              : 'PROGRESSIVE';

        // Đếm người phụ thuộc có hiệu lực trong kỳ (theo tháng giảm trừ)
        const dependantCount = emp.person.dependants.filter(
          (d: (typeof emp.person.dependants)[number]) => {
            const from = d.deductionFromMonth ?? emp.dateHire;
            const to = d.deductionToMonth ?? asOf;
            return from <= asOf && to >= period.dateStart;
          },
        ).length;

        // Ngày công: chỉ trong thời gian còn làm việc của kỳ.
        const employedStart = emp.dateHire > start ? emp.dateHire : start;
        const employedEnd =
          emp.dateTerminate && emp.dateTerminate < asOf ? emp.dateTerminate : asOf;
        const sheet = summarizeMonth(
          employedStart,
          employedEnd,
          emp.attendanceRecords,
          emp.leaveRequests.map((l) => ({
            fromDate: l.fromDate,
            toDate: l.toDate,
            isHalfDay: l.isHalfDay,
            isPaid: l.leaveType.isPaid,
          })),
          holidays,
          emp.overtimeRequests.map((o) => ({ workDate: o.workDate, hours: Number(o.hours) })),
        );
        const paidDays = calcPaidDays(sheet.standardDays, sheet.unpaidLeave, sheet.absent);

        // Khoản cố định: mỗi khoản lấy dòng đang hiệu lực tại ngày cuối kỳ.
        const byElement = new Map<string, typeof emp.recurringElements>();
        for (const r of emp.recurringElements) {
          byElement.set(r.payElementId, [...(byElement.get(r.payElementId) ?? []), r]);
        }
        const recurring = [...byElement.values()]
          .map((rows) => pickEffective(rows, asOf))
          .filter((r): r is (typeof emp.recurringElements)[number] => !!r)
          .map((r) => ({ element: toElementDef(r.payElement), amount: String(r.amount) }));

        const oneOff = emp.periodElements.map((p) => ({
          element: toElementDef(p.payElement),
          amount: String(p.amount),
        }));

        // Tạm ứng: mỗi khoản trừ kỳ tiếp theo chưa trừ.
        // Mỗi khoản tạm ứng trừ một kỳ; người nghỉ việc trong kỳ này thì trừ hết phần còn lại.
        const leavingNow = !!emp.dateTerminate && emp.dateTerminate >= start && emp.dateTerminate <= asOf;
        const dueSchedules = emp.advances.flatMap((a) => (leavingNow ? a.schedule : a.schedule.slice(0, 1)));

        // Khấu trừ kỳ trước chưa trừ hết (vượt trần 30%) → trừ tiếp kỳ này.
        const prevResult = await prisma.payrollResult.findFirst({
          where: { employmentId: emp.id, payPeriod: { dateEnd: { lt: start } } },
          orderBy: { payPeriod: { dateEnd: 'desc' } },
          select: { deferredDeduction: true },
        });
        const carriedDeduction = prevResult ? String(prevResult.deferredDeduction) : '0';

        // salary.baseAmount là Decimal của Prisma; String() giữ nguyên giá trị.
        const base = String(salary.baseAmount);
        const insSalary = salary.insuranceSalary
          ? String(salary.insuranceSalary)
          : base;

        const built = buildPayrollInput({
          baseSalary: base,
          contractInsuranceSalary: insSalary,
          recurring,
          oneOff,
          advanceDeductions: dueSchedules.map((s) => String(s.amount)),
          carriedDeduction,
          standardDays,
          paidDays,
          overtime: emp.overtimeRequests.map((o) => ({ hours: String(o.hours), multiplier: String(o.multiplier) })),
        });
        const agg = aggregateElements(built.lines);

        const result = calcPayroll({
          taxableEarnings: [agg.taxableEarnings],
          nonTaxableEarnings: [agg.nonTaxableEarnings],
          insuranceSalary: built.insuranceSalary,
          region: input.region,
          dependantCount,
          taxMethod,
          otherDeductions: agg.otherDeductions,
          legal,
        });

        if (result.deferredDeduction.gt(0)) {
          warnings.push({
            employmentId: emp.id,
            message: `Khấu trừ vượt trần 30% lương thực trả, còn ${result.deferredDeduction.toFixed(0)}đ chưa trừ`,
          });
        }

        const values = {
          grossIncome: toDbString(result.grossIncome),
          taxableIncome: toDbString(result.taxableIncome),
          insuranceBase: toDbString(result.insuranceBase),
          empInsurance: toDbString(result.empInsurance),
          companyInsurance: toDbString(result.companyInsurance),
          selfDeduction: toDbString(result.selfDeduction),
          dependantCount: result.dependantCount,
          dependantDeduction: toDbString(result.dependantDeduction),
          assessableIncome: toDbString(result.assessableIncome),
          pitAmount: toDbString(result.pitAmount),
          standardDays,
          paidDays: paidDays.toString(),
          otherDeductions: toDbString(result.appliedOtherDeductions),
          deferredDeduction: toDbString(result.deferredDeduction),
          netPay: toDbString(result.netPay),
          snapshotJson: {
            base,
            insSalary,
            region: input.region,
            taxMethod,
            dependantCount,
            standardDays,
            paidDays: paidDays.toString(),
            unpaidLeave: sheet.unpaidLeave,
            absent: sheet.absent,
            overtimeHours: sheet.overtimeHours,
            insuranceExempt: built.insuranceExempt,
            legal: legalSummary(legal),
            lines: built.lines.map((l) => ({
              code: l.code,
              name: l.name,
              type: l.type,
              amount: String(l.amount),
              taxTreatment: l.taxTreatment ?? 'TAXABLE',
            })),
          },
        };

        await prisma.$transaction(async (tx) => {
          await tx.payrollResult.upsert({
            where: {
              payPeriodId_employmentId: {
                payPeriodId: period.id,
                employmentId: emp.id,
              },
            },
            update: values,
            create: { payPeriodId: period.id, employmentId: emp.id, ...values },
          });
          // Đánh dấu kỳ tạm ứng đã trừ ở kỳ lương này.
          for (const s of dueSchedules) {
            await tx.advanceSchedule.update({
              where: { id: s.id },
              data: { isDeducted: true, payPeriodId: period.id },
            });
          }
          await refreshAdvanceStatus(tx, emp.advances.map((a) => a.id));
        });
        success++;
      } catch (e) {
        errors.push({
          employmentId: emp.id,
          message: e instanceof Error ? e.message : 'Lỗi không xác định',
        });
      }
    }

    await prisma.payPeriod.update({
      where: { id: period.id },
      data: { status: 'CALCULATED' },
    });

    return {
      total: employments.length,
      success,
      errorCount: errors.length,
      errors,
      warnings,
      standardDays,
    };
  },

  /**
   * Dữ liệu phiếu lương từ một kết quả đã lưu.
   * ownPersonId: nhân viên chỉ xem được phiếu của mình, và chỉ khi kỳ đã khoá.
   */
  async payslipForResult(resultId: string, ownPersonId?: string) {
    const r = await prisma.payrollResult.findUnique({
      where: { id: resultId },
      include: {
        payPeriod: true,
        employment: {
          include: {
            person: true,
            company: true,
            assignments: {
              where: { isDelete: false, isPrimary: true },
              orderBy: { effectiveDate: 'desc' },
              include: { orgStructure: true, position: { include: { job: true } } },
            },
          },
        },
      },
    });
    const visible =
      r &&
      (!ownPersonId ||
        (r.employment.personId === ownPersonId &&
          (r.payPeriod.status === 'LOCKED' || r.payPeriod.status === 'PAID')));
    if (!visible) throw new NotFoundError('Không tìm thấy phiếu lương');
    // Vị trí đang giữ vào ngày cuối kỳ.
    const asOf = r.payPeriod.dateEnd;
    const assignment =
      r.employment.assignments.find((a) => a.effectiveDate <= asOf && (!a.endDate || a.endDate >= asOf)) ??
      r.employment.assignments[0];
    return buildDetailedPayslip({
      companyName: r.employment.company.name,
      employeeName: r.employment.person.fullName,
      employeeCode: r.employment.codeEmp,
      orgName: assignment?.orgStructure.name ?? null,
      jobName: assignment?.position.job.name ?? null,
      periodCode: r.payPeriod.code,
      periodStart: r.payPeriod.dateStart,
      periodEnd: r.payPeriod.dateEnd,
      payDate: r.payPeriod.payDate,
      result: {
        grossIncome: String(r.grossIncome),
        taxableIncome: String(r.taxableIncome),
        insuranceBase: String(r.insuranceBase),
        empInsurance: String(r.empInsurance),
        companyInsurance: String(r.companyInsurance),
        selfDeduction: String(r.selfDeduction),
        dependantCount: r.dependantCount,
        dependantDeduction: String(r.dependantDeduction),
        assessableIncome: String(r.assessableIncome),
        pitAmount: String(r.pitAmount),
        otherDeductions: String(r.otherDeductions),
        deferredDeduction: String(r.deferredDeduction),
        netPay: String(r.netPay),
      },
      snapshot: (r.snapshotJson ?? null) as PayrollSnapshot | null,
      legal: await loadLegalParams(r.payPeriod.dateEnd),
    });
  },

  /** Khóa kỳ lương — sau khi khóa không tính lại được. */
  async lockPeriod(payPeriodId: string) {
    const period = await prisma.payPeriod.findUnique({
      where: { id: payPeriodId },
    });
    if (!period) throw new NotFoundError('Không tìm thấy kỳ lương');
    if (period.status === 'OPEN') {
      throw new ConflictError('Chưa tính lương thì chưa thể khóa');
    }
    return prisma.payPeriod.update({
      where: { id: payPeriodId },
      data: { status: 'LOCKED' },
    });
  },
};
