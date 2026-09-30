/**
 * Các hàm thuần cho nghiệp vụ Core HR, tách để test không cần database.
 */

/**
 * Ngày kết thúc thử việc = ngày vào + số ngày - 1.
 * Ví dụ vào 1/1, thử việc 60 ngày -> ngày cuối là ngày thứ 60 (1/3),
 * không phải ngày thứ 61.
 */
export function calcProbationEndDate(
  dateHire: Date,
  probationDays: number,
): Date | undefined {
  if (!probationDays || probationDays <= 0) return undefined;
  const d = new Date(dateHire);
  d.setDate(d.getDate() + probationDays - 1);
  return d;
}

/**
 * Loại hành động mặc định cho một assignment:
 *  - chưa có vị trí chính nào trước đó -> HIRE (tuyển mới)
 *  - đã có -> TRANSFER (điều chuyển)
 */
export function defaultAssignmentAction(
  hasCurrentPrimary: boolean,
): 'HIRE' | 'TRANSFER' {
  return hasCurrentPrimary ? 'TRANSFER' : 'HIRE';
}
