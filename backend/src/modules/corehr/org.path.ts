/**
 * Hàm thuần xử lý path của cây tổ chức, tách riêng để test được
 * mà không cần database.
 */

/** Thay tiền tố (prefix) ở ĐẦU chuỗi. Trả nguyên chuỗi nếu không khớp đầu. */
export function replacePrefix(
  value: string,
  oldPrefix: string,
  newPrefix: string,
): string {
  if (!value.startsWith(oldPrefix)) return value;
  return newPrefix + value.slice(oldPrefix.length);
}

/**
 * Kiểm tra `candidateParentPath` có nằm trong nhánh con của `ownPath` không.
 * Dùng để chống vòng lặp khi đổi cha (không cho chọn con làm cha).
 */
export function isDescendantPath(
  candidateParentPath: string,
  ownPath: string,
): boolean {
  return candidateParentPath.startsWith(ownPath);
}
