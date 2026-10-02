/** Định dạng hiển thị. Tiền từ backend là chuỗi Decimal — chỉ dùng để hiển thị. */

const vnd = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function money(v: string | number | bigint | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'bigint') return vnd.format(v);
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? vnd.format(n) : String(v);
}

/**
 * Cộng chính xác các số tiền dạng chuỗi Decimal từ backend (vd "25000000.0000").
 * Dùng BigInt theo đơn vị 1/10000 đồng thay vì số thực để không sai số.
 * Trả về số đồng (làm tròn xuống phần lẻ), đủ để hiển thị tổng VND.
 */
export function sumMoney(values: string[]): bigint {
  const SCALE = 4;
  let total = 0n;
  for (const v of values) {
    const neg = v.startsWith('-');
    const [int, frac = ''] = v.replace('-', '').split('.');
    const units = BigInt(int || '0') * 10n ** BigInt(SCALE) + BigInt((frac + '0000').slice(0, SCALE));
    total += neg ? -units : units;
  }
  return total / 10n ** BigInt(SCALE);
}

/** "2026-09-29T00:00:00.000Z" → "29/09/2026" (cột DATE, không đổi múi giờ). */
export function date(v: string | null | undefined): string {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Ngày giờ theo giờ địa phương. */
export function dateTime(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function time(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Giá trị cho <input type="date">. */
export function toDateInput(v: string | null | undefined): string {
  return v ? v.slice(0, 10) : '';
}

/** Ngày hôm nay dạng YYYY-MM-DD theo giờ máy người dùng. */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

// ----- Nhãn tiếng Việt cho các enum -----
export const labels = {
  gender: { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' },
  bank: {
    VCB: 'Vietcombank',
    TCB: 'Techcombank',
    BIDV: 'BIDV',
    VTB: 'VietinBank',
    ACB: 'ACB',
    MB: 'MB Bank',
    VPB: 'VPBank',
    TPB: 'TPBank',
    STB: 'Sacombank',
    AGR: 'Agribank',
  },
  employmentStatus: {
    UPCOMING: 'Sắp vào làm',
    PROBATION: 'Thử việc',
    ACTIVE: 'Đang làm việc',
    SUSPENDED: 'Tạm hoãn',
    TERMINATED: 'Đã nghỉ việc',
  },
  employmentType: {
    EMPLOYEE: 'Nhân viên',
    APPRENTICE: 'Học việc',
    SEASONAL: 'Thời vụ',
    CONTRACTOR: 'Cộng tác viên',
  },
  orgType: {
    COMPANY: 'Công ty',
    BLOCK: 'Khối',
    DIVISION: 'Ban',
    DEPARTMENT: 'Phòng',
    TEAM: 'Nhóm',
  },
  assignmentAction: {
    HIRE: 'Tuyển dụng',
    TRANSFER: 'Điều chuyển',
    PROMOTION: 'Thăng chức',
    DEMOTION: 'Giáng chức',
    CONCURRENT: 'Kiêm nhiệm',
    INTER_COMPANY: 'Chuyển công ty',
    TERMINATE: 'Chấm dứt',
  },
  taxMethod: {
    PROGRESSIVE: 'Lũy tiến',
    FLAT_10: 'Khấu trừ 10%',
    FLAT_20: 'Không cư trú 20%',
  },
  periodStatus: {
    OPEN: 'Mới tạo',
    CALCULATED: 'Đã tính',
    LOCKED: 'Đã khoá',
    PAID: 'Đã trả',
  },
  leaveStatus: {
    PENDING: 'Chờ duyệt',
    APPROVED: 'Đã duyệt',
    REJECTED: 'Từ chối',
    CANCELLED: 'Đã huỷ',
  },
  attendance: {
    PRESENT: 'Đi làm',
    LATE: 'Đi muộn',
    REMOTE: 'Làm từ xa',
    ABSENT: 'Vắng',
    LEAVE: 'Nghỉ phép',
    HOLIDAY: 'Nghỉ lễ',
  },
  contractType: {
    PROBATION: 'Thử việc',
    FIXED_TERM: 'Xác định thời hạn',
    INDEFINITE: 'Không xác định thời hạn',
    SERVICE: 'Dịch vụ / CTV',
  },
  elementType: { EARNING: 'Thu nhập', DEDUCTION: 'Khấu trừ' },
  taxTreatment: { TAXABLE: 'Chịu thuế', PARTIAL_EXEMPT: 'Miễn thuế một phần', EXEMPT: 'Miễn thuế' },
  advanceStatus: { PENDING: 'Chờ duyệt', APPROVED: 'Chưa trừ', DEDUCTING: 'Đang trừ', DONE: 'Đã trừ hết', CANCELLED: 'Đã huỷ' },
  otType: { WEEKDAY: 'Ngày thường', WEEKEND: 'Ngày nghỉ tuần', HOLIDAY: 'Ngày lễ' },
  openingStatus: { DRAFT: 'Nháp', OPEN: 'Đang tuyển', CLOSED: 'Đã đóng' },
  stage: {
    APPLIED: 'Mới nộp',
    SCREENING: 'Sàng lọc',
    INTERVIEW: 'Phỏng vấn',
    OFFER: 'Đề nghị',
    HIRED: 'Nhận việc',
    REJECTED: 'Loại',
  },
} as const;

export function options<T extends Record<string, string>>(map: T) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}
