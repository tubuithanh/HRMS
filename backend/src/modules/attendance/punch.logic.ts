import { ShiftTimes, shiftWindow } from '../shift/shift.logic';

/**
 * Dữ liệu máy chấm công: mỗi dòng là một lần quẹt (mã chấm công + thời điểm).
 * Phần thuần (test được): đọc thời gian, tìm cột, ghép lần quẹt thành giờ vào / ra theo ngày công.
 */

const pad = (n: number) => String(n).padStart(2, '0');
/** Ngày công dạng 00:00 UTC (quy ước của hệ thống) từ một thời điểm giờ địa phương. */
export const workDateOf = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
export const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Đọc thời điểm (giờ địa phương). Nhận:
 * - Date từ Excel (exceljs lưu giờ đồng hồ dưới dạng UTC) → đổi về giờ địa phương cùng số;
 * - "2026-10-05 07:58[:12]", "05/10/2026 07:58[:12]", "5/10/2026 7:58:00 AM" (ngày/tháng/năm kiểu Việt Nam);
 * - ngày và giờ ở hai ô riêng (truyền `time`).
 */
export function parseTimestamp(value: unknown, time?: unknown): Date | null {
  const fromExcel = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  let datePart: Date | null = null;
  let text = '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    datePart = fromExcel(value);
  } else if (typeof value === 'number' && value > 20000 && value < 80000) {
    // Số sê-ri ngày của Excel (1900-based)
    const ms = Math.round((value - 25569) * 86_400_000);
    datePart = fromExcel(new Date(ms));
  } else if (value !== null && value !== undefined) {
    text = String(value).trim();
  }
  if (!datePart && text) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text) ?? null;
    const v = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|SA|CH)?)?/i.exec(text) ?? null;
    if (m) datePart = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    else if (v) {
      let h = +(v[4] ?? 0);
      const ap = v[7]?.toUpperCase();
      if ((ap === 'PM' || ap === 'CH') && h < 12) h += 12;
      if ((ap === 'AM' || ap === 'SA') && h === 12) h = 0;
      datePart = new Date(+v[3], +v[2] - 1, +v[1], h, +(v[5] ?? 0), +(v[6] ?? 0));
    } else return null;
    if (Number.isNaN(datePart.getTime())) return null;
  }
  if (!datePart) return null;
  if (time === undefined || time === null || time === '') return datePart;
  // Ghép giờ từ ô riêng
  let h = 0;
  let mi = 0;
  let se = 0;
  if (time instanceof Date) {
    h = time.getUTCHours();
    mi = time.getUTCMinutes();
    se = time.getUTCSeconds();
  } else if (typeof time === 'number' && time >= 0 && time < 1) {
    const secs = Math.round(time * 86400);
    h = Math.floor(secs / 3600);
    mi = Math.floor((secs % 3600) / 60);
    se = secs % 60;
  } else {
    const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|SA|CH)?$/i.exec(String(time).trim());
    if (!t) return null;
    h = +t[1];
    mi = +t[2];
    se = +(t[3] ?? 0);
    const ap = t[4]?.toUpperCase();
    if ((ap === 'PM' || ap === 'CH') && h < 12) h += 12;
    if ((ap === 'AM' || ap === 'SA') && h === 12) h = 0;
  }
  if (h > 23 || mi > 59 || se > 59) return null;
  return new Date(datePart.getFullYear(), datePart.getMonth(), datePart.getDate(), h, mi, se);
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Tìm cột theo tiêu đề (tiếng Việt / tiếng Anh, có / không dấu). */
export function detectColumns(header: string[]): { code: number; datetime: number; time: number } | null {
  const h = header.map((x) => norm(String(x ?? '')));
  const find = (pred: (s: string) => boolean) => h.findIndex(pred);
  const code = find((s) => /^(ma cham cong|ma cc|ma nv|ma nhan vien|ac no|enroll(ment)? ?(no|number)?|user ?id|id|no|ma|code|badge|emp(loyee)? ?(no|code|id)?|pin)$/.test(s));
  const datetime = find((s) => /^(thoi gian|ngay gio|date ?time|time ?stamp|check ?time|punch ?time|log ?time|ngay|date|thoi diem)$/.test(s));
  const time = find((s) => /^(gio|time|gio cham)$/.test(s));
  if (code < 0 || datetime < 0) return null;
  // "Ngày" + "Giờ" tách cột; nếu cột thời gian là "time" và không có cột ngày riêng thì dùng một cột.
  return { code, datetime, time: time >= 0 && time !== datetime ? time : -1 };
}

export interface Punch {
  key: string; // employmentId
  at: Date; // giờ địa phương
}

export type ShiftLookup = (key: string, workDate: Date) => ShiftTimes;

export interface DayPunches {
  key: string;
  workDate: Date;
  checkIn: Date;
  checkOut: Date | null;
  punches: number;
}

/**
 * Ghép lần quẹt thành từng ngày công:
 * - Mỗi lần quẹt gán cho ngày công (hôm đó hoặc hôm trước) có khung ca GẦN NHẤT với nó
 *   (0 nếu nằm trong ca). Vd ca đêm hôm trước kết thúc 06:00 → quẹt 06:04 thuộc hôm trước;
 *   quẹt 08:25 gần ca ngày 08:30 hôm nay hơn → thuộc hôm nay. Bằng nhau thì ưu tiên hôm nay.
 * - Giờ vào = lần quẹt sớm nhất, giờ ra = lần muộn nhất (bỏ lần quẹt trùng trong 2 phút). Một lần quẹt → chỉ có giờ vào.
 */
export function groupPunches(punches: Punch[], shiftOf: ShiftLookup): DayPunches[] {
  const days = new Map<string, { key: string; workDate: Date; times: number[] }>();
  const distance = (at: number, d: Date, key: string) => {
    const w = shiftWindow(d, shiftOf(key, d));
    return at < w.start.getTime() ? w.start.getTime() - at : at > w.end.getTime() ? at - w.end.getTime() : 0;
  };
  for (const p of punches) {
    const t = p.at.getTime();
    const sameDay = workDateOf(p.at);
    const prevDay = new Date(sameDay.getTime() - 86_400_000);
    const wd = distance(t, prevDay, p.key) < distance(t, sameDay, p.key) ? prevDay : sameDay;
    const id = `${p.key}|${ymd(wd)}`;
    const d = days.get(id) ?? { key: p.key, workDate: wd, times: [] };
    d.times.push(t);
    days.set(id, d);
  }
  const out: DayPunches[] = [];
  for (const d of days.values()) {
    const t = [...new Set(d.times)].sort((a, b) => a - b).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 2 * 60_000);
    out.push({
      key: d.key,
      workDate: d.workDate,
      checkIn: new Date(t[0]),
      checkOut: t.length > 1 ? new Date(t[t.length - 1]) : null,
      punches: t.length,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key) || a.workDate.getTime() - b.workDate.getTime());
}
