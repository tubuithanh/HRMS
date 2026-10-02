import { checklistService } from '../checklist/checklist.service';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError, ValidationError } from '../../common/errors/AppError';
import { previousDay } from '../../common/utils/effectiveDating';
import { formatDate, todayDate } from '../../common/utils/dates';
import { calcProbationEndDate } from '../corehr/corehr.logic';
import {
  CellValue,
  cellText,
  parseAttendanceStatus,
  parseDate,
  parseDigits,
  parseGender,
  parseMoney,
  parseTime,
  Parsed,
} from './import.logic';

export type ImportType = 'employees' | 'salaries' | 'attendance';

interface Column {
  key: string;
  header: string;
  required?: boolean;
  note: string;
  example: string | number;
  width?: number;
}

const TEMPLATES: Record<ImportType, { title: string; columns: Column[] }> = {
  employees: {
    title: 'Nhân viên mới',
    columns: [
      { key: 'codeEmp', header: 'Mã NV', required: true, note: 'Duy nhất, dùng làm mã người và mã nhân viên', example: 'NV0500', width: 12 },
      { key: 'fullName', header: 'Họ và tên', required: true, note: '', example: 'Nguyễn Văn An', width: 24 },
      { key: 'gender', header: 'Giới tính', note: 'Nam / Nữ / Khác', example: 'Nam', width: 10 },
      { key: 'dateOfBirth', header: 'Ngày sinh', note: 'dd/mm/yyyy', example: '15/03/1995', width: 12 },
      { key: 'idNo', header: 'Số CCCD', note: '12 chữ số', example: '079095001234', width: 15 },
      { key: 'personalTaxCode', header: 'MST cá nhân', note: '10 hoặc 13 chữ số', example: '8123456789', width: 14 },
      { key: 'socialInsNo', header: 'Số BHXH', note: '10 chữ số', example: '7912345678', width: 13 },
      { key: 'phone', header: 'Điện thoại', note: '', example: '0901234567', width: 13 },
      { key: 'email', header: 'Email', note: '', example: 'an.nv@congty.vn', width: 24 },
      { key: 'dateHire', header: 'Ngày vào làm', required: true, note: 'dd/mm/yyyy', example: '01/10/2026', width: 13 },
      { key: 'orgCode', header: 'Mã phòng ban', required: true, note: 'Xem sheet "Mã phòng ban"', example: 'XLR', width: 14 },
      { key: 'jobCode', header: 'Mã chức danh', required: true, note: 'Xem sheet "Mã chức danh"', example: 'CN', width: 14 },
      { key: 'baseSalary', header: 'Lương cơ bản', required: true, note: 'Số tiền, VND', example: 7500000, width: 14 },
      { key: 'insuranceSalary', header: 'Lương đóng BH', note: 'Để trống = lương cơ bản', example: '', width: 14 },
      { key: 'probationDays', header: 'Số ngày thử việc', note: '0 hoặc trống nếu không thử việc', example: 30, width: 12 },
    ],
  },
  salaries: {
    title: 'Điều chỉnh lương',
    columns: [
      { key: 'codeEmp', header: 'Mã NV', required: true, note: 'Nhân viên đang làm việc', example: 'NV0001', width: 12 },
      { key: 'baseSalary', header: 'Lương cơ bản mới', required: true, note: 'Số tiền, VND', example: 18000000, width: 16 },
      { key: 'insuranceSalary', header: 'Lương đóng BH', note: 'Để trống = lương cơ bản', example: '', width: 14 },
      { key: 'effectiveDate', header: 'Hiệu lực từ', required: true, note: 'dd/mm/yyyy; mức cũ tự kết thúc ngày hôm trước', example: '01/01/2027', width: 13 },
    ],
  },
  attendance: {
    title: 'Chấm công',
    columns: [
      { key: 'codeEmp', header: 'Mã NV', required: true, note: '', example: 'NV0001', width: 12 },
      { key: 'workDate', header: 'Ngày', required: true, note: 'dd/mm/yyyy', example: '28/09/2026', width: 12 },
      { key: 'status', header: 'Trạng thái', required: true, note: 'X đi làm, M đi muộn, R từ xa, V vắng, P nghỉ phép, L nghỉ lễ', example: 'X', width: 11 },
      { key: 'checkIn', header: 'Giờ vào', note: 'HH:mm', example: '08:05', width: 10 },
      { key: 'checkOut', header: 'Giờ ra', note: 'HH:mm', example: '17:30', width: 10 },
      { key: 'note', header: 'Ghi chú', note: '', example: '', width: 24 },
    ],
  },
};

export function isImportType(t: string): t is ImportType {
  return t in TEMPLATES;
}

// ================= File mẫu =================

export async function buildTemplate(type: ImportType): Promise<Buffer> {
  const t = TEMPLATES[type];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dữ liệu');
  ws.columns = t.columns.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width ?? 14 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A78D6' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  // Cột mã, số giấy tờ, điện thoại để dạng chữ để Excel không bỏ số 0 ở đầu.
  for (const key of ['codeEmp', 'idNo', 'personalTaxCode', 'socialInsNo', 'phone', 'orgCode', 'jobCode']) {
    const col = t.columns.findIndex((c) => c.key === key);
    if (col >= 0) ws.getColumn(col + 1).numFmt = '@';
  }

  const guide = wb.addWorksheet('Hướng dẫn');
  guide.columns = [
    { header: 'Cột', width: 20 },
    { header: 'Bắt buộc', width: 10 },
    { header: 'Ghi chú', width: 60 },
    { header: 'Ví dụ', width: 22 },
  ];
  guide.getRow(1).font = { bold: true };
  for (const c of t.columns) guide.addRow([c.header, c.required ? 'Có' : '', c.note, c.example]);
  guide.addRow([]);
  guide.addRow(['Nhập dữ liệu vào sheet "Dữ liệu" từ dòng 2. Không đổi tên cột. Dòng trống sẽ được bỏ qua.']);

  if (type === 'employees') {
    const orgs = await prisma.orgStructure.findMany({ where: { isDelete: false }, orderBy: { path: 'asc' } });
    const ow = wb.addWorksheet('Mã phòng ban');
    ow.columns = [{ header: 'Mã', width: 12 }, { header: 'Tên đơn vị', width: 40 }];
    ow.getRow(1).font = { bold: true };
    for (const o of orgs) ow.addRow([o.code, o.name]);
    const jobs = await prisma.job.findMany({ where: { isDelete: false }, orderBy: { code: 'asc' } });
    const jw = wb.addWorksheet('Mã chức danh');
    jw.columns = [{ header: 'Mã', width: 12 }, { header: 'Chức danh', width: 32 }, { header: 'Thử việc tối đa (ngày)', width: 20 }];
    jw.getRow(1).font = { bold: true };
    for (const j of jobs) jw.addRow([j.code, j.name, j.maxProbationDays ?? '']);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ================= Đọc file =================

type RawRow = { row: number; cells: Record<string, CellValue> };

async function readRows(type: ImportType, base64: string): Promise<RawRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ExcelJS.Buffer);
  } catch {
    throw new ValidationError('Không đọc được file. Hãy dùng file .xlsx (Excel 2007 trở lên).');
  }
  const ws = wb.getWorksheet('Dữ liệu') ?? wb.worksheets[0];
  if (!ws) throw new ValidationError('File không có sheet dữ liệu');

  // Khớp cột theo tên tiêu đề (bỏ dấu * và khoảng trắng thừa), không phụ thuộc thứ tự.
  const norm = (s: string) => s.replace(/\*/g, '').trim().toLowerCase();
  const columns = TEMPLATES[type].columns;
  const indexOf: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, col) => {
    const c = columns.find((x) => norm(x.header) === norm(cellText(cell.value as CellValue)));
    if (c) indexOf[c.key] = col;
  });
  const missing = columns.filter((c) => c.required && !indexOf[c.key]).map((c) => c.header);
  if (missing.length) throw new ValidationError(`File thiếu cột bắt buộc: ${missing.join(', ')}. Hãy dùng file mẫu.`);

  const rows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const cells: Record<string, CellValue> = {};
    let empty = true;
    for (const c of columns) {
      const v = indexOf[c.key] ? (row.getCell(indexOf[c.key]).value as CellValue) : null;
      cells[c.key] = v;
      if (cellText(v) !== '') empty = false;
    }
    if (!empty) rows.push({ row: n, cells });
  });
  if (rows.length === 0) throw new ValidationError('File không có dòng dữ liệu nào');
  if (rows.length > 5000) throw new ValidationError('Tối đa 5.000 dòng mỗi lần nhập');
  return rows;
}

// ================= Kiểm tra từng loại =================

interface RowError {
  row: number;
  messages: string[];
}

interface Checked<T> {
  rows: Array<{ row: number; data: T }>;
  errors: RowError[];
}

/** Gom lỗi của một dòng: take() lấy giá trị hoặc ghi lỗi kèm tên cột. */
function rowCollector(type: ImportType) {
  const messages: string[] = [];
  const header = (key: string) => TEMPLATES[type].columns.find((c) => c.key === key)!.header;
  const take = <T>(key: string, p: Parsed<T>, required = false): T | undefined => {
    if (p.error !== undefined) {
      messages.push(`${header(key)}: ${p.error}`);
      return undefined;
    }
    if (required && (p.value === null || p.value === undefined || p.value === '')) {
      messages.push(`${header(key)}: bắt buộc`);
      return undefined;
    }
    return p.value;
  };
  const text = (v: CellValue): Parsed<string | null> => {
    const s = cellText(v);
    return { value: s === '' ? null : s };
  };
  return { messages, take, text };
}

interface EmployeeRow {
  codeEmp: string;
  fullName: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth: Date | null;
  idNo: string | null;
  personalTaxCode: string | null;
  socialInsNo: string | null;
  phone: string | null;
  email: string | null;
  dateHire: Date;
  orgId: string;
  jobId: string;
  jobCode: string;
  orgCode: string;
  baseSalary: number;
  insuranceSalary: number | null;
  probationDays: number;
}

async function checkEmployees(raw: RawRow[]): Promise<Checked<EmployeeRow>> {
  const [orgs, jobs, persons, employments] = await Promise.all([
    prisma.orgStructure.findMany({ where: { isDelete: false }, select: { id: true, code: true } }),
    prisma.job.findMany({ where: { isDelete: false }, select: { id: true, code: true, maxProbationDays: true } }),
    prisma.person.findMany({ where: { isDelete: false }, select: { personCode: true, idNo: true, personalTaxCode: true, socialInsNo: true } }),
    prisma.employment.findMany({ where: { isDelete: false }, select: { codeEmp: true } }),
  ]);
  const taken = {
    code: new Set([...persons.map((p) => p.personCode), ...employments.map((e) => e.codeEmp)]),
    idNo: new Set(persons.map((p) => p.idNo).filter(Boolean)),
    tax: new Set(persons.map((p) => p.personalTaxCode).filter(Boolean)),
    ins: new Set(persons.map((p) => p.socialInsNo).filter(Boolean)),
  };
  const inFile = { code: new Map<string, number>(), idNo: new Map<string, number>(), tax: new Map<string, number>(), ins: new Map<string, number>() };
  const out: Checked<EmployeeRow> = { rows: [], errors: [] };

  for (const r of raw) {
    const { messages, take, text } = rowCollector('employees');
    const c = r.cells;
    const codeEmp = take('codeEmp', text(c.codeEmp), true);
    const fullName = take('fullName', text(c.fullName), true);
    const gender = take('gender', parseGender(c.gender));
    const dateOfBirth = take('dateOfBirth', parseDate(c.dateOfBirth));
    const idNo = take('idNo', parseDigits(c.idNo, [12], 'CCCD'));
    const personalTaxCode = take('personalTaxCode', parseDigits(c.personalTaxCode, [10, 13], 'MST'));
    const socialInsNo = take('socialInsNo', parseDigits(c.socialInsNo, [10], 'Số BHXH'));
    const phone = take('phone', text(c.phone));
    const email = take('email', text(c.email));
    const dateHire = take('dateHire', parseDate(c.dateHire), true);
    const orgCode = take('orgCode', text(c.orgCode), true);
    const jobCode = take('jobCode', text(c.jobCode), true);
    const baseSalary = take('baseSalary', parseMoney(c.baseSalary), true);
    const insuranceSalary = take('insuranceSalary', parseMoney(c.insuranceSalary));
    const probation = take('probationDays', parseMoney(c.probationDays));

    const dup = (kind: keyof typeof inFile, value: string | null | undefined, label: string) => {
      if (!value) return;
      if (taken[kind].has(value)) messages.push(`${label} ${value} đã có trong hệ thống`);
      const prev = inFile[kind].get(value);
      if (prev) messages.push(`${label} ${value} trùng với dòng ${prev}`);
      else inFile[kind].set(value, r.row);
    };
    dup('code', codeEmp, 'Mã NV');
    dup('idNo', idNo, 'CCCD');
    dup('tax', personalTaxCode, 'MST');
    dup('ins', socialInsNo, 'Số BHXH');

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) messages.push(`Email "${email}" không hợp lệ`);
    const org = orgs.find((o) => o.code === orgCode);
    if (orgCode && !org) messages.push(`Mã phòng ban "${orgCode}" không tồn tại`);
    const job = jobs.find((j) => j.code === jobCode);
    if (jobCode && !job) messages.push(`Mã chức danh "${jobCode}" không tồn tại`);
    if (baseSalary !== undefined && baseSalary !== null && baseSalary <= 0) messages.push('Lương cơ bản phải lớn hơn 0');
    const probationDays = probation ?? 0;
    if (!Number.isInteger(probationDays) || probationDays < 0) messages.push('Số ngày thử việc phải là số nguyên không âm');
    else if (job?.maxProbationDays && probationDays > job.maxProbationDays) {
      messages.push(`Thử việc tối đa ${job.maxProbationDays} ngày với chức danh ${jobCode}`);
    }
    if (dateOfBirth && dateHire && dateHire.getUTCFullYear() - dateOfBirth.getUTCFullYear() < 15) {
      messages.push('Người lao động phải đủ 15 tuổi khi vào làm');
    }

    if (messages.length) out.errors.push({ row: r.row, messages });
    else
      out.rows.push({
        row: r.row,
        data: {
          codeEmp: codeEmp!,
          fullName: fullName!,
          gender: gender ?? null,
          dateOfBirth: dateOfBirth ?? null,
          idNo: idNo ?? null,
          personalTaxCode: personalTaxCode ?? null,
          socialInsNo: socialInsNo ?? null,
          phone: phone ?? null,
          email: email ?? null,
          dateHire: dateHire!,
          orgId: org!.id,
          jobId: job!.id,
          orgCode: orgCode!,
          jobCode: jobCode!,
          baseSalary: baseSalary!,
          insuranceSalary: insuranceSalary ?? null,
          probationDays,
        },
      });
  }
  return out;
}

interface SalaryRow {
  employmentId: string;
  codeEmp: string;
  baseSalary: number;
  insuranceSalary: number | null;
  effectiveDate: Date;
}

async function checkSalaries(raw: RawRow[]): Promise<Checked<SalaryRow>> {
  const employments = await prisma.employment.findMany({
    where: { isDelete: false, status: { not: 'TERMINATED' } },
    select: { id: true, codeEmp: true, salaries: { where: { isDelete: false, endDate: null }, select: { effectiveDate: true } } },
  });
  const seen = new Map<string, number>();
  const out: Checked<SalaryRow> = { rows: [], errors: [] };
  for (const r of raw) {
    const { messages, take, text } = rowCollector('salaries');
    const codeEmp = take('codeEmp', text(r.cells.codeEmp), true);
    const baseSalary = take('baseSalary', parseMoney(r.cells.baseSalary), true);
    const insuranceSalary = take('insuranceSalary', parseMoney(r.cells.insuranceSalary));
    const effectiveDate = take('effectiveDate', parseDate(r.cells.effectiveDate), true);
    const emp = employments.find((e) => e.codeEmp === codeEmp);
    if (codeEmp && !emp) messages.push(`Không có nhân viên đang làm việc với mã ${codeEmp}`);
    if (codeEmp) {
      const prev = seen.get(codeEmp);
      if (prev) messages.push(`Mã NV ${codeEmp} trùng với dòng ${prev}`);
      else seen.set(codeEmp, r.row);
    }
    const open = emp?.salaries[0];
    if (open && effectiveDate && effectiveDate <= open.effectiveDate) {
      messages.push(`Ngày hiệu lực phải sau ${formatDate(open.effectiveDate)} (mức lương hiện tại)`);
    }
    if (baseSalary !== undefined && baseSalary !== null && baseSalary <= 0) messages.push('Lương phải lớn hơn 0');
    if (messages.length) out.errors.push({ row: r.row, messages });
    else out.rows.push({ row: r.row, data: { employmentId: emp!.id, codeEmp: codeEmp!, baseSalary: baseSalary!, insuranceSalary: insuranceSalary ?? null, effectiveDate: effectiveDate! } });
  }
  return out;
}

interface AttendanceRow {
  employmentId: string;
  workDate: Date;
  status: string;
  checkIn: Date | null;
  checkOut: Date | null;
  note: string | null;
}

async function checkAttendance(raw: RawRow[]): Promise<Checked<AttendanceRow>> {
  const employments = await prisma.employment.findMany({
    where: { isDelete: false },
    select: { id: true, codeEmp: true, dateHire: true, dateTerminate: true },
  });
  const seen = new Map<string, number>();
  const today = todayDate();
  const out: Checked<AttendanceRow> = { rows: [], errors: [] };
  const at = (d: Date, hm: [number, number]) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hm[0], hm[1]);
  for (const r of raw) {
    const { messages, take, text } = rowCollector('attendance');
    const codeEmp = take('codeEmp', text(r.cells.codeEmp), true);
    const workDate = take('workDate', parseDate(r.cells.workDate), true);
    const status = take('status', parseAttendanceStatus(r.cells.status), true);
    const checkIn = take('checkIn', parseTime(r.cells.checkIn));
    const checkOut = take('checkOut', parseTime(r.cells.checkOut));
    const note = take('note', text(r.cells.note));
    const emp = employments.find((e) => e.codeEmp === codeEmp);
    if (codeEmp && !emp) messages.push(`Không có nhân viên mã ${codeEmp}`);
    if (emp && workDate && (workDate < emp.dateHire || (emp.dateTerminate && workDate > emp.dateTerminate))) {
      messages.push('Ngày nằm ngoài thời gian làm việc của nhân viên');
    }
    if (workDate && workDate > today) messages.push('Không nhập chấm công cho ngày trong tương lai');
    if (checkIn && checkOut && checkOut[0] * 60 + checkOut[1] <= checkIn[0] * 60 + checkIn[1]) messages.push('Giờ ra phải sau giờ vào');
    if (codeEmp && workDate) {
      const key = `${codeEmp}|${formatDate(workDate)}`;
      const prev = seen.get(key);
      if (prev) messages.push(`Trùng với dòng ${prev}`);
      else seen.set(key, r.row);
    }
    if (messages.length) out.errors.push({ row: r.row, messages });
    else
      out.rows.push({
        row: r.row,
        data: {
          employmentId: emp!.id,
          workDate: workDate!,
          status: status!,
          checkIn: checkIn ? at(workDate!, checkIn) : null,
          checkOut: checkOut ? at(workDate!, checkOut) : null,
          note: note ?? null,
        },
      });
  }
  return out;
}

// ================= Ghi dữ liệu =================

async function applyEmployees(rows: EmployeeRow[]) {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!company) throw new AppError('Chưa có công ty trong hệ thống', 400, 'NO_COMPANY');
  const today = todayDate();
  const created: Array<{ id: string; dateHire: Date }> = [];
  await prisma.$transaction(
    async (tx) => {
      for (const r of rows) {
        const person = await tx.person.create({
          data: {
            personCode: r.codeEmp,
            fullName: r.fullName,
            gender: r.gender,
            dateOfBirth: r.dateOfBirth,
            idNo: r.idNo,
            personalTaxCode: r.personalTaxCode,
            socialInsNo: r.socialInsNo,
            phone: r.phone,
            email: r.email,
            nationality: 'Việt Nam',
          },
        });
        const probationEnd = calcProbationEndDate(r.dateHire, r.probationDays) ?? null;
        const emp = await tx.employment.create({
          data: {
            personId: person.id,
            companyId: company.id,
            codeEmp: r.codeEmp,
            dateHire: r.dateHire,
            dateSeniority: r.dateHire,
            probationEndDate: probationEnd,
            status: r.dateHire > today ? 'UPCOMING' : probationEnd && probationEnd >= today ? 'PROBATION' : 'ACTIVE',
          },
        });
        const position = await tx.position.create({
          data: { code: `${r.orgCode}-${r.jobCode}-${r.codeEmp}`, jobId: r.jobId, orgStructureId: r.orgId, status: 'FILLED', effectiveDate: r.dateHire },
        });
        await tx.assignment.create({
          data: { employmentId: emp.id, positionId: position.id, orgStructureId: r.orgId, actionType: 'HIRE', effectiveDate: r.dateHire },
        });
        await tx.employeeSalary.create({
          data: {
            employmentId: emp.id,
            baseAmount: String(r.baseSalary),
            insuranceSalary: r.insuranceSalary === null ? null : String(r.insuranceSalary),
            effectiveDate: r.dateHire,
            sourceType: 'IMPORT',
          },
        });
        await tx.employeeTaxProfile.create({ data: { employmentId: emp.id, taxMethod: 'PROGRESSIVE', effectiveDate: r.dateHire } });
        created.push({ id: emp.id, dateHire: r.dateHire });
      }
    },
    { timeout: 120_000 },
  );
  // Danh sách việc tiếp nhận cho từng người mới — không chặn nếu lỗi.
  for (const c of created) {
    await checklistService.start(c.id, 'ONBOARDING', c.dateHire).catch((e) => console.error('Không tạo được danh sách tiếp nhận:', e instanceof Error ? e.message : e));
  }
}

async function applySalaries(rows: SalaryRow[]) {
  await prisma.$transaction(
    async (tx) => {
      for (const r of rows) {
        const open = await tx.employeeSalary.findFirst({ where: { employmentId: r.employmentId, endDate: null, isDelete: false } });
        if (open) await tx.employeeSalary.update({ where: { id: open.id }, data: { endDate: previousDay(r.effectiveDate) } });
        await tx.employeeSalary.create({
          data: {
            employmentId: r.employmentId,
            baseAmount: String(r.baseSalary),
            insuranceSalary: r.insuranceSalary === null ? null : String(r.insuranceSalary),
            effectiveDate: r.effectiveDate,
            sourceType: 'IMPORT',
          },
        });
      }
    },
    { timeout: 120_000 },
  );
}

async function applyAttendance(rows: AttendanceRow[]) {
  await prisma.$transaction(
    async (tx) => {
      for (const r of rows) {
        const data = { status: r.status as Prisma.AttendanceRecordCreateInput['status'], checkIn: r.checkIn, checkOut: r.checkOut, note: r.note, source: 'IMPORT' };
        await tx.attendanceRecord.upsert({
          where: { employmentId_workDate: { employmentId: r.employmentId, workDate: r.workDate } },
          update: data,
          create: { employmentId: r.employmentId, workDate: r.workDate, ...data },
        });
      }
    },
    { timeout: 120_000 },
  );
}

// ================= Điểm vào =================

/**
 * Kiểm tra file; nếu commit = true và không có lỗi thì ghi toàn bộ trong
 * một giao dịch (có lỗi thì không ghi dòng nào).
 */
export async function runImport(type: ImportType, base64: string, commit: boolean) {
  const raw = await readRows(type, base64);
  const checked =
    type === 'employees' ? await checkEmployees(raw) : type === 'salaries' ? await checkSalaries(raw) : await checkAttendance(raw);
  const result = {
    type,
    title: TEMPLATES[type].title,
    total: raw.length,
    valid: checked.rows.length,
    errors: checked.errors,
    imported: 0,
  };
  if (!commit || checked.errors.length > 0) return result;

  if (type === 'employees') await applyEmployees(checked.rows.map((r) => r.data as EmployeeRow));
  else if (type === 'salaries') await applySalaries(checked.rows.map((r) => r.data as SalaryRow));
  else await applyAttendance(checked.rows.map((r) => r.data as AttendanceRow));
  return { ...result, imported: checked.rows.length };
}

// ================= Xuất danh sách nhân sự =================

export async function exportEmployees(): Promise<Buffer> {
  const today = todayDate();
  const emps = await prisma.employment.findMany({
    where: { isDelete: false },
    orderBy: { codeEmp: 'asc' },
    include: {
      person: true,
      assignments: {
        where: { isDelete: false, isPrimary: true },
        orderBy: { effectiveDate: 'desc' },
        take: 1,
        include: { orgStructure: true, position: { include: { job: true } } },
      },
      salaries: { where: { isDelete: false, effectiveDate: { lte: today } }, orderBy: { effectiveDate: 'desc' }, take: 1 },
    },
  });
  const statusLabel: Record<string, string> = { UPCOMING: 'Sắp vào làm', PROBATION: 'Thử việc', ACTIVE: 'Đang làm việc', SUSPENDED: 'Tạm hoãn', TERMINATED: 'Đã nghỉ việc' };
  const genderLabel: Record<string, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
  const d = (v: Date | null) => (v ? formatDate(v).split('-').reverse().join('/') : '');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Nhân sự');
  ws.columns = [
    { header: 'Mã NV', width: 10 },
    { header: 'Họ và tên', width: 26 },
    { header: 'Giới tính', width: 9 },
    { header: 'Ngày sinh', width: 12 },
    { header: 'Số CCCD', width: 15 },
    { header: 'MST cá nhân', width: 14 },
    { header: 'Số BHXH', width: 13 },
    { header: 'Điện thoại', width: 13 },
    { header: 'Email', width: 28 },
    { header: 'Ngày vào làm', width: 13 },
    { header: 'Ngày nghỉ việc', width: 13 },
    { header: 'Trạng thái', width: 14 },
    { header: 'Phòng ban', width: 30 },
    { header: 'Chức danh', width: 24 },
    { header: 'Lương cơ bản', width: 14, style: { numFmt: '#,##0' } },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A78D6' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const e of emps) {
    const a = e.assignments[0];
    ws.addRow([
      e.codeEmp,
      e.person.fullName,
      e.person.gender ? genderLabel[e.person.gender] : '',
      d(e.person.dateOfBirth),
      e.person.idNo ?? '',
      e.person.personalTaxCode ?? '',
      e.person.socialInsNo ?? '',
      e.person.phone ?? '',
      e.person.email ?? '',
      d(e.dateHire),
      d(e.dateTerminate),
      statusLabel[e.status] ?? e.status,
      a?.orgStructure.name ?? '',
      a?.position.job.name ?? '',
      e.salaries[0] ? Number(e.salaries[0].baseAmount) : null,
    ]);
  }
  ws.autoFilter = { from: 'A1', to: 'O1' };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
