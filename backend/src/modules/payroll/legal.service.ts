import Decimal from 'decimal.js';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { formatDate } from '../../common/utils/dates';
import { DEFAULT_LEGAL_PARAMS, InsuranceRateDef, LegalParams, TaxBracketDef } from './payroll.params';

/**
 * THAM SỐ PHÁP LÝ THEO NGÀY HIỆU LỰC
 *  - legal_parameter: giảm trừ, lương cơ sở, lương tối thiểu vùng (mỗi mã nhiều mức theo ngày).
 *  - tax_bracket: biểu thuế — một "phiên bản" là tập bậc cùng ngày hiệu lực.
 *  - insurance_rate: tỷ lệ BH — mỗi loại nhiều mức theo ngày.
 * Tính lương kỳ nào thì lấy mức hiệu lực vào ngày cuối kỳ đó.
 */

export const PARAM_CODES = {
  PERSONAL_DEDUCTION: 'Giảm trừ bản thân (đ/tháng)',
  DEPENDANT_DEDUCTION: 'Giảm trừ mỗi người phụ thuộc (đ/tháng)',
  BASE_SALARY: 'Lương cơ sở (đ/tháng)',
  MIN_WAGE_REGION_1: 'Lương tối thiểu vùng 1',
  MIN_WAGE_REGION_2: 'Lương tối thiểu vùng 2',
  MIN_WAGE_REGION_3: 'Lương tối thiểu vùng 3',
  MIN_WAGE_REGION_4: 'Lương tối thiểu vùng 4',
} as const;
export type ParamCode = keyof typeof PARAM_CODES;

/** Dòng có ngày hiệu lực muộn nhất nhưng không sau asOf. */
export function latestEffective<T extends { effectiveDate: Date }>(rows: T[], asOf: Date): T | undefined {
  return rows
    .filter((r) => r.effectiveDate <= asOf)
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];
}

/** Nạp bộ tham số hiệu lực vào ngày asOf; thiếu thì dùng mặc định. */
export async function loadLegalParams(asOf: Date): Promise<LegalParams> {
  const [params, brackets, rates] = await Promise.all([
    prisma.legalParameter.findMany({ where: { effectiveDate: { lte: asOf } } }),
    prisma.taxBracket.findMany({ where: { effectiveDate: { lte: asOf } } }),
    prisma.insuranceRate.findMany({ where: { effectiveDate: { lte: asOf }, employeeCategory: 'VN' } }),
  ]);
  const value = (code: ParamCode, fallback: Decimal) => {
    const row = latestEffective(params.filter((p) => p.paramCode === code), asOf);
    return row ? new Decimal(String(row.value)) : fallback;
  };

  // Biểu thuế: lấy nguyên tập bậc của ngày hiệu lực gần nhất.
  const latestBracketDate = latestEffective(brackets, asOf)?.effectiveDate;
  const pitBrackets: TaxBracketDef[] = latestBracketDate
    ? brackets
        .filter((b) => b.effectiveDate.getTime() === latestBracketDate.getTime())
        .sort((a, b) => a.bracketNo - b.bracketNo)
        .map((b) => ({
          bracketNo: b.bracketNo,
          from: new Decimal(String(b.fromAmount)),
          to: b.toAmount === null ? null : new Decimal(String(b.toAmount)),
          rate: new Decimal(String(b.rate)),
          quickDeduction: new Decimal(String(b.quickDeduction)),
        }))
    : DEFAULT_LEGAL_PARAMS.pitBrackets;

  const insuranceRates: InsuranceRateDef[] = DEFAULT_LEGAL_PARAMS.insuranceRates.map((def) => {
    const row = latestEffective(rates.filter((r) => r.insuranceType === def.type), asOf);
    return row
      ? {
          type: def.type,
          employeeRate: new Decimal(String(row.employeeRate)),
          companyRate: new Decimal(String(row.companyRate)),
          capBase: row.capBase as InsuranceRateDef['capBase'],
          capMultiplier: row.capMultiplier,
        }
      : def;
  });

  return {
    personalDeduction: value('PERSONAL_DEDUCTION', DEFAULT_LEGAL_PARAMS.personalDeduction),
    dependantDeduction: value('DEPENDANT_DEDUCTION', DEFAULT_LEGAL_PARAMS.dependantDeduction),
    baseSalary: value('BASE_SALARY', DEFAULT_LEGAL_PARAMS.baseSalary),
    minWageRegion: {
      1: value('MIN_WAGE_REGION_1', DEFAULT_LEGAL_PARAMS.minWageRegion[1]),
      2: value('MIN_WAGE_REGION_2', DEFAULT_LEGAL_PARAMS.minWageRegion[2]),
      3: value('MIN_WAGE_REGION_3', DEFAULT_LEGAL_PARAMS.minWageRegion[3]),
      4: value('MIN_WAGE_REGION_4', DEFAULT_LEGAL_PARAMS.minWageRegion[4]),
    },
    pitBrackets,
    insuranceRates,
  };
}

/**
 * Số trừ dùng cho công thức tính nhanh của từng bậc:
 * quick_i = from_i × thuế suất_i − thuế lũy tiến của phần thu nhập đến from_i.
 */
export function quickDeductions(brackets: Array<{ from: number; to: number | null; rate: number }>): Decimal[] {
  let cumulative = new Decimal(0);
  return brackets.map((x, i) => {
    if (i > 0) {
      const prev = brackets[i - 1];
      cumulative = cumulative.plus(new Decimal(prev.to!).minus(prev.from).mul(prev.rate));
    }
    return new Decimal(x.from).mul(x.rate).minus(cumulative);
  });
}

/** Tóm tắt để lưu vào snapshot kết quả lương (đối chiếu về sau). */
export function legalSummary(l: LegalParams) {
  return {
    personalDeduction: l.personalDeduction.toString(),
    dependantDeduction: l.dependantDeduction.toString(),
    baseSalary: l.baseSalary.toString(),
    minWageRegion: Object.fromEntries(Object.entries(l.minWageRegion).map(([k, v]) => [k, v.toString()])),
    insurance: l.insuranceRates.map((r) => `${r.type}:${r.employeeRate}/${r.companyRate}`).join(','),
    brackets: l.pitBrackets.length,
  };
}

// ================= Quản trị (ADMIN) =================

/** Ngày cuối của kỳ lương đã khoá gần nhất — không cho thay đổi mức có hiệu lực từ ngày này trở về trước. */
async function lockedUntil(): Promise<Date | null> {
  const p = await prisma.payPeriod.findFirst({ where: { status: { in: ['LOCKED', 'PAID'] } }, orderBy: { dateEnd: 'desc' } });
  return p?.dateEnd ?? null;
}

async function assertNotInLockedPeriod(effectiveDate: Date) {
  const until = await lockedUntil();
  if (until && effectiveDate <= until) {
    throw new AppError(
      `Ngày hiệu lực phải sau ${formatDate(until).split('-').reverse().join('/')} (kỳ lương đã khoá gần nhất) để không làm thay đổi lương đã chốt`,
      409,
      'PERIOD_LOCKED',
    );
  }
}

const dec = (label: string) =>
  z.number({ invalid_type_error: `${label} phải là số` }).nonnegative(`${label} không được âm`);

export const parameterSchema = z.object({
  paramCode: z.enum(Object.keys(PARAM_CODES) as [ParamCode, ...ParamCode[]]),
  value: dec('Giá trị').positive('Giá trị phải lớn hơn 0'),
  effectiveDate: z.coerce.date(),
  legalDocument: z.string().trim().max(200).optional(),
});

export const insuranceSchema = z.object({
  effectiveDate: z.coerce.date(),
  rates: z
    .array(
      z.object({
        type: z.enum(['SOCIAL', 'HEALTH', 'UNEMPLOYMENT']),
        employeeRate: dec('Tỷ lệ NLĐ').max(1),
        companyRate: dec('Tỷ lệ DN').max(1),
        capBase: z.enum(['BASE_SALARY', 'MIN_WAGE_REGION']),
        capMultiplier: z.number().int().min(1).max(100),
      }),
    )
    .length(3, 'Cần đủ 3 loại BHXH, BHYT, BHTN'),
});

export const bracketsSchema = z.object({
  effectiveDate: z.coerce.date(),
  brackets: z
    .array(z.object({ from: dec('Từ'), to: dec('Đến').nullable(), rate: dec('Thuế suất').max(1) }))
    .min(1)
    .max(10),
});

export const legalService = {
  /** Toàn bộ lịch sử + mức đang áp dụng hôm nay. */
  async overview() {
    const [params, brackets, rates, until] = await Promise.all([
      prisma.legalParameter.findMany({ orderBy: [{ paramCode: 'asc' }, { effectiveDate: 'desc' }] }),
      prisma.taxBracket.findMany({ orderBy: [{ effectiveDate: 'desc' }, { bracketNo: 'asc' }] }),
      prisma.insuranceRate.findMany({ where: { employeeCategory: 'VN' }, orderBy: [{ effectiveDate: 'desc' }, { insuranceType: 'asc' }] }),
      lockedUntil(),
    ]);
    const current = await loadLegalParams(new Date());
    const bracketVersions = [...new Set(brackets.map((b) => b.effectiveDate.getTime()))].map((t) => ({
      effectiveDate: new Date(t),
      brackets: brackets.filter((b) => b.effectiveDate.getTime() === t),
    }));
    return {
      lockedUntil: until,
      codes: PARAM_CODES,
      parameters: params,
      bracketVersions,
      insurance: rates,
      current: legalSummary(current),
    };
  },

  async addParameter(input: z.infer<typeof parameterSchema>) {
    await assertNotInLockedPeriod(input.effectiveDate);
    const dup = await prisma.legalParameter.findUnique({
      where: { paramCode_effectiveDate: { paramCode: input.paramCode, effectiveDate: input.effectiveDate } },
    });
    if (dup) throw new ConflictError('Đã có mức của tham số này cùng ngày hiệu lực');
    return prisma.legalParameter.create({ data: { ...input, value: String(input.value) } });
  },

  async removeParameter(id: string) {
    const row = await prisma.legalParameter.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Không tìm thấy mức tham số');
    await assertNotInLockedPeriod(row.effectiveDate);
    const others = await prisma.legalParameter.count({ where: { paramCode: row.paramCode, id: { not: id } } });
    if (others === 0) throw new ConflictError('Không thể xoá mức duy nhất của tham số');
    await prisma.legalParameter.delete({ where: { id } });
  },

  async addInsurance(input: z.infer<typeof insuranceSchema>) {
    await assertNotInLockedPeriod(input.effectiveDate);
    const types = new Set(input.rates.map((r) => r.type));
    if (types.size !== 3) throw new ValidationError('Mỗi loại bảo hiểm chỉ khai một lần');
    await prisma.$transaction(
      input.rates.map((r) =>
        prisma.insuranceRate.upsert({
          where: { insuranceType_employeeCategory_effectiveDate: { insuranceType: r.type, employeeCategory: 'VN', effectiveDate: input.effectiveDate } },
          update: { employeeRate: String(r.employeeRate), companyRate: String(r.companyRate), capBase: r.capBase, capMultiplier: r.capMultiplier },
          create: {
            insuranceType: r.type,
            employeeCategory: 'VN',
            employeeRate: String(r.employeeRate),
            companyRate: String(r.companyRate),
            capBase: r.capBase,
            capMultiplier: r.capMultiplier,
            effectiveDate: input.effectiveDate,
          },
        }),
      ),
    );
  },

  async addBrackets(input: z.infer<typeof bracketsSchema>) {
    await assertNotInLockedPeriod(input.effectiveDate);
    const b = input.brackets;
    // Bậc liên tục: bắt đầu từ 0, bậc sau bắt đầu đúng chỗ bậc trước kết thúc, chỉ bậc cuối không giới hạn.
    if (b[0].from !== 0) throw new ValidationError('Bậc 1 phải bắt đầu từ 0');
    for (let i = 0; i < b.length; i++) {
      const last = i === b.length - 1;
      if (last !== (b[i].to === null)) throw new ValidationError('Chỉ bậc cuối cùng không có mức "đến"');
      if (!last && b[i].to! <= b[i].from) throw new ValidationError(`Bậc ${i + 1}: mức "đến" phải lớn hơn mức "từ"`);
      if (i > 0 && b[i].from !== b[i - 1].to) throw new ValidationError(`Bậc ${i + 1} phải bắt đầu từ ${b[i - 1].to}`);
      if (i > 0 && b[i].rate <= b[i - 1].rate) throw new ValidationError('Thuế suất phải tăng dần theo bậc');
    }
    const quick = quickDeductions(b);
    const data = b.map((x, i) => {
      const quickDeduction = quick[i];
      return {
        scheduleCode: `PIT_${formatDate(input.effectiveDate)}`,
        bracketNo: i + 1,
        fromAmount: String(x.from),
        toAmount: x.to === null ? null : String(x.to),
        rate: String(x.rate),
        quickDeduction: quickDeduction.toString(),
        effectiveDate: input.effectiveDate,
      };
    });
    await prisma.$transaction([
      prisma.taxBracket.deleteMany({ where: { effectiveDate: input.effectiveDate } }),
      prisma.taxBracket.createMany({ data }),
    ]);
  },
};
