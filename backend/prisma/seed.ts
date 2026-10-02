import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password';

const prisma = new PrismaClient();

/**
 * Nạp dữ liệu nền tối thiểu để hệ thống chạy được:
 *  - tham số pháp lý 2026 (giảm trừ, lương cơ sở, lương tối thiểu vùng)
 *  - biểu thuế TNCN 5 bậc
 *  - tỷ lệ bảo hiểm
 *  - một công ty và một phòng ban mẫu
 */
async function main() {
  const eff = new Date('2026-01-01');

  // Tham số pháp lý
  const params: Array<[string, number, string]> = [
    ['PERSONAL_DEDUCTION', 15_500_000, 'Luật Thuế TNCN sửa đổi 2026'],
    ['DEPENDANT_DEDUCTION', 6_200_000, 'Luật Thuế TNCN sửa đổi 2026'],
    ['BASE_SALARY', 2_340_000, 'Lương cơ sở'],
    ['MIN_WAGE_REGION_1', 5_310_000, 'Nghị định 293/2025/NĐ-CP'],
    ['MIN_WAGE_REGION_2', 4_730_000, 'Nghị định 293/2025/NĐ-CP'],
    ['MIN_WAGE_REGION_3', 4_140_000, 'Nghị định 293/2025/NĐ-CP'],
    ['MIN_WAGE_REGION_4', 3_700_000, 'Nghị định 293/2025/NĐ-CP'],
  ];
  for (const [code, value, doc] of params) {
    await prisma.legalParameter.upsert({
      where: { paramCode_effectiveDate: { paramCode: code, effectiveDate: eff } },
      update: { value },
      create: { paramCode: code, value, effectiveDate: eff, legalDocument: doc },
    });
  }

  // Lương cơ sở tăng từ 1/7/2026 (ảnh hưởng trần đóng BHXH, BHYT).
  await prisma.legalParameter.upsert({
    where: { paramCode_effectiveDate: { paramCode: 'BASE_SALARY', effectiveDate: new Date('2026-07-01') } },
    update: {},
    create: { paramCode: 'BASE_SALARY', value: 2_530_000, effectiveDate: new Date('2026-07-01'), legalDocument: 'Lương cơ sở từ 01/7/2026' },
  });

  // Biểu thuế TNCN 5 bậc
  const brackets: Array<[number, number, number | null, string, number]> = [
    [1, 0, 10_000_000, '0.05', 0],
    [2, 10_000_000, 30_000_000, '0.10', 500_000],
    [3, 30_000_000, 60_000_000, '0.20', 3_500_000],
    [4, 60_000_000, 100_000_000, '0.30', 9_500_000],
    [5, 100_000_000, null, '0.35', 14_500_000],
  ];
  for (const [no, from, to, rate, qd] of brackets) {
    await prisma.taxBracket.upsert({
      where: {
        scheduleCode_bracketNo_effectiveDate: {
          scheduleCode: 'PIT_2026_5B',
          bracketNo: no,
          effectiveDate: eff,
        },
      },
      update: {},
      create: {
        scheduleCode: 'PIT_2026_5B',
        bracketNo: no,
        fromAmount: from,
        toAmount: to ?? undefined,
        rate,
        quickDeduction: qd,
        effectiveDate: eff,
      },
    });
  }

  // Tỷ lệ bảo hiểm (nhân viên Việt Nam)
  const rates: Array<[string, string, string, string, number]> = [
    ['SOCIAL', '0.08', '0.175', 'BASE_SALARY', 20],
    ['HEALTH', '0.015', '0.03', 'BASE_SALARY', 20],
    ['UNEMPLOYMENT', '0.01', '0.01', 'MIN_WAGE_REGION', 20],
  ];
  for (const [type, empRate, coRate, capBase, cap] of rates) {
    await prisma.insuranceRate.upsert({
      where: {
        insuranceType_employeeCategory_effectiveDate: {
          insuranceType: type,
          employeeCategory: 'VN',
          effectiveDate: eff,
        },
      },
      update: {},
      create: {
        insuranceType: type,
        employeeCategory: 'VN',
        employeeRate: empRate,
        companyRate: coRate,
        capBase,
        capMultiplier: cap,
        effectiveDate: eff,
      },
    });
  }

  // Công ty + phòng ban mẫu
  const company = await prisma.company.upsert({
    where: { code: 'ATECH' },
    update: {},
    create: { code: 'ATECH', name: 'ATECH', taxCode: '0000000000' },
  });

  await prisma.orgStructure.upsert({
    where: { companyId_code: { companyId: company.id, code: 'ATECH-HO' } },
    update: {},
    create: {
      companyId: company.id,
      code: 'ATECH-HO',
      name: 'Trụ sở chính',
      orgType: 'COMPANY',
      isRoot: true,
      path: '/ATECH/',
      effectiveDate: eff,
    },
  });

  // Loại nghỉ theo Bộ luật Lao động 2019. daysPerYear null = không giới hạn.
  const leaveTypes: Array<[string, string, boolean, number | null]> = [
    ['PN', 'Phép năm', true, 12], // Điều 113: 12 ngày/năm, cộng thêm theo thâm niên
    ['VR', 'Việc riêng có lương', true, null], // Điều 115: kết hôn, tang...
    ['OM', 'Nghỉ ốm (BHXH chi trả)', false, null],
    ['TS', 'Thai sản (BHXH chi trả)', false, null],
    ['KL', 'Nghỉ không lương', false, null],
  ];
  for (const [code, name, isPaid, daysPerYear] of leaveTypes) {
    // Phép năm: cộng thâm niên; chuyển tối đa 5 ngày còn lại sang năm sau, dùng đến hết tháng 3.
    const annual = code === 'PN' ? { seniorityBonus: true, carryOverMaxDays: '5', carryOverUntilMonth: 3 } : {};
    await prisma.leaveType.upsert({
      where: { code },
      update: annual,
      create: {
        code,
        name,
        isPaid,
        daysPerYear: daysPerYear === null ? null : String(daysPerYear),
        ...annual,
      },
    });
  }

  // Khoản lương mẫu. Mức miễn thuế ăn ca 730.000đ/tháng (TT 26/2016/TT-BLĐTBXH).
  const elements: Array<{
    code: string;
    name: string;
    type: 'EARNING' | 'DEDUCTION';
    taxTreatment: 'TAXABLE' | 'PARTIAL_EXEMPT' | 'EXEMPT';
    taxExemptLimit?: string;
    isInsuranceBase: boolean;
    isProrated: boolean;
  }> = [
    { code: 'AN_CA', name: 'Phụ cấp ăn ca', type: 'EARNING', taxTreatment: 'PARTIAL_EXEMPT', taxExemptLimit: '730000', isInsuranceBase: false, isProrated: true },
    { code: 'TRACH_NHIEM', name: 'Phụ cấp trách nhiệm', type: 'EARNING', taxTreatment: 'TAXABLE', isInsuranceBase: true, isProrated: true },
    { code: 'XANG_XE', name: 'Phụ cấp xăng xe', type: 'EARNING', taxTreatment: 'TAXABLE', isInsuranceBase: false, isProrated: false },
    { code: 'DIEN_THOAI', name: 'Phụ cấp điện thoại', type: 'EARNING', taxTreatment: 'TAXABLE', isInsuranceBase: false, isProrated: false },
    { code: 'THUONG', name: 'Thưởng', type: 'EARNING', taxTreatment: 'TAXABLE', isInsuranceBase: false, isProrated: false },
    { code: 'TRUY_LINH', name: 'Truy lĩnh lương', type: 'EARNING', taxTreatment: 'TAXABLE', isInsuranceBase: false, isProrated: false },
    { code: 'PHAT', name: 'Phạt vi phạm', type: 'DEDUCTION', taxTreatment: 'TAXABLE', isInsuranceBase: false, isProrated: false },
    { code: 'TRUY_THU', name: 'Truy thu', type: 'DEDUCTION', taxTreatment: 'TAXABLE', isInsuranceBase: false, isProrated: false },
  ];
  for (const e of elements) {
    await prisma.payElement.upsert({ where: { code: e.code }, update: {}, create: e });
  }

  // Ngày nghỉ lễ, Tết năm 2026 (Điều 112 BLLĐ 2019 và thông báo nghỉ bù).
  // Tết Âm lịch và Giỗ Tổ các năm sau phải được nhân sự bổ sung theo thông báo hằng năm.
  const holidays: Array<[string, string]> = [
    ['2026-01-01', 'Tết Dương lịch'],
    ['2026-02-16', 'Tết Nguyên đán'],
    ['2026-02-17', 'Tết Nguyên đán'],
    ['2026-02-18', 'Tết Nguyên đán'],
    ['2026-02-19', 'Tết Nguyên đán'],
    ['2026-02-20', 'Tết Nguyên đán'],
    ['2026-04-27', 'Nghỉ bù Giỗ Tổ Hùng Vương'],
    ['2026-04-30', 'Ngày Chiến thắng'],
    ['2026-05-01', 'Quốc tế Lao động'],
    ['2026-09-01', 'Quốc khánh'],
    ['2026-09-02', 'Quốc khánh'],
    ['2027-01-01', 'Tết Dương lịch'],
    ['2027-04-30', 'Ngày Chiến thắng'],
    ['2027-05-01', 'Quốc tế Lao động'],
    ['2027-09-02', 'Quốc khánh'],
  ];
  for (const [date, name] of holidays) {
    await prisma.holiday.upsert({ where: { date: new Date(date) }, update: {}, create: { date: new Date(date), name } });
  }

  // Ca làm việc mẫu: hành chính + 3 ca sản xuất xoay vòng.
  const shifts = [
    { code: 'HC', name: 'Hành chính', startTime: '08:30', endTime: '17:30', breakMinutes: 60, lateGraceMinutes: 0, color: '#2a78d6' },
    { code: 'CA1', name: 'Ca 1 (sáng)', startTime: '06:00', endTime: '14:00', breakMinutes: 30, lateGraceMinutes: 5, color: '#16a34a' },
    { code: 'CA2', name: 'Ca 2 (chiều)', startTime: '14:00', endTime: '22:00', breakMinutes: 30, lateGraceMinutes: 5, color: '#eb6834' },
    { code: 'CA3', name: 'Ca 3 (đêm)', startTime: '22:00', endTime: '06:00', breakMinutes: 30, lateGraceMinutes: 5, color: '#7c3aed' },
  ];
  for (const sh of shifts) {
    await prisma.shift.upsert({ where: { code: sh.code }, update: {}, create: sh });
  }

  // Tài khoản quản trị đầu tiên. Chỉ tạo nếu chưa có, không ghi đè mật khẩu.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error('Cần SEED_ADMIN_PASSWORD (ít nhất 8 ký tự) trong .env');
  }
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: await hashPassword(adminPassword),
      role: 'ADMIN',
    },
  });

  console.log('✅ Seed xong: tham số pháp lý 2026, biểu thuế, tỷ lệ BH, công ty mẫu, loại nghỉ, khoản lương, ngày lễ, ca làm việc, tài khoản admin.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
