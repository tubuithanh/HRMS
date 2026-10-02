import { prisma } from '../../config/prisma';
import { formatDate, isWeekend, monthRange } from '../../common/utils/dates';
import { shiftService } from '../shift/shift.service';
import { shiftWindow } from '../shift/shift.logic';
import { holidaySet } from './overtime.service';
import { getSettings } from '../settings/settings.service';

/**
 * Đề xuất làm thêm giờ từ dữ liệu chấm công (không tự tính tiền — phải có đơn được duyệt):
 * - Ngày làm việc: ở lại sau giờ kết thúc ca từ N phút (Cấu hình, mặc định 60) → số giờ = phần sau giờ ca, làm tròn xuống 0,5 giờ.
 * - Thứ 7, chủ nhật (không có lịch ca), ngày lễ: cả thời gian có mặt trừ 1 giờ nghỉ trưa (nếu ≥ 6 giờ).
 * Bỏ qua ngày đã có đơn làm thêm đang chờ / đã duyệt.
 */
export async function overtimeSuggestions(month: string, employmentId?: string, minMinutesArg?: number) {
  const minMinutes = minMinutesArg ?? (await getSettings()).attendance.overtimeSuggestMinutes;
  const { start, end } = monthRange(month);
  const records = await prisma.attendanceRecord.findMany({
    where: {
      workDate: { gte: start, lte: end },
      checkIn: { not: null },
      checkOut: { not: null },
      ...(employmentId ? { employmentId } : {}),
      employment: { isDelete: false, status: { not: 'TERMINATED' } },
    },
    include: { employment: { select: { id: true, codeEmp: true, person: { select: { fullName: true } } } } },
  });
  if (records.length === 0) return [];
  const empIds = [...new Set(records.map((r) => r.employmentId))];
  const [existing, holidays, shiftOf, rosters] = await Promise.all([
    prisma.overtimeRequest.findMany({ where: { employmentId: { in: empIds }, workDate: { gte: start, lte: end }, status: { in: ['PENDING', 'APPROVED'] } }, select: { employmentId: true, workDate: true } }),
    holidaySet(start, end),
    shiftService.resolver(empIds, start, end),
    prisma.shiftRoster.findMany({ where: { employmentId: { in: empIds }, workDate: { gte: start, lte: end } }, select: { employmentId: true, workDate: true, shiftId: true } }),
  ]);
  const has = new Set(existing.map((o) => `${o.employmentId}|${formatDate(o.workDate)}`));
  const rostered = new Map(rosters.map((r) => [`${r.employmentId}|${formatDate(r.workDate)}`, r.shiftId]));

  const out = [];
  for (const r of records) {
    const key = `${r.employmentId}|${formatDate(r.workDate)}`;
    if (has.has(key)) continue;
    const holiday = holidays.has(formatDate(r.workDate));
    // Ngày nghỉ: cuối tuần không có lịch ca, hoặc lịch xếp "nghỉ", hoặc ngày lễ.
    const offDay = holiday || rostered.get(key) === null || (isWeekend(r.workDate) && !rostered.get(key));
    let minutes: number;
    let reason: string;
    if (offDay) {
      const span = Math.floor((r.checkOut!.getTime() - r.checkIn!.getTime()) / 60_000);
      minutes = span >= 360 ? span - 60 : span;
      reason = holiday ? 'Đi làm ngày lễ' : 'Đi làm ngày nghỉ';
    } else {
      const w = shiftWindow(r.workDate, shiftOf(r.employmentId, r.workDate));
      minutes = Math.floor((r.checkOut!.getTime() - w.end.getTime()) / 60_000);
      reason = `Ở lại sau giờ ca ${w.end.toTimeString().slice(0, 5)}`;
    }
    if (minutes < minMinutes) continue;
    const hours = Math.floor(minutes / 30) / 2;
    out.push({
      employmentId: r.employmentId,
      codeEmp: r.employment.codeEmp,
      fullName: r.employment.person.fullName,
      workDate: formatDate(r.workDate),
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      minutes,
      hours,
      offDay,
      reason,
    });
  }
  return out.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.codeEmp.localeCompare(b.codeEmp));
}
