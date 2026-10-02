import { getSettings } from '../settings/settings.service';
import Decimal from 'decimal.js';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { addDays, formatDate } from '../../common/utils/dates';
import { pickEffective } from '../../common/utils/effectiveDating';
import { holidaySet } from '../overtime/overtime.service';
import { calcLeaveDays } from '../leave/leave.logic';
import { loadLegalParams } from '../payroll/legal.service';
import { getCompany } from '../settings/settings.service';
import { notify } from '../notification/notification.service';
import {
  birthMonths,
  calcClaim,
  childSickDaysPerYear,
  miscarriageDays,
  paternityMaxDays,
  Regime,
  REGIME_LABEL,
  sickDaysPerYear,
  SICKNESS_REGIMES,
  WORKING_DAY_REGIMES,
} from './insurance.logic';

const REGIMES = ['SICK', 'CHILD_SICK', 'BIRTH', 'CHECKUP', 'MISCARRIAGE', 'PATERNITY', 'RECOVERY'] as const;

export const claimSchema = z
  .object({
    employmentId: z.string().uuid(),
    regime: z.enum(REGIMES),
    fromDate: z.coerce.date(),
    /** Bỏ trống với sinh con / sảy thai: tự tính theo số tháng / ngày luật định. */
    toDate: z.coerce.date().optional(),
    childBirthDate: z.coerce.date().optional(),
    childCount: z.number().int().min(1).max(6).optional(),
    /** Sảy thai: tuổi thai (tuần). */
    pregnancyWeeks: z.number().int().min(1).max(42).optional(),
    /** Sinh phẫu thuật / dưới 32 tuần (lao động nam khi vợ sinh). */
    surgery: z.boolean().optional(),
    /** Số năm đã đóng BHXH (ghi đè ước tính theo thời gian làm việc). */
    insuredYears: z.number().min(0).max(60).optional(),
    note: z.string().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.toDate && v.toDate < v.fromDate) ctx.addIssue({ code: 'custom', path: ['toDate'], message: 'Đến ngày phải sau từ ngày' });
    if (!['BIRTH', 'MISCARRIAGE'].includes(v.regime) && !v.toDate) ctx.addIssue({ code: 'custom', path: ['toDate'], message: 'Cần ngày kết thúc' });
    if (v.regime === 'CHILD_SICK' && !v.childBirthDate) ctx.addIssue({ code: 'custom', path: ['childBirthDate'], message: 'Cần ngày sinh của con' });
    if (v.regime === 'PATERNITY' && !v.childBirthDate) ctx.addIssue({ code: 'custom', path: ['childBirthDate'], message: 'Cần ngày sinh của con' });
    if (v.regime === 'MISCARRIAGE' && !v.pregnancyWeeks) ctx.addIssue({ code: 'custom', path: ['pregnancyWeeks'], message: 'Cần tuổi thai (tuần)' });
  });
export type ClaimInput = z.infer<typeof claimSchema>;

const include = {
  employment: { select: { id: true, codeEmp: true, person: { select: { id: true, fullName: true, socialInsNo: true, idNo: true } } } },
} as const;

const addMonthsUTC = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));

/** Lương đóng BHXH tháng liền kề và bình quân 6 tháng trước ngày nghỉ (từ bảng lương; thiếu thì lấy lương hợp đồng). */
async function salaryBases(employmentId: string, before: Date) {
  const results = await prisma.payrollResult.findMany({
    where: { employmentId, empInsurance: { gt: 0 }, payPeriod: { dateEnd: { lt: before }, periodType: 'REGULAR' } },
    orderBy: { payPeriod: { dateEnd: 'desc' } },
    take: 6,
    select: { insuranceBase: true, payPeriod: { select: { code: true } } },
  });
  const salaries = await prisma.employeeSalary.findMany({ where: { employmentId, isDelete: false } });
  const s = pickEffective(salaries, before) ?? salaries.sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];
  const contract = s ? new Decimal(String(s.insuranceSalary ?? s.baseAmount)) : new Decimal(0);
  const last = results[0] ? new Decimal(String(results[0].insuranceBase)) : contract;
  const avg6 = results.length ? results.reduce((acc, r) => acc.plus(String(r.insuranceBase)), new Decimal(0)).div(results.length) : contract;
  return { last, avg6, months: results.map((r) => r.payPeriod.code), fromPayroll: results.length > 0 };
}

/** Số tháng đã đóng BHXH trong 12 tháng trước một ngày (điều kiện hưởng thai sản). */
async function insuredMonthsIn12(employmentId: string, before: Date) {
  return prisma.payrollResult.count({
    where: { employmentId, empInsurance: { gt: 0 }, payPeriod: { periodType: 'REGULAR', dateEnd: { lt: before, gte: addMonthsUTC(before, -12) } } },
  });
}

export const insuranceService = {
  list(filter: { year?: number; status?: string; employmentId?: string; regime?: string }) {
    return prisma.insuranceClaim.findMany({
      where: {
        ...(filter.employmentId ? { employmentId: filter.employmentId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.regime ? { regime: filter.regime } : {}),
        ...(filter.year ? { fromDate: { gte: new Date(Date.UTC(filter.year, 0, 1)), lte: new Date(Date.UTC(filter.year, 11, 31)) } } : {}),
      },
      include,
      orderBy: { fromDate: 'desc' },
    });
  },

  /** Tính thử: số ngày, căn cứ, số tiền, ngày còn được hưởng, cảnh báo — không ghi gì. */
  async preview(input: ClaimInput, excludeId?: string) {
    const emp = await prisma.employment.findFirst({
      where: { id: input.employmentId, isDelete: false },
      include: {
        person: { include: { employments: { where: { isDelete: false }, select: { dateHire: true, dateTerminate: true } } } },
        assignments: { where: { isDelete: false, isPrimary: true }, include: { position: { include: { job: true } } } },
      },
    });
    if (!emp) throw new NotFoundError('Không tìm thấy hợp đồng lao động');
    const regime = input.regime as Regime;
    const warnings: string[] = [];
    const sys = await getSettings();
    const rules = sys.laborRules;

    // Khoảng ngày
    let toDate = input.toDate ?? input.fromDate;
    const childCount = input.childCount ?? 1;
    if (regime === 'BIRTH') toDate = addDays(addMonthsUTC(input.fromDate, Math.ceil(birthMonths(childCount, rules))), -1);
    if (regime === 'MISCARRIAGE') toDate = addDays(input.fromDate, miscarriageDays(input.pregnancyWeeks!, rules) - 1);
    const holidays = await holidaySet(input.fromDate, toDate);
    const calendarDays = Math.round((toDate.getTime() - input.fromDate.getTime()) / 86_400_000) + 1;
    const workingDays = calcLeaveDays(input.fromDate, toDate, false, holidays).toNumber();
    let days = WORKING_DAY_REGIMES.includes(regime) ? workingDays : calendarDays;

    // Giới hạn theo luật
    const insuredYears =
      input.insuredYears ??
      Math.round(
        (emp.person.employments.reduce((ms, e) => ms + Math.max(0, ((e.dateTerminate ?? input.fromDate).getTime() - e.dateHire.getTime()) / (30.44 * 86_400_000)), 0) / 12) * 10,
      ) / 10;
    const hazardous = emp.assignments.some((a) => a.position.job?.isHazardous);
    const year = input.fromDate.getUTCFullYear();
    const yearRange = { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) };
    let limit: number | null = null;
    let used = 0;
    if (regime === 'SICK') {
      limit = sickDaysPerYear(insuredYears, hazardous, rules);
      const prev = await prisma.insuranceClaim.findMany({ where: { employmentId: emp.id, regime: 'SICK', status: { not: 'REJECTED' }, fromDate: yearRange, ...(excludeId ? { id: { not: excludeId } } : {}) } });
      used = prev.reduce((n, c) => n + Number(c.days), 0);
    } else if (regime === 'CHILD_SICK') {
      limit = childSickDaysPerYear(input.childBirthDate!, input.fromDate, rules);
      if (limit === 0) throw new ValidationError('Con từ đủ 7 tuổi không thuộc chế độ chăm con ốm');
      const prev = await prisma.insuranceClaim.findMany({
        where: { employmentId: emp.id, regime: 'CHILD_SICK', childBirthDate: input.childBirthDate, status: { not: 'REJECTED' }, fromDate: yearRange, ...(excludeId ? { id: { not: excludeId } } : {}) },
      });
      used = prev.reduce((n, c) => n + Number(c.days), 0);
    } else if (regime === 'PATERNITY') {
      limit = paternityMaxDays(childCount, !!input.surgery, rules);
      const deadline = addDays(input.childBirthDate!, rules.paternityWithinDays);
      if (toDate > deadline) warnings.push(`Phải nghỉ trong ${rules.paternityWithinDays} ngày kể từ ngày vợ sinh (đến ${formatDate(deadline)})`);
    } else if (regime === 'CHECKUP') {
      limit = rules.checkupMaxDays;
      if (days > rules.checkupMaxDays) warnings.push(`Mỗi lần khám thai tối đa ${rules.checkupMaxDays} ngày`);
    } else if (regime === 'RECOVERY') {
      limit = sys.benefits.recoveryMaxDays;
    }
    if (limit !== null && days > limit - used) {
      if (regime === 'SICK' || regime === 'CHILD_SICK') {
        warnings.push(`Vượt số ngày được hưởng trong năm: còn ${Math.max(0, limit - used)}/${limit} ngày — chỉ tính phần trong hạn`);
        days = Math.max(0, limit - used);
      } else {
        throw new ValidationError(`Tối đa ${limit} ngày cho chế độ ${REGIME_LABEL[regime]}`);
      }
    }
    if (days <= 0 && regime !== 'BIRTH') throw new ValidationError('Không còn ngày được hưởng');

    // Điều kiện thai sản sinh con: đóng đủ 6 tháng trong 12 tháng trước khi sinh
    if (regime === 'BIRTH') {
      const n = await insuredMonthsIn12(emp.id, input.childBirthDate ?? input.fromDate);
      if (n < 6) warnings.push(`Hệ thống chỉ thấy ${n} tháng đóng BHXH trong 12 tháng trước khi sinh (cần đủ 6) — đối chiếu sổ BHXH`);
    }

    // Bảng công ưu tiên dữ liệu chấm công hơn đơn nghỉ → ngày đã chấm "đi làm" vẫn được trả lương.
    const worked = await prisma.attendanceRecord.count({
      where: { employmentId: emp.id, workDate: { gte: input.fromDate, lte: toDate }, status: { in: ['PRESENT', 'LATE', 'REMOTE'] } },
    });
    if (worked > 0) warnings.push(`Có ${worked} ngày đã chấm công đi làm trong thời gian nghỉ — xoá / sửa ở Bảng công, nếu không những ngày đó vẫn tính lương`);

    const bases = await salaryBases(emp.id, input.fromDate);
    if (!bases.fromPayroll) warnings.push('Chưa có bảng lương trước ngày nghỉ — tạm tính theo lương đóng BH trên hợp đồng');
    const legal = await loadLegalParams(input.fromDate);
    const r = calcClaim({ regime, days, lastMonthSalary: bases.last, avg6Salary: bases.avg6, baseSalary: legal.baseSalary, childCount, rules });

    return {
      employee: { id: emp.id, codeEmp: emp.codeEmp, fullName: emp.person.fullName },
      regime,
      regimeLabel: REGIME_LABEL[regime],
      fromDate: input.fromDate,
      toDate,
      days,
      calendarDays,
      workingDays,
      months: r.months,
      baseAmount: r.baseAmount.toFixed(0),
      perDay: r.perDay.toFixed(0),
      amount: r.amount.toFixed(0),
      lumpSum: r.lumpSum.toFixed(0),
      formula: r.formula,
      entitlement: limit !== null ? { limit, used, remaining: Math.max(0, limit - used - days) } : null,
      insuredYears,
      hazardous,
      salaryMonths: bases.months,
      warnings,
    };
  },

  /** Lập hồ sơ: lưu số liệu + ghi đơn nghỉ đã duyệt (loại OM / TS, không lương công ty) để trừ khỏi công. */
  async create(input: ClaimInput, userId?: string) {
    const p = await this.preview(input);
    const typeCode = SICKNESS_REGIMES.includes(p.regime) ? 'OM' : 'TS';
    const leaveType = await prisma.leaveType.findUnique({ where: { code: typeCode } });
    const overlap = await prisma.leaveRequest.findFirst({
      where: { employmentId: input.employmentId, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: p.toDate }, toDate: { gte: p.fromDate } },
    });
    if (overlap) throw new ConflictError('Trùng thời gian với một đơn nghỉ khác — huỷ / sửa đơn đó trước');
    const claim = await prisma.$transaction(async (tx) => {
      let leaveRequestId: string | null = null;
      if (leaveType && p.workingDays > 0) {
        const lr = await tx.leaveRequest.create({
          data: {
            employmentId: input.employmentId,
            leaveTypeId: leaveType.id,
            fromDate: p.fromDate,
            toDate: p.toDate,
            days: String(p.workingDays),
            reason: `${p.regimeLabel} (hồ sơ BHXH)`,
            status: 'APPROVED',
            approvalStage: 'HR',
            reviewedById: userId ?? null,
            reviewedAt: new Date(),
          },
        });
        leaveRequestId = lr.id;
      }
      return tx.insuranceClaim.create({
        data: {
          employmentId: input.employmentId,
          regime: p.regime,
          fromDate: p.fromDate,
          toDate: p.toDate,
          days: String(p.days),
          months: p.months === null ? null : String(p.months),
          baseAmount: p.baseAmount,
          amount: p.amount,
          lumpSum: p.lumpSum,
          childCount: input.childCount ?? null,
          childBirthDate: input.childBirthDate ?? null,
          detail: { formula: p.formula, entitlement: p.entitlement, insuredYears: p.insuredYears, hazardous: p.hazardous, salaryMonths: p.salaryMonths, warnings: p.warnings },
          note: input.note ?? null,
          leaveRequestId,
        },
        include,
      });
    });
    return { claim, warnings: p.warnings };
  },

  /** DRAFT → SUBMITTED → PAID / REJECTED. */
  async setStatus(id: string, status: 'SUBMITTED' | 'PAID' | 'REJECTED' | 'DRAFT') {
    const c = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!c) throw new NotFoundError('Không tìm thấy hồ sơ');
    const allowed: Record<string, string[]> = { DRAFT: ['SUBMITTED'], SUBMITTED: ['PAID', 'REJECTED', 'DRAFT'], REJECTED: ['DRAFT'], PAID: [] };
    if (!allowed[c.status].includes(status)) throw new ConflictError(`Không chuyển được từ ${c.status} sang ${status}`);
    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data: { status, ...(status === 'SUBMITTED' ? { submittedAt: new Date() } : {}), ...(status === 'PAID' ? { paidAt: new Date() } : {}) },
      include,
    });
    if (status === 'PAID' || status === 'REJECTED') {
      void notify.employment(c.employmentId, {
        title: status === 'PAID' ? `BHXH đã chi trả chế độ ${REGIME_LABEL[c.regime as Regime].toLowerCase()}` : `Hồ sơ BHXH bị từ chối: ${REGIME_LABEL[c.regime as Regime]}`,
        body: status === 'PAID' ? `${Number(c.amount) + Number(c.lumpSum)} đồng` : undefined,
        link: '/me',
      });
    }
    return updated;
  },

  /** Đưa tiền chế độ BHXH đã nhận vào kỳ lương đang mở (khoản miễn thuế, không tính BH). */
  async payViaPayroll(id: string, payPeriodId: string) {
    const c = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!c) throw new NotFoundError('Không tìm thấy hồ sơ');
    if (c.status !== 'PAID') throw new ConflictError('Chỉ đưa vào lương khi BHXH đã chi trả');
    if (c.periodElementId) throw new ConflictError('Hồ sơ đã được đưa vào lương');
    const period = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
    if (!period || ['LOCKED', 'PAID', 'CANCELLED'].includes(period.status)) throw new ConflictError('Kỳ lương không mở');
    const el = await prisma.payElement.upsert({
      where: { code: 'TRO_CAP_BHXH' },
      update: {},
      create: { code: 'TRO_CAP_BHXH', name: 'Trợ cấp BHXH (ốm đau, thai sản)', type: 'EARNING', taxTreatment: 'EXEMPT', isInsuranceBase: false, isProrated: false },
    });
    return prisma.$transaction(async (tx) => {
      const pe = await tx.periodElement.create({
        data: { payPeriodId, employmentId: c.employmentId, payElementId: el.id, amount: new Decimal(String(c.amount)).plus(String(c.lumpSum)).toFixed(4), note: `${REGIME_LABEL[c.regime as Regime]} ${formatDate(c.fromDate)} – ${formatDate(c.toDate)}` },
      });
      return tx.insuranceClaim.update({ where: { id }, data: { periodElementId: pe.id }, include });
    });
  },

  /** Xoá hồ sơ nháp và huỷ đơn nghỉ đi kèm. */
  async remove(id: string) {
    const c = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!c) throw new NotFoundError('Không tìm thấy hồ sơ');
    if (c.status !== 'DRAFT') throw new ConflictError('Chỉ xoá được hồ sơ nháp');
    await prisma.$transaction(async (tx) => {
      await tx.insuranceClaim.delete({ where: { id } });
      if (c.leaveRequestId) await tx.leaveRequest.update({ where: { id: c.leaveRequestId }, data: { status: 'CANCELLED' } });
    });
  },

  /** Danh sách đề nghị giải quyết chế độ (tham khảo mẫu 01B-HSB) — các hồ sơ đã nộp / đang nháp trong tháng. */
  async exportXlsx(month: string) {
    const [y, m] = month.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));
    const rows = await prisma.insuranceClaim.findMany({
      where: { status: { in: ['DRAFT', 'SUBMITTED', 'PAID'] }, fromDate: { lte: to }, toDate: { gte: from } },
      include,
      orderBy: [{ regime: 'asc' }, { fromDate: 'asc' }],
    });
    const company = await getCompany();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('01B-HSB');
    const cols: Array<[string, number]> = [
      ['STT', 6], ['Họ và tên', 26], ['Mã số BHXH', 14], ['Số CCCD', 15], ['Chế độ', 30], ['Từ ngày', 12], ['Đến ngày', 12],
      ['Số ngày / tháng', 12], ['Tiền lương tính hưởng', 16], ['Số tiền đề nghị', 16], ['Trợ cấp một lần', 14], ['Trạng thái', 12], ['Ghi chú', 30],
    ];
    const title = (t: string, bold = false) => {
      const r = ws.addRow([t]);
      ws.mergeCells(r.number, 1, r.number, cols.length);
      r.font = { bold, size: bold ? 13 : 11 };
      r.alignment = { horizontal: 'center' };
    };
    title('DANH SÁCH ĐỀ NGHỊ GIẢI QUYẾT HƯỞNG CHẾ ĐỘ ỐM ĐAU, THAI SẢN, DƯỠNG SỨC PHỤC HỒI SỨC KHOẺ (tham khảo mẫu 01B-HSB)', true);
    title(`Đơn vị: ${company.name}${company.taxCode ? ` — MST: ${company.taxCode}` : ''} · Tháng ${String(m).padStart(2, '0')}/${y}`);
    ws.addRow([]);
    const h = ws.addRow(cols.map((c) => c[0]));
    h.font = { bold: true };
    h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cols.forEach((c, i) => (ws.getColumn(i + 1).width = c[1]));
    const STATUS: Record<string, string> = { DRAFT: 'Nháp', SUBMITTED: 'Đã nộp', PAID: 'Đã chi' };
    rows.forEach((c, i) =>
      ws.addRow([
        i + 1, c.employment.person.fullName, c.employment.person.socialInsNo ?? '', c.employment.person.idNo ?? '', REGIME_LABEL[c.regime as Regime],
        formatDate(c.fromDate).split('-').reverse().join('/'), formatDate(c.toDate).split('-').reverse().join('/'),
        c.months ? `${Number(c.months)} tháng` : Number(c.days), Number(c.baseAmount), Number(c.amount), Number(c.lumpSum) || null, STATUS[c.status] ?? c.status, c.note ?? '',
      ]),
    );
    [9, 10, 11].forEach((k) => (ws.getColumn(k).numFmt = '#,##0'));
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `de-nghi-BHXH-${month}.xlsx` };
  },
};
