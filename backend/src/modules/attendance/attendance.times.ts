import { AppError } from '../../common/errors/AppError';
import { getSettings } from '../settings/settings.service';
import { shiftService } from '../shift/shift.service';
import { computeAttendanceTimes, distanceMeters, ipAllowed, ShiftTimes } from '../shift/shift.logic';

/**
 * Giờ công theo ca: ca của ngày (xếp ca / ca mặc định), không có ca thì dùng giờ hành chính
 * trong Cấu hình (nghỉ trưa 60 phút). Dùng chung cho tự chấm công, nhân sự nhập tay và nhập máy chấm công.
 */
export async function shiftFor(employmentId: string, workDate: Date): Promise<{ shiftId: string | null; times: ShiftTimes; offDay: boolean }> {
  const s = await shiftService.resolve(employmentId, workDate);
  if (s) return { shiftId: s.id, times: s, offDay: false };
  const { attendance } = await getSettings();
  return {
    shiftId: null,
    // null = lịch xếp ngày nghỉ; vẫn tính theo giờ hành chính nếu có đi làm.
    offDay: s === null,
    times: { startTime: attendance.workStart, endTime: attendance.workEnd, breakMinutes: 60, lateGraceMinutes: attendance.lateGraceMinutes },
  };
}

export async function timesFor(employmentId: string, workDate: Date, checkIn: Date | null, checkOut: Date | null) {
  const { shiftId, times } = await shiftFor(employmentId, workDate);
  return { shiftId, ...computeAttendanceTimes(checkIn, checkOut, workDate, times) };
}

export interface CheckinLocation {
  lat?: number | null;
  lng?: number | null;
  ip?: string | null;
}

/**
 * Kiểm tra vị trí khi tự chấm công theo Cấu hình → Giới hạn vị trí.
 * GPS: trong bán kính văn phòng. IP: thuộc danh sách IP / dải mạng văn phòng. GPS_OR_IP: một trong hai.
 */
export async function verifyLocation(loc: CheckinLocation) {
  const { checkin } = await getSettings();
  if (checkin.mode === 'OFF') return;
  const ips = checkin.allowedIps.split(/[\s,;]+/).filter(Boolean);
  const ipOk = checkin.mode.includes('IP') && !!loc.ip && ipAllowed(loc.ip, ips);
  let gpsOk = false;
  let distance: number | null = null;
  if (checkin.mode.includes('GPS') && loc.lat != null && loc.lng != null && checkin.lat != null && checkin.lng != null) {
    distance = Math.round(distanceMeters(loc.lat, loc.lng, checkin.lat, checkin.lng));
    gpsOk = distance <= checkin.radiusMeters;
  }
  if (gpsOk || ipOk) return;
  const parts: string[] = [];
  if (checkin.mode.includes('GPS')) {
    parts.push(loc.lat == null ? 'chưa lấy được vị trí GPS (hãy cho phép truy cập vị trí)' : `bạn cách văn phòng ${distance} m (cho phép ${checkin.radiusMeters} m)`);
  }
  if (checkin.mode.includes('IP')) parts.push('không ở trong mạng của công ty');
  throw new AppError(`Không chấm công được: ${parts.join(' và ')}`, 403, 'LOCATION_NOT_ALLOWED');
}
