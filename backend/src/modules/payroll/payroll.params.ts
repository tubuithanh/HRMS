import Decimal from 'decimal.js';

/**
 * Tham số pháp lý cho tính lương, áp dụng từ kỳ tính thuế 2026.
 *
 * Các mức này được đưa vào code làm giá trị mặc định để module chạy và
 * test được. Trong hệ thống thật, chúng phải nằm trong bảng LegalParameter /
 * TaxBracket / InsuranceRate (có ngày hiệu lực) và được nạp từ database,
 * vì luật thay đổi gần như mỗi năm.
 *
 * Nguồn (tra cứu 2026):
 *  - Giảm trừ gia cảnh: bản thân 15,5 triệu/tháng; mỗi người phụ thuộc
 *    6,2 triệu/tháng (Luật Thuế TNCN sửa đổi, áp dụng kỳ tính thuế 2026).
 *  - Biểu thuế lũy tiến rút gọn còn 5 bậc: 5%, 10%, 20%, 30%, 35%
 *    (Luật 109/2025/QH15).
 *  - Lương tối thiểu vùng từ 1/1/2026 (Nghị định 293/2025/NĐ-CP).
 *  - Lương cơ sở 2.340.000 (đến 30/6/2026) / 2.530.000 (từ 1/7/2026).
 *
 * LƯU Ý: người dùng cần đối chiếu lại với văn bản hướng dẫn mới nhất của
 * cơ quan thuế và BHXH trước khi vận hành thật, nhất là giai đoạn chuyển
 * tiếp giữa năm 2026.
 */

/** Giảm trừ gia cảnh (đồng/tháng). */
export const PERSONAL_DEDUCTION = new Decimal(15_500_000);
export const DEPENDANT_DEDUCTION = new Decimal(6_200_000);

/** Lương cơ sở dùng tính trần đóng BHXH/BHYT (đồng/tháng). */
export const BASE_SALARY = new Decimal(2_340_000);

/** Lương tối thiểu vùng 2026 (đồng/tháng) — dùng tính trần đóng BHTN. */
export const MIN_WAGE_REGION: Record<number, Decimal> = {
  1: new Decimal(5_310_000),
  2: new Decimal(4_730_000),
  3: new Decimal(4_140_000),
  4: new Decimal(3_700_000),
};

/**
 * Biểu thuế TNCN lũy tiến 5 bậc 2026.
 * quickDeduction = số trừ dùng cho công thức tính nhanh:
 *   thuế = thu nhập tính thuế * rate - quickDeduction
 */
export interface TaxBracketDef {
  bracketNo: number;
  from: Decimal;
  to: Decimal | null; // null = không giới hạn
  rate: Decimal;
  quickDeduction: Decimal;
}

export const PIT_BRACKETS_2026: TaxBracketDef[] = [
  { bracketNo: 1, from: new Decimal(0), to: new Decimal(10_000_000), rate: new Decimal('0.05'), quickDeduction: new Decimal(0) },
  { bracketNo: 2, from: new Decimal(10_000_000), to: new Decimal(30_000_000), rate: new Decimal('0.10'), quickDeduction: new Decimal(500_000) },
  { bracketNo: 3, from: new Decimal(30_000_000), to: new Decimal(60_000_000), rate: new Decimal('0.20'), quickDeduction: new Decimal(3_500_000) },
  { bracketNo: 4, from: new Decimal(60_000_000), to: new Decimal(100_000_000), rate: new Decimal('0.30'), quickDeduction: new Decimal(9_500_000) },
  { bracketNo: 5, from: new Decimal(100_000_000), to: null, rate: new Decimal('0.35'), quickDeduction: new Decimal(14_500_000) },
];

/**
 * Tỷ lệ đóng bảo hiểm bắt buộc (nhân viên Việt Nam).
 * capMultiplier: mức trần = capMultiplier * capBase.
 */
export interface InsuranceRateDef {
  type: 'SOCIAL' | 'HEALTH' | 'UNEMPLOYMENT';
  employeeRate: Decimal;
  companyRate: Decimal;
  capBase: 'BASE_SALARY' | 'MIN_WAGE_REGION';
  capMultiplier: number;
}

export const INSURANCE_RATES_VN: InsuranceRateDef[] = [
  // BHXH: NV 8%, DN 17,5% (8% + 3% ốm đau thai sản + ... — ở đây gộp phần DN)
  { type: 'SOCIAL', employeeRate: new Decimal('0.08'), companyRate: new Decimal('0.175'), capBase: 'BASE_SALARY', capMultiplier: 20 },
  // BHYT: NV 1,5%, DN 3%
  { type: 'HEALTH', employeeRate: new Decimal('0.015'), companyRate: new Decimal('0.03'), capBase: 'BASE_SALARY', capMultiplier: 20 },
  // BHTN: NV 1%, DN 1% — trần = 20 lần lương tối thiểu vùng
  { type: 'UNEMPLOYMENT', employeeRate: new Decimal('0.01'), companyRate: new Decimal('0.01'), capBase: 'MIN_WAGE_REGION', capMultiplier: 20 },
];

/** Thuế suất khấu trừ cố định (đồng/tháng ngưỡng áp dụng 10%). */
export const FLAT_10_THRESHOLD = new Decimal(2_000_000);
export const FLAT_10_RATE = new Decimal('0.10');
export const FLAT_20_RATE = new Decimal('0.20'); // không cư trú

/**
 * Bộ tham số pháp lý dùng cho một lần tính lương. Hệ thống nạp từ database
 * theo ngày hiệu lực (legal.service.ts); các hằng số trên chỉ là giá trị mặc
 * định khi database chưa có dữ liệu và cho unit test.
 */
export interface LegalParams {
  personalDeduction: Decimal;
  dependantDeduction: Decimal;
  baseSalary: Decimal;
  minWageRegion: Record<number, Decimal>;
  pitBrackets: TaxBracketDef[];
  insuranceRates: InsuranceRateDef[];
}

export const DEFAULT_LEGAL_PARAMS: LegalParams = {
  personalDeduction: PERSONAL_DEDUCTION,
  dependantDeduction: DEPENDANT_DEDUCTION,
  baseSalary: BASE_SALARY,
  minWageRegion: MIN_WAGE_REGION,
  pitBrackets: PIT_BRACKETS_2026,
  insuranceRates: INSURANCE_RATES_VN,
};
