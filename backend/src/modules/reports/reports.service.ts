import Decimal from 'decimal.js';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../common/errors/AppError';
import { formatDate, monthRange, yearRange } from '../../common/utils/dates';
import { pickEffective } from '../../common/utils/effectiveDating';
import { loadLegalParams } from '../payroll/legal.service';
import { getCompany } from '../settings/settings.service';
import {
  annualSettlement,
  bankName,
  ChangeKind,
  insuranceChanges,
  InsuranceEmpMeta,
  pit05KK,
  PitRow,
  taxPeriodRange,
} from './reports.logic';
import { cellValue, getBankTemplates, toCsv, TransferRow } from './bank-templates';

const dec = (v: Decimal.Value | null | undefined) => new Decimal(v === null || v === undefined ? 0 : String(v));
const num = (d: Decimal) => Number(d.toFixed(0));
const MONEY = '#,##0';

/** Kỳ lương bị huỷ không đưa vào báo cáo. Kỳ chưa khoá vẫn lấy nhưng báo cảnh báo. */
async function periodsEndingIn(start: Date, end: Date) {
  return prisma.payPeriod.findMany({
    where: { dateEnd: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
    orderBy: { dateEnd: 'asc' },
  });
}

function unlockedWarning(periods: Array<{ code: string; status: string }>) {
  const open = periods.filter((p) => p.status !== 'LOCKED' && p.status !== 'PAID').map((p) => p.code);
  return open.length ? [`Kỳ lương chưa khoá: ${open.join(', ')} — số liệu có thể còn thay đổi`] : [];
}

function title(ws: ExcelJS.Worksheet, lines: string[], width: number) {
  lines.forEach((text, i) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, width);
    row.font = { bold: i === 0, size: i === 0 ? 13 : 11 };
    row.alignment = { horizontal: 'center' };
  });
  ws.addRow([]);
}

function header(ws: ExcelJS.Worksheet, cols: Array<[string, number]>) {
  const row = ws.addRow(cols.map((c) => c[0]));
  row.font = { bold: true };
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  row.height = 32;
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c[1];
    row.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF8' } };
  });
}

async function toBuffer(wb: ExcelJS.Workbook) {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function newBook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ATECH HRM';
  return wb;
}

const KIND_LABEL: Record<ChangeKind, string> = {
  INCREASE: 'I. TĂNG',
  ADJUST_UP: 'II. ĐIỀU CHỈNH TĂNG',
  DECREASE: 'III. GIẢM',
  ADJUST_DOWN: 'IV. ĐIỀU CHỈNH GIẢM',
};

export const reportsService = {
  // ===================== BHXH — D02-LT =====================

  /** Danh sách lao động tăng / giảm / điều chỉnh mức đóng của tháng (so với tháng trước). */
  async insuranceChanges(month: string) {
    const { start, end } = monthRange(month);
    const prevMonthEnd = new Date(start.getTime() - 86_400_000);
    const { start: prevStart } = monthRange(formatDate(prevMonthEnd).slice(0, 7));

    const load = async (s: Date, e: Date) => {
      const periods = (await periodsEndingIn(s, e)).filter((p) => p.periodType === 'REGULAR');
      const results = await prisma.payrollResult.findMany({
        where: { payPeriodId: { in: periods.map((p) => p.id) } },
        select: { employmentId: true, insuranceBase: true, empInsurance: true },
      });
      // Không đóng BH (đủ 14 ngày nghỉ…) → mức đóng 0 dù insuranceBase vẫn được ghi.
      return { periods, rows: results.map((r) => ({ employmentId: r.employmentId, base: dec(r.empInsurance).gt(0) ? dec(r.insuranceBase) : new Decimal(0) })) };
    };
    const curr = await load(start, end);
    if (curr.periods.length === 0) throw new ValidationError(`Chưa có kỳ lương tháng ${month} — chạy lương trước khi lập báo cáo`);
    const prev = await load(prevStart, prevMonthEnd);

    const ids = [...new Set([...curr.rows, ...prev.rows].map((r) => r.employmentId))];
    const emps = await prisma.employment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        codeEmp: true,
        dateHire: true,
        dateTerminate: true,
        person: { select: { fullName: true, socialInsNo: true, dateOfBirth: true, gender: true, idNo: true } },
        assignments: { select: { effectiveDate: true, endDate: true, position: { select: { job: { select: { name: true } } } }, orgStructure: { select: { name: true } } } },
      },
    });
    const meta = new Map<string, InsuranceEmpMeta>(emps.map((e) => [e.id, { dateHire: e.dateHire, dateTerminate: e.dateTerminate }]));
    const byId = new Map(emps.map((e) => [e.id, e]));
    const changes = insuranceChanges(prev.rows, curr.rows, meta, start, end).map((c) => {
      const e = byId.get(c.employmentId)!;
      const a = pickEffective(e.assignments, end) ?? e.assignments.sort((x, y) => y.effectiveDate.getTime() - x.effectiveDate.getTime())[0];
      return {
        ...c,
        oldBase: num(c.oldBase),
        newBase: num(c.newBase),
        codeEmp: e.codeEmp,
        fullName: e.person.fullName,
        socialInsNo: e.person.socialInsNo,
        dateOfBirth: e.person.dateOfBirth,
        gender: e.person.gender,
        idNo: e.person.idNo,
        jobTitle: a?.position.job?.name ?? null,
        department: a?.orgStructure.name ?? null,
      };
    });
    const missingInsNo = changes.filter((c) => !c.socialInsNo && c.kind !== 'INCREASE').length;
    return {
      month,
      changes,
      totals: {
        increase: changes.filter((c) => c.kind === 'INCREASE').length,
        decrease: changes.filter((c) => c.kind === 'DECREASE').length,
        adjust: changes.filter((c) => c.kind === 'ADJUST_UP' || c.kind === 'ADJUST_DOWN').length,
      },
      warnings: [
        ...unlockedWarning(curr.periods),
        ...(prev.periods.length === 0 ? ['Không có kỳ lương tháng trước — mọi người đóng BH tháng này đều tính là tăng mới'] : []),
        ...(missingInsNo ? [`${missingInsNo} người chưa có mã số BHXH trong hồ sơ`] : []),
      ],
    };
  },

  async insuranceChangesXlsx(month: string) {
    const data = await this.insuranceChanges(month);
    const company = await getCompany();
    const [y, m] = month.split('-');
    const wb = newBook();
    const ws = wb.addWorksheet('D02-LT');
    const cols: Array<[string, number]> = [
      ['STT', 6],
      ['Họ và tên', 26],
      ['Mã số BHXH', 14],
      ['Cấp bậc, chức vụ, chức danh nghề', 24],
      ['Vị trí làm việc (phòng ban)', 22],
      ['Tiền lương cũ', 15],
      ['Tiền lương mới', 15],
      ['Từ tháng, năm', 12],
      ['Đến tháng, năm', 12],
      ['Ghi chú', 34],
    ];
    title(
      ws,
      [
        'DANH SÁCH LAO ĐỘNG THAM GIA BHXH, BHYT, BHTN, BHTNLĐ-BNN (Mẫu D02-LT)',
        `Tên đơn vị: ${company.name}${company.taxCode ? ` — Mã số thuế: ${company.taxCode}` : ''}`,
        `Tháng ${m}/${y}`,
      ],
      cols.length,
    );
    header(ws, cols);
    let stt = 0;
    for (const kind of ['INCREASE', 'ADJUST_UP', 'DECREASE', 'ADJUST_DOWN'] as ChangeKind[]) {
      const group = data.changes.filter((c) => c.kind === kind);
      const g = ws.addRow([KIND_LABEL[kind], '', '', '', '', '', '', '', '', `${group.length} người`]);
      g.font = { bold: true };
      for (const c of group) {
        const decrease = kind === 'DECREASE';
        ws.addRow([
          ++stt,
          c.fullName,
          c.socialInsNo ?? '',
          c.jobTitle ?? '',
          c.department ?? '',
          c.oldBase || null,
          c.newBase || null,
          decrease ? '' : `${m}/${y}`,
          decrease ? `${m}/${y}` : '',
          c.reason,
        ]);
      }
    }
    ws.getColumn(6).numFmt = MONEY;
    ws.getColumn(7).numFmt = MONEY;
    if (data.warnings.length) {
      ws.addRow([]);
      for (const w of data.warnings) ws.addRow([`Lưu ý: ${w}`]).font = { italic: true, color: { argb: 'FFB45309' } };
    }
    return { buffer: await toBuffer(wb), filename: `D02-LT-${month}.xlsx` };
  },

  // ===================== Thuế TNCN — 05/KK =====================

  async pitDeclaration(period: string) {
    let range;
    try {
      range = taxPeriodRange(period);
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
    const periods = await periodsEndingIn(range.start, range.end);
    if (periods.length === 0) throw new ValidationError(`Chưa có kỳ lương trong ${range.label}`);
    const results = await prisma.payrollResult.findMany({
      where: { payPeriodId: { in: periods.map((p) => p.id) } },
      select: { taxableIncome: true, pitAmount: true, snapshotJson: true, employment: { select: { personId: true } } },
    });
    const rows: PitRow[] = results.map((r) => ({
      personId: r.employment.personId,
      // Biểu 20% áp cho cá nhân không cư trú.
      resident: (r.snapshotJson as { taxMethod?: string } | null)?.taxMethod !== 'FLAT_20',
      taxableIncome: dec(r.taxableIncome),
      pitAmount: dec(r.pitAmount),
    }));
    const c = pit05KK(rows);
    return {
      period,
      label: range.label,
      periods: periods.map((p) => p.code),
      indicators: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === 'number' ? v : num(v)])) as Record<string, number>,
      warnings: unlockedWarning(periods),
    };
  },

  async pitDeclarationXlsx(period: string) {
    const d = await this.pitDeclaration(period);
    const company = await getCompany();
    const wb = newBook();
    const ws = wb.addWorksheet('05-KK-TNCN');
    title(
      ws,
      [
        'TỜ KHAI KHẤU TRỪ THUẾ THU NHẬP CÁ NHÂN (Mẫu 05/KK-TNCN)',
        `Kỳ tính thuế: ${d.label} — Kỳ lương: ${d.periods.join(', ')}`,
        `Người nộp thuế: ${company.name}${company.taxCode ? ` — MST: ${company.taxCode}` : ''}`,
      ],
      4,
    );
    header(ws, [['STT', 6], ['Chỉ tiêu', 70], ['Mã chỉ tiêu', 12], ['Số người / Số tiền (VNĐ)', 24]]);
    const lines: Array<[string, string, string]> = [
      ['1', 'Tổng số người lao động', 'c21'],
      ['', 'Trong đó: Cá nhân cư trú có hợp đồng lao động', 'c22'],
      ['2', 'Tổng số cá nhân đã khấu trừ thuế', 'c23'],
      ['2.1', 'Cá nhân cư trú', 'c24'],
      ['2.2', 'Cá nhân không cư trú', 'c25'],
      ['3', 'Tổng thu nhập chịu thuế (TNCT) trả cho cá nhân', 'c26'],
      ['3.1', 'Cá nhân cư trú', 'c27'],
      ['3.2', 'Cá nhân không cư trú', 'c28'],
      ['', 'Trong đó: TNCT được miễn theo Hiệp định, hợp đồng dầu khí', 'c29'],
      ['4', 'Tổng TNCT trả cho cá nhân thuộc diện phải khấu trừ thuế', 'c30'],
      ['4.1', 'Cá nhân cư trú', 'c31'],
      ['4.2', 'Cá nhân không cư trú', 'c32'],
      ['5', 'Tổng số thuế TNCN đã khấu trừ', 'c33'],
      ['5.1', 'Cá nhân cư trú', 'c34'],
      ['5.2', 'Cá nhân không cư trú', 'c35'],
    ];
    for (const [stt, label, key] of lines) {
      const r = ws.addRow([stt, label, `[${key.slice(1)}]`, d.indicators[key]]);
      r.getCell(3).alignment = { horizontal: 'center' };
      if (Number(key.slice(1)) >= 26) r.getCell(4).numFmt = MONEY;
    }
    for (const w of d.warnings) ws.addRow([`Lưu ý: ${w}`]).font = { italic: true, color: { argb: 'FFB45309' } };
    return { buffer: await toBuffer(wb), filename: `05-KK-TNCN-${period}.xlsx` };
  },

  // ===================== Thuế TNCN — quyết toán năm 05/QTT =====================

  async pitAnnual(year: number) {
    const { start, end } = yearRange(year);
    const periods = await periodsEndingIn(start, end);
    if (periods.length === 0) throw new ValidationError(`Chưa có kỳ lương năm ${year}`);
    const legal = await loadLegalParams(end);
    const results = await prisma.payrollResult.findMany({
      where: { payPeriodId: { in: periods.map((p) => p.id) } },
      select: {
        employmentId: true,
        taxableIncome: true,
        empInsurance: true,
        dependantDeduction: true,
        dependantCount: true,
        pitAmount: true,
        snapshotJson: true,
        employment: {
          select: {
            codeEmp: true,
            dateHire: true,
            dateTerminate: true,
            person: { select: { fullName: true, personalTaxCode: true, idNo: true } },
          },
        },
      },
    });
    const byEmp = new Map<string, typeof results>();
    for (const r of results) byEmp.set(r.employmentId, [...(byEmp.get(r.employmentId) ?? []), r]);

    const residents = [];
    const others = [];
    for (const [employmentId, rows] of byEmp) {
      const e = rows[0].employment;
      const methods = new Set(rows.map((r) => (r.snapshotJson as { taxMethod?: string } | null)?.taxMethod ?? 'PROGRESSIVE'));
      const months = rows.map((r) => ({
        taxableIncome: dec(r.taxableIncome),
        empInsurance: dec(r.empInsurance),
        dependantDeduction: dec(r.dependantDeduction),
        pitAmount: dec(r.pitAmount),
      }));
      const base = {
        employmentId,
        codeEmp: e.codeEmp,
        fullName: e.person.fullName,
        taxCode: e.person.personalTaxCode,
        idNo: e.person.idNo,
        monthsPaid: rows.length,
        maxDependants: Math.max(...rows.map((r) => r.dependantCount)),
      };
      if (methods.size === 1 && methods.has('PROGRESSIVE')) {
        const s = annualSettlement(months, legal.personalDeduction, legal.pitBrackets);
        // Ủy quyền quyết toán: đang làm việc tại thời điểm quyết toán (31/12).
        const working = !e.dateTerminate || e.dateTerminate >= end;
        residents.push({
          ...base,
          canAuthorize: working,
          taxableIncome: num(s.taxableIncome),
          insurance: num(s.insurance),
          selfDeduction: num(s.selfDeduction),
          dependantDeduction: num(s.dependantDeduction),
          assessableIncome: num(s.assessableIncome),
          taxDue: num(s.taxDue),
          taxWithheld: num(s.taxWithheld),
          difference: num(s.difference),
        });
      } else {
        const t = (f: (m: (typeof months)[number]) => Decimal) => num(months.reduce((s, m) => s.plus(f(m)), new Decimal(0)));
        others.push({
          ...base,
          taxMethod: [...methods].join(', '),
          taxableIncome: t((m) => m.taxableIncome),
          taxWithheld: t((m) => m.pitAmount),
        });
      }
    }
    residents.sort((a, b) => a.codeEmp.localeCompare(b.codeEmp));
    others.sort((a, b) => a.codeEmp.localeCompare(b.codeEmp));
    const totalOf = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
    return {
      year,
      residents,
      others,
      totals: {
        taxableIncome: totalOf(residents, (r) => r.taxableIncome) + totalOf(others, (r) => r.taxableIncome),
        taxDue: totalOf(residents, (r) => r.taxDue),
        taxWithheld: totalOf(residents, (r) => r.taxWithheld) + totalOf(others, (r) => r.taxWithheld),
        payable: totalOf(residents.filter((r) => r.canAuthorize && r.difference > 0), (r) => r.difference),
        refundable: -totalOf(residents.filter((r) => r.canAuthorize && r.difference < 0), (r) => r.difference),
      },
      warnings: [
        ...unlockedWarning(periods),
        ...(periods[periods.length - 1].dateEnd < end || end > new Date()
          ? [`Năm ${year} mới có ${new Set(periods.map((p) => p.code)).size} kỳ lương — số liệu tạm tính, lập chính thức sau kỳ tháng 12`]
          : []),
        'Giảm trừ bản thân tính đủ 12 tháng cho người ủy quyền quyết toán; người không ủy quyền tự quyết toán với cơ quan thuế.',
      ],
    };
  },

  async pitAnnualXlsx(year: number) {
    const d = await this.pitAnnual(year);
    const company = await getCompany();
    const wb = newBook();

    const ws = wb.addWorksheet('05-1-BK-QTT');
    const cols: Array<[string, number]> = [
      ['STT', 6], ['Mã NV', 11], ['Họ và tên', 24], ['MST', 13], ['Số CCCD', 14], ['Ủy quyền QT', 10],
      ['Tổng TNCT', 15], ['Số NPT', 8], ['Giảm trừ bản thân', 14], ['Giảm trừ NPT', 14], ['Bảo hiểm được trừ', 14],
      ['Thu nhập tính thuế', 15], ['Thuế phải nộp', 14], ['Thuế đã khấu trừ', 14], ['Còn phải nộp (+) / Nộp thừa (−)', 16],
    ];
    title(
      ws,
      [
        `BẢNG KÊ CHI TIẾT CÁ NHÂN THUỘC DIỆN TÍNH THUẾ THEO BIỂU LŨY TIẾN (Phụ lục 05-1/BK-QTT-TNCN) — NĂM ${d.year}`,
        `${company.name}${company.taxCode ? ` — MST: ${company.taxCode}` : ''}`,
      ],
      cols.length,
    );
    header(ws, cols);
    d.residents.forEach((r, i) =>
      ws.addRow([
        i + 1, r.codeEmp, r.fullName, r.taxCode ?? '', r.idNo ?? '', r.canAuthorize ? 'x' : '',
        r.taxableIncome, r.maxDependants, r.selfDeduction, r.dependantDeduction, r.insurance,
        r.assessableIncome, r.taxDue, r.taxWithheld, r.difference,
      ]),
    );
    const tr = ws.addRow(['', '', 'TỔNG CỘNG', '', '', '', d.residents.reduce((s, r) => s + r.taxableIncome, 0), '', '', '', '', '', d.totals.taxDue, d.residents.reduce((s, r) => s + r.taxWithheld, 0), d.totals.payable - d.totals.refundable]);
    tr.font = { bold: true };
    [7, 9, 10, 11, 12, 13, 14, 15].forEach((c) => (ws.getColumn(c).numFmt = MONEY));

    const ws2 = wb.addWorksheet('05-2-BK-QTT');
    const cols2: Array<[string, number]> = [['STT', 6], ['Mã NV', 11], ['Họ và tên', 24], ['MST', 13], ['Số CCCD', 14], ['Cách tính thuế', 16], ['Tổng TNCT', 15], ['Thuế đã khấu trừ', 15]];
    title(ws2, [`BẢNG KÊ CÁ NHÂN KHẤU TRỪ THEO THUẾ SUẤT TOÀN PHẦN (Phụ lục 05-2/BK-QTT-TNCN) — NĂM ${d.year}`], cols2.length);
    header(ws2, cols2);
    d.others.forEach((r, i) => ws2.addRow([i + 1, r.codeEmp, r.fullName, r.taxCode ?? '', r.idNo ?? '', r.taxMethod, r.taxableIncome, r.taxWithheld]));
    [7, 8].forEach((c) => (ws2.getColumn(c).numFmt = MONEY));

    for (const w of d.warnings) ws.addRow([`Lưu ý: ${w}`]).font = { italic: true, color: { argb: 'FFB45309' } };
    return { buffer: await toBuffer(wb), filename: `QTT-TNCN-${year}.xlsx` };
  },

  // ===================== Chuyển lương ngân hàng =====================

  async bankTransfer(periodId: string, sourceBank?: string) {
    const period = await prisma.payPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundError('Không tìm thấy kỳ lương');
    const results = await prisma.payrollResult.findMany({
      where: { payPeriodId: periodId },
      select: {
        netPay: true,
        employment: { select: { codeEmp: true, person: { select: { fullName: true, bankAccountNo: true, bankName: true, bankBranch: true } } } },
      },
      orderBy: { employment: { codeEmp: 'asc' } },
    });
    const src = sourceBank?.trim().toUpperCase() || null;
    const rows = results
      .filter((r) => dec(r.netPay).gt(0))
      .map((r) => {
        const p = r.employment.person;
        return {
          codeEmp: r.employment.codeEmp,
          fullName: p.fullName,
          beneficiary: bankName(p.fullName),
          accountNo: p.bankAccountNo,
          bank: p.bankName?.toUpperCase() ?? null,
          branch: p.bankBranch,
          amount: num(dec(r.netPay)),
        };
      });
    const ready = rows.filter((r) => r.accountNo && r.bank);
    const missing = rows.filter((r) => !r.accountNo || !r.bank);
    const [y, m] = period.code.split('-');
    const content = bankName(`TRA LUONG T${m ?? ''} ${y ?? period.code}`);
    return {
      period: { id: period.id, code: period.code, status: period.status },
      sourceBank: src,
      content,
      sameBank: src ? ready.filter((r) => r.bank === src) : [],
      otherBank: src ? ready.filter((r) => r.bank !== src) : ready,
      missing,
      totals: { count: ready.length, amount: ready.reduce((s, r) => s + r.amount, 0), missing: missing.length },
      warnings: [
        ...(period.status === 'LOCKED' || period.status === 'PAID' ? [] : ['Kỳ lương chưa khoá — khoá kỳ trước khi chuyển tiền']),
        ...(missing.length ? [`${missing.length} người chưa có số tài khoản / ngân hàng — không có trong file chuyển`] : []),
      ],
    };
  },

  /**
   * File chuyển lương theo mẫu đã khai báo. Excel: mỗi nhóm một sheet.
   * CSV chỉ có một bảng → khi mẫu tách ngân hàng thì chọn part = same | other.
   */
  async bankTransferFile(periodId: string, sourceBank: string | undefined, templateId: string | undefined, part?: 'same' | 'other') {
    const d = await this.bankTransfer(periodId, sourceBank);
    const templates = await getBankTemplates();
    const t = templates.find((x) => x.id === templateId) ?? templates[0];
    const split = t.splitByBank && !!d.sourceBank;
    const groups: Array<{ key: 'same' | 'other' | 'all'; name: string; rows: TransferRow[] }> = split
      ? [
          { key: 'same', name: `Cung ${d.sourceBank}`, rows: d.sameBank },
          { key: 'other', name: 'Khac ngan hang', rows: d.otherBank },
        ]
      : [{ key: 'all', name: 'Chuyen luong', rows: [...d.sameBank, ...d.otherBank] }];
    const base = `chuyen-luong-${d.period.code}-${t.id}`;

    if (t.format === 'csv') {
      const g = split ? groups.find((x) => x.key === (part ?? 'same'))! : groups[0];
      const suffix = split ? (g.key === 'same' ? `-cung-${d.sourceBank}` : '-khac-ngan-hang') : '';
      return { buffer: Buffer.from(toCsv(t, g.rows, d.content), 'utf8'), filename: `${base}${suffix}.csv`, contentType: 'text/csv; charset=utf-8' };
    }

    const wb = newBook();
    for (const g of groups) {
      const ws = wb.addWorksheet(g.name);
      if (t.headerRow) header(ws, t.columns.map((c) => [c.header, c.field === 'beneficiary' || c.field === 'fullName' ? 30 : c.field === 'stt' ? 6 : 18]));
      g.rows.forEach((r, i) => {
        const row = ws.addRow(t.columns.map((c) => cellValue(c.field, r, i, d.content)));
        t.columns.forEach((c, k) => {
          if (c.field === 'accountNo') row.getCell(k + 1).numFmt = '@'; // giữ số 0 đầu
          if (c.field === 'amount') row.getCell(k + 1).numFmt = MONEY;
        });
      });
    }
    if (d.missing.length) {
      const ws = wb.addWorksheet('Thieu tai khoan');
      header(ws, [['Mã NV', 11], ['Họ tên', 28], ['Số tiền', 16], ['Thiếu', 24]]);
      d.missing.forEach((r) => ws.addRow([r.codeEmp, r.fullName, r.amount, !r.accountNo ? 'Số tài khoản' : 'Ngân hàng']));
      ws.getColumn(3).numFmt = MONEY;
    }
    return {
      buffer: await toBuffer(wb),
      filename: `${base}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  },
};
