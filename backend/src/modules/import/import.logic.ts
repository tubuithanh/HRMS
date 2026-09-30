/**
 * Chuyển giá trị ô Excel sang kiểu dữ liệu. Hàm thuần để test được.
 * Mỗi hàm trả về { value } hoặc { error } để gom lỗi theo dòng.
 */

export type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

export type CellValue = string | number | boolean | Date | null | undefined | { text?: string; result?: unknown; richText?: Array<{ text: string }> };

/** Lấy chữ từ ô (hỗ trợ ô công thức, rich text, hyperlink của exceljs). */
export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v && v.richText) return v.richText.map((r) => r.text).join('').trim();
    if ('result' in v && v.result !== undefined) return cellText(v.result as CellValue);
    if ('text' in v && v.text !== undefined) return String(v.text).trim();
    return '';
  }
  return String(v).trim();
}

/** Ngày: ô kiểu Date của Excel, "dd/mm/yyyy", "d/m/yyyy" hoặc "yyyy-mm-dd". Trả về 00:00 UTC. */
export function parseDate(v: CellValue): Parsed<Date | null> {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { error: 'ngày không hợp lệ' };
    // exceljs trả ngày dạng 00:00 UTC; làm tròn để bỏ phần giờ lẻ.
    return { value: new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) };
  }
  if (typeof v === 'object' && v !== null && 'result' in v) return parseDate(v.result as CellValue);
  const s = cellText(v);
  if (!s) return { value: null };
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (match) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return { error: `ngày "${s}" không đúng dạng dd/mm/yyyy` };
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { error: `ngày "${s}" không tồn tại` };
  }
  return { value: date };
}

/** Giờ "HH:mm" hoặc ô kiểu thời gian của Excel. Trả về [giờ, phút]. */
export function parseTime(v: CellValue): Parsed<[number, number] | null> {
  if (v instanceof Date) return { value: [v.getUTCHours(), v.getUTCMinutes()] };
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const minutes = Math.round(v * 24 * 60);
    return { value: [Math.floor(minutes / 60), minutes % 60] };
  }
  const s = cellText(v);
  if (!s) return { value: null };
  const m = /^(\d{1,2})[:hH](\d{2})$/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { error: `giờ "${s}" không đúng dạng HH:mm` };
  return { value: [Number(m[1]), Number(m[2])] };
}

/** Số tiền: số hoặc chuỗi có dấu chấm/phẩy/khoảng trắng phân tách hàng nghìn. */
export function parseMoney(v: CellValue): Parsed<number | null> {
  if (typeof v === 'number') return v < 0 ? { error: 'số tiền không được âm' } : { value: v };
  const s = cellText(v).replace(/đ|vnd|VND/g, '').trim();
  if (!s) return { value: null };
  if (!/^[\d.,\s]+$/.test(s)) return { error: `số tiền "${s}" không hợp lệ` };
  const n = Number(s.replace(/[.,\s]/g, ''));
  return Number.isFinite(n) ? { value: n } : { error: `số tiền "${s}" không hợp lệ` };
}

export function parseGender(v: CellValue): Parsed<'MALE' | 'FEMALE' | 'OTHER' | null> {
  const s = cellText(v).toLowerCase();
  if (!s) return { value: null };
  if (['nam', 'm', 'male'].includes(s)) return { value: 'MALE' };
  if (['nữ', 'nu', 'f', 'female'].includes(s)) return { value: 'FEMALE' };
  if (['khác', 'khac', 'other'].includes(s)) return { value: 'OTHER' };
  return { error: `giới tính "${cellText(v)}" phải là Nam / Nữ / Khác` };
}

export type AttendanceCode = 'PRESENT' | 'LATE' | 'REMOTE' | 'ABSENT' | 'LEAVE' | 'HOLIDAY';

/** Ký hiệu bảng công giống màn hình: X M R V P L, hoặc chữ đầy đủ. */
export function parseAttendanceStatus(v: CellValue): Parsed<AttendanceCode> {
  const s = cellText(v).toLowerCase();
  const map: Record<string, AttendanceCode> = {
    x: 'PRESENT', 'đi làm': 'PRESENT', present: 'PRESENT',
    m: 'LATE', 'đi muộn': 'LATE', late: 'LATE',
    r: 'REMOTE', 'làm từ xa': 'REMOTE', remote: 'REMOTE',
    v: 'ABSENT', 'vắng': 'ABSENT', absent: 'ABSENT',
    p: 'LEAVE', 'nghỉ phép': 'LEAVE', leave: 'LEAVE',
    l: 'HOLIDAY', 'nghỉ lễ': 'HOLIDAY', holiday: 'HOLIDAY',
  };
  if (!s) return { error: 'thiếu trạng thái' };
  return map[s] ? { value: map[s] } : { error: `trạng thái "${cellText(v)}" phải là X, M, R, V, P hoặc L` };
}

/** Chỉ gồm chữ số, đúng độ dài (CCCD 12 số, MST 10 hoặc 13 số...). */
export function parseDigits(v: CellValue, lengths: number[], label: string): Parsed<string | null> {
  const s = cellText(v).replace(/\s/g, '');
  if (!s) return { value: null };
  if (!/^\d+$/.test(s) || !lengths.includes(s.length)) {
    return { error: `${label} "${s}" phải gồm ${lengths.join(' hoặc ')} chữ số` };
  }
  return { value: s };
}
