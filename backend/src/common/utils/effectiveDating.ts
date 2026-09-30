/**
 * Tiện ích cho mô hình dữ liệu theo NGÀY HIỆU LỰC (effective-dating).
 *
 * Nguyên tắc: mỗi đối tượng thay đổi theo thời gian (vị trí công việc,
 * lương, cơ cấu tổ chức) được lưu thành nhiều dòng, mỗi dòng có
 * effectiveDate và endDate. endDate = null nghĩa là đang có hiệu lực.
 * Các dòng của cùng một đối tượng KHÔNG được chồng lấn thời gian.
 */

export interface EffectiveDated {
  effectiveDate: Date;
  endDate: Date | null;
}

/** Lấy về dòng đang có hiệu lực tại một thời điểm. */
export function pickEffective<T extends EffectiveDated>(
  rows: readonly T[],
  asOf: Date = new Date(),
): T | undefined {
  return rows
    .filter(
      (r) =>
        r.effectiveDate <= asOf && (r.endDate === null || r.endDate >= asOf),
    )
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];
}

/**
 * Tính endDate cho dòng cũ khi chèn một dòng mới có hiệu lực từ
 * newEffectiveDate: dòng cũ kết thúc vào ngày liền trước.
 */
export function previousDay(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d;
}

/** Kiểm tra hai khoảng thời gian có chồng lấn không. */
export function overlaps(a: EffectiveDated, b: EffectiveDated): boolean {
  const aEnd = a.endDate ?? new Date('9999-12-31');
  const bEnd = b.endDate ?? new Date('9999-12-31');
  return a.effectiveDate <= bEnd && b.effectiveDate <= aEnd;
}
