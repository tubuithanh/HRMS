import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { ValidationError } from '../../common/errors/AppError';
import { shiftService } from '../shift/shift.service';
import { computeAttendanceTimes } from '../shift/shift.logic';
import { detectColumns, groupPunches, parseTimestamp, Punch, workDateOf, ymd } from './punch.logic';

/**
 * Nhập dữ liệu máy chấm công (Excel / CSV): kiểm tra → xem trước → ghi.
 * Chỉ ghi khi không còn dòng lỗi (tất cả hoặc không). Không ghi đè bản ghi nhân sự đã nhập / sửa tay.
 */

type Cell = unknown;

function parseCsv(text: string): Cell[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const delim = [',', ';', '\t'].map((d) => [d, lines[0].split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map((line) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  });
}

async function readRows(base64: string): Promise<Cell[][]> {
  const buf = Buffer.from(base64, 'base64');
  if (buf.subarray(0, 2).toString() === 'PK') {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    } catch {
      throw new ValidationError('Không đọc được file Excel');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new ValidationError('File Excel không có sheet nào');
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as Cell[]).slice(1).map((v) => (v && typeof v === 'object' && 'text' in (v as object) ? (v as { text: string }).text : v));
      rows.push(vals);
    });
    return rows;
  }
  return parseCsv(buf.toString('utf8'));
}

const MAX_ERRORS = 50;

export async function importPunches(base64: string, commit: boolean) {
  const rows = await readRows(base64);
  // Dòng tiêu đề trong 10 dòng đầu
  let headerIdx = -1;
  let cols: ReturnType<typeof detectColumns> = null;
  for (let i = 0; i < Math.min(10, rows.length) && !cols; i++) {
    cols = detectColumns(rows[i].map((c) => String(c ?? '')));
    if (cols) headerIdx = i;
  }
  if (!cols) {
    throw new ValidationError('Không tìm thấy cột "Mã chấm công" và "Thời gian" (hoặc "Ngày" + "Giờ") trong 10 dòng đầu của file');
  }

  const errors: Array<{ row: number; message: string }> = [];
  const raw: Array<{ row: number; code: string; at: Date }> = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const code = String(r[cols.code] ?? '').trim().replace(/\.0+$/, '');
    if (!code && (r[cols.datetime] === undefined || r[cols.datetime] === '')) continue; // dòng trống
    const at = parseTimestamp(r[cols.datetime], cols.time >= 0 ? r[cols.time] : undefined);
    if (!code) errors.push({ row: i + 1, message: 'Thiếu mã chấm công' });
    else if (!at) errors.push({ row: i + 1, message: `Thời gian không đọc được: "${String(r[cols.datetime] ?? '')}${cols.time >= 0 ? ` ${String(r[cols.time] ?? '')}` : ''}"` });
    else raw.push({ row: i + 1, code, at });
  }
  if (raw.length === 0 && errors.length === 0) throw new ValidationError('File không có dòng dữ liệu nào');

  // Mã chấm công → nhân viên (ưu tiên mã chấm công, sau đó mã nhân viên)
  // Máy thường xuất mã dạng số (1, 25) trong khi hồ sơ lưu 0001, 0025 → so khớp bỏ số 0 đầu.
  const canon = (c: string) => (/^\d+$/.test(c) ? c.replace(/^0+(?=\d)/, '') : c.toUpperCase());
  const codes = [...new Set(raw.map((r) => r.code))];
  const wanted = new Set(codes.map(canon));
  const emps = (
    await prisma.employment.findMany({
      where: { isDelete: false, OR: [{ codeAttendance: { not: null } }, { codeEmp: { in: codes } }] },
      select: { id: true, codeEmp: true, codeAttendance: true, dateHire: true, dateTerminate: true, person: { select: { fullName: true } } },
      orderBy: { dateHire: 'desc' },
    })
  ).filter((e) => (e.codeAttendance && wanted.has(canon(e.codeAttendance))) || wanted.has(canon(e.codeEmp)));
  const byCanon = new Map<string, (typeof emps)[number]>();
  for (const e of emps) if (e.codeAttendance && !byCanon.has(canon(e.codeAttendance))) byCanon.set(canon(e.codeAttendance), e);
  for (const e of emps) if (!byCanon.has(canon(e.codeEmp))) byCanon.set(canon(e.codeEmp), e);
  const byCode = new Map(codes.filter((c) => byCanon.has(canon(c))).map((c) => [c, byCanon.get(canon(c))!]));
  const unknown = codes.filter((c) => !byCode.has(c));
  for (const c of unknown) {
    const first = raw.find((r) => r.code === c)!;
    errors.push({ row: first.row, message: `Mã chấm công "${c}" không khớp nhân viên nào (${raw.filter((r) => r.code === c).length} lần quẹt)` });
  }

  const punches: Punch[] = raw.filter((r) => byCode.has(r.code)).map((r) => ({ key: byCode.get(r.code)!.id, at: r.at }));
  const days = punches.length ? punches.map((p) => workDateOf(p.at)) : [];
  const from = days.length ? new Date(Math.min(...days.map((d) => d.getTime())) - 86_400_000) : new Date();
  const to = days.length ? new Date(Math.max(...days.map((d) => d.getTime()))) : new Date();
  const empIds = [...new Set(punches.map((p) => p.key))];
  const shiftOf = await shiftService.resolver(empIds, from, to);
  const grouped = groupPunches(punches, shiftOf);

  const existing = await prisma.attendanceRecord.findMany({
    where: { employmentId: { in: empIds }, workDate: { gte: from, lte: to } },
    select: { employmentId: true, workDate: true, source: true, status: true },
  });
  const existMap = new Map(existing.map((e) => [`${e.employmentId}|${ymd(e.workDate)}`, e]));
  const empById = new Map(emps.map((e) => [e.id, e]));

  const items = grouped.map((g) => {
    const e = empById.get(g.key)!;
    const shift = shiftOf(g.key, g.workDate);
    const t = computeAttendanceTimes(g.checkIn, g.checkOut, g.workDate, shift);
    const ex = existMap.get(`${g.key}|${ymd(g.workDate)}`);
    const outOfEmployment = g.workDate < e.dateHire || (e.dateTerminate && g.workDate > e.dateTerminate);
    const skip = outOfEmployment ? 'Ngoài thời gian làm việc' : ex?.source === 'MANUAL' ? 'Đã có bản ghi nhân sự nhập tay — giữ nguyên' : null;
    return {
      employmentId: g.key,
      codeEmp: e.codeEmp,
      fullName: e.person.fullName,
      workDate: ymd(g.workDate),
      workDateObj: g.workDate,
      shiftId: shift.id,
      shift: `${shift.startTime}–${shift.endTime}`,
      checkIn: g.checkIn,
      checkOut: g.checkOut,
      punches: g.punches,
      ...t,
      status: t.lateMinutes > 0 ? 'LATE' : 'PRESENT',
      warning: !g.checkOut ? 'Chỉ có 1 lần quẹt — thiếu giờ ra' : null,
      action: skip ? 'SKIP' : ex ? 'UPDATE' : 'CREATE',
      skipReason: skip,
    };
  });

  const summary = {
    rows: raw.length + errors.filter((e) => !e.message.startsWith('Mã chấm công')).length,
    punches: punches.length,
    employees: empIds.length,
    days: items.length,
    create: items.filter((i) => i.action === 'CREATE').length,
    update: items.filter((i) => i.action === 'UPDATE').length,
    skip: items.filter((i) => i.action === 'SKIP').length,
    missingOut: items.filter((i) => !i.checkOut).length,
    late: items.filter((i) => i.lateMinutes > 0).length,
    errorCount: errors.length,
  };

  let written = 0;
  if (commit) {
    if (errors.length) throw new ValidationError(`File còn ${errors.length} lỗi — sửa rồi nhập lại (không có dòng nào được ghi)`);
    const toWrite = items.filter((i) => i.action !== 'SKIP');
    for (let k = 0; k < toWrite.length; k += 200) {
      const chunk = toWrite.slice(k, k + 200);
      await prisma.$transaction(
        chunk.map((i) => {
          const data = {
            checkIn: i.checkIn,
            checkOut: i.checkOut,
            status: i.status as 'LATE' | 'PRESENT',
            shiftId: i.shiftId,
            lateMinutes: i.lateMinutes,
            earlyMinutes: i.earlyMinutes,
            workedMinutes: i.workedMinutes,
            nightMinutes: i.nightMinutes,
            source: 'MACHINE',
          };
          return prisma.attendanceRecord.upsert({
            where: { employmentId_workDate: { employmentId: i.employmentId, workDate: i.workDateObj } },
            update: data,
            create: { employmentId: i.employmentId, workDate: i.workDateObj, ...data },
          });
        }),
      );
      written += chunk.length;
    }
  }

  return {
    committed: commit,
    written,
    summary,
    errors: errors.slice(0, MAX_ERRORS),
    items: items.slice(0, 1000).map(({ workDateObj: _w, ...rest }) => rest),
  };
}

/** File mẫu CSV để thử. */
export function punchTemplateCsv(): string {
  return '﻿Mã chấm công,Họ tên,Thời gian\r\n1001,Nguyễn Văn A,05/10/2026 07:55\r\n1001,Nguyễn Văn A,05/10/2026 17:06\r\n1002,Trần Thị B,05/10/2026 21:52\r\n1002,Trần Thị B,06/10/2026 06:03\r\n';
}
