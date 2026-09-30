import Decimal from 'decimal.js';

/**
 * Công cụ tính tiền an toàn cho HRM.
 *
 * QUAN TRỌNG: mọi phép tính lương, thuế, bảo hiểm PHẢI đi qua đây.
 * Không được dùng phép + - * / trên `number` của JavaScript cho tiền,
 * vì số thực dấu phẩy động gây sai số (ví dụ 0.1 + 0.2 !== 0.3).
 *
 * QUY TẮC LÀM TRÒN:
 *  - Các bước tính TRUNG GIAN giữ độ chính xác cao (precision 30 chữ số
 *    có nghĩa) để không tích luỹ sai số khi cộng dồn nhiều khoản.
 *  - Chỉ làm tròn về đồng VND (roundVND) ở GIÁ TRỊ CHI TRẢ CUỐI CÙNG,
 *    ngay trước khi hiển thị hoặc lưu xuống cột tiền của database.
 *  - Phép chia có thể tạo số thập phân vô hạn (ví dụ chia lương cho 3),
 *    nên KHÔNG dùng phép chia trơn cho tiền. Dùng `divRound` và nói rõ
 *    số chữ số thập phân cần giữ.
 */

// precision = tổng số chữ số có nghĩa giữ trong tính trung gian.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/** Số chữ số thập phân mặc định giữ khi chia (đủ cho tỷ lệ thuế, BH). */
const DEFAULT_DIV_SCALE = 10;

/** Số chữ số thập phân tối đa khi lưu vào cột Decimal của database. */
const DB_SCALE = 4;

export type Money = Decimal;

export const money = (value: Decimal.Value): Money => new Decimal(value);

export const add = (a: Decimal.Value, b: Decimal.Value): Money =>
  new Decimal(a).plus(b);

export const sub = (a: Decimal.Value, b: Decimal.Value): Money =>
  new Decimal(a).minus(b);

export const mul = (a: Decimal.Value, b: Decimal.Value): Money =>
  new Decimal(a).times(b);

/**
 * Chia CÓ KIỂM SOÁT: bắt buộc xác định số chữ số thập phân giữ lại,
 * để kết quả ổn định và không phụ thuộc precision toàn cục.
 * Dùng cho mọi phép chia liên quan tới tiền (chia lương theo ngày công...).
 */
export const divRound = (
  a: Decimal.Value,
  b: Decimal.Value,
  scale: number = DEFAULT_DIV_SCALE,
): Money => {
  const divisor = new Decimal(b);
  if (divisor.isZero()) {
    throw new Error('money.divRound: không thể chia cho 0');
  }
  return new Decimal(a)
    .dividedBy(divisor)
    .toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
};

/**
 * Cộng dồn một danh sách khoản tiền. Dùng thay cho vòng lặp + `+`
 * để mọi phép cộng đều đi qua Decimal.
 */
export const sum = (values: Decimal.Value[]): Money =>
  values.reduce<Money>((acc, v) => acc.plus(v), new Decimal(0));

/** Làm tròn về số nguyên đồng (VND không có phần lẻ khi chi trả). */
export const roundVND = (a: Decimal.Value): Money =>
  new Decimal(a).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/**
 * Chuyển sang chuỗi để lưu vào cột Decimal của Prisma, giới hạn số
 * chữ số thập phân theo DB_SCALE để không vượt quá scale của cột.
 */
export const toDbString = (a: Money, scale: number = DB_SCALE): string =>
  a.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed();

/** So sánh bằng (an toàn hơn so sánh number). */
export const eq = (a: Decimal.Value, b: Decimal.Value): boolean =>
  new Decimal(a).equals(b);
