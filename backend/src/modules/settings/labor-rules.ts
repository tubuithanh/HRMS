import { z } from 'zod';

/**
 * QUY TẮC LUẬT LAO ĐỘNG / BHXH — các con số trong công thức (không phải mức tiền).
 * Mức tiền (giảm trừ, lương cơ sở, lương tối thiểu vùng, biểu thuế, tỷ lệ BH) nằm ở Tham số pháp lý theo ngày hiệu lực.
 * Mặc định = Bộ luật Lao động 2019, Luật BHXH 2024 (41/2024/QH15), NĐ 145/2020.
 * Khi luật đổi: Cấu hình hệ thống → Quy tắc luật lao động & BHXH (không cần sửa mã nguồn).
 * File thuần (không truy cập database) để các hàm tính toán dùng được và test được.
 */

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const num = (min: number, max: number) => z.number().min(min).max(max);

export const laborRulesSchema = z.object({
  // Hợp đồng (Điều 20, 25 BLLĐ)
  maxFixedTermMonths: int(1, 120),
  maxFixedTermContracts: int(1, 10),
  maxProbationDays: int(1, 365),
  // Phép năm (Điều 114)
  seniorityStepYears: int(1, 50),
  seniorityBonusDays: num(0, 10),
  // Trợ cấp thôi việc / mất việc (Điều 46, 47; NĐ 145/2020 Điều 8)
  severanceMinMonths: int(0, 120),
  resignMonthFactor: num(0, 5),
  redundancyMonthFactor: num(0, 5),
  redundancyMinMonths: num(0, 24),
  halfYearMaxMonths: int(0, 11),
  // Ốm đau (Điều 43 – 45 Luật BHXH)
  sickRatePercent: num(1, 100),
  sickDaysUnder15: int(0, 365),
  sickDays15To30: int(0, 365),
  sickDays30Plus: int(0, 365),
  hazardousExtraDays: int(0, 365),
  childSickUnder3: int(0, 365),
  childSick3To7: int(0, 365),
  /** Mức hưởng một ngày (chế độ tính theo ngày làm việc) = mức tháng ÷ số này. */
  workingDayDivisor: int(1, 31),
  /** Mức hưởng một ngày (chế độ tính theo ngày lịch) = mức tháng ÷ số này. */
  calendarDayDivisor: int(1, 31),
  // Thai sản (Điều 50 – 59)
  maternityRatePercent: num(1, 200),
  birthMonths: num(1, 24),
  extraMonthsPerChild: num(0, 12),
  lumpSumBaseSalaryTimes: num(0, 20),
  paternityDays: int(0, 60),
  paternitySurgeryDays: int(0, 60),
  paternityTwinsDays: int(0, 60),
  paternityTwinsSurgeryDays: int(0, 60),
  paternityExtraPerChild: int(0, 30),
  paternityWithinDays: int(1, 365),
  miscarriageUnder5Weeks: int(0, 365),
  miscarriage5To13Weeks: int(0, 365),
  miscarriage13To22Weeks: int(0, 365),
  miscarriage22PlusWeeks: int(0, 365),
  checkupMaxDays: int(1, 10),
  // Dưỡng sức (% lương cơ sở / ngày)
  recoveryRatePercent: num(1, 100),
});

export type LaborRules = z.infer<typeof laborRulesSchema>;

export const DEFAULT_LABOR_RULES: LaborRules = {
  maxFixedTermMonths: 36,
  maxFixedTermContracts: 2,
  maxProbationDays: 180,
  seniorityStepYears: 5,
  seniorityBonusDays: 1,
  severanceMinMonths: 12,
  resignMonthFactor: 0.5,
  redundancyMonthFactor: 1,
  redundancyMinMonths: 2,
  halfYearMaxMonths: 6,
  sickRatePercent: 75,
  sickDaysUnder15: 30,
  sickDays15To30: 40,
  sickDays30Plus: 60,
  hazardousExtraDays: 10,
  childSickUnder3: 20,
  childSick3To7: 15,
  workingDayDivisor: 24,
  calendarDayDivisor: 30,
  maternityRatePercent: 100,
  birthMonths: 6,
  extraMonthsPerChild: 1,
  lumpSumBaseSalaryTimes: 2,
  paternityDays: 5,
  paternitySurgeryDays: 7,
  paternityTwinsDays: 10,
  paternityTwinsSurgeryDays: 14,
  paternityExtraPerChild: 3,
  paternityWithinDays: 60,
  miscarriageUnder5Weeks: 10,
  miscarriage5To13Weeks: 20,
  miscarriage13To22Weeks: 40,
  miscarriage22PlusWeeks: 50,
  checkupMaxDays: 2,
  recoveryRatePercent: 30,
};
