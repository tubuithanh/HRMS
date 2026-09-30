import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { calcPayroll } from './payroll.calc';
import { payrollService } from './payroll.service';
import { loadLegalParams } from './legal.service';
import { netToGross } from './net-to-gross';
import { calcFinalSettlement } from './final-settlement';
import { aggregateElements, PayElementLine } from './pay-element';
import { calcThirteenthMonth } from './thirteenth-month';
import { advanceService } from './advance.service';
import elementsRoutes from './elements.routes';
import { buildPayslip, payslipToHtml } from './payslip';
import { sendPayslipPdf } from './payslip.pdf';
import { buildPayrollReportXlsx, PayrollReportRow } from './payroll.report';

const router = Router();

// Khoản lương: danh mục, khoản cố định, khoản phát sinh trong kỳ
router.use('/', elementsRoutes);

const previewSchema = z.object({
  taxableEarnings: z.array(z.number().nonnegative()).min(1),
  nonTaxableEarnings: z.array(z.number().nonnegative()).optional(),
  insuranceSalary: z.number().nonnegative(),
  region: z.number().int().min(1).max(4),
  dependantCount: z.number().int().min(0),
  taxMethod: z.enum(['PROGRESSIVE', 'FLAT_10', 'FLAT_20']),
});

/**
 * POST /api/payroll/preview
 * Tính thử lương cho một bộ tham số, không lưu database.
 * Hữu ích để kiểm tra công thức và cho màn hình tính thử.
 */
router.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const input = previewSchema.parse(req.body);
    const result = calcPayroll({ ...input, legal: await loadLegalParams(new Date()) });
    // Chuyển Decimal sang chuỗi để trả JSON không mất độ chính xác.
    res.json({
      data: {
        grossIncome: result.grossIncome.toFixed(),
        taxableIncome: result.taxableIncome.toFixed(),
        insuranceBase: result.insuranceBase.toFixed(),
        empInsurance: result.empInsurance.toFixed(),
        companyInsurance: result.companyInsurance.toFixed(),
        selfDeduction: result.selfDeduction.toFixed(),
        dependantCount: result.dependantCount,
        dependantDeduction: result.dependantDeduction.toFixed(),
        assessableIncome: result.assessableIncome.toFixed(),
        pitAmount: result.pitAmount.toFixed(),
        netPay: result.netPay.toFixed(),
      },
    });
  }),
);

// ---------- Kỳ lương ----------
const createPeriodSchema = z.object({
  code: z.string().min(1),
  periodType: z.string().optional(),
  dateStart: z.coerce.date(),
  dateEnd: z.coerce.date(),
  payDate: z.coerce.date().optional(),
});

router.get(
  '/periods',
  asyncHandler(async (_req, res) => {
    res.json({ data: await payrollService.listPeriods() });
  }),
);

router.post(
  '/periods',
  asyncHandler(async (req, res) => {
    const input = createPeriodSchema.parse(req.body);
    res.status(201).json({ data: await payrollService.createPeriod(input) });
  }),
);

router.get(
  '/periods/:id/results',
  asyncHandler(async (req, res) => {
    res.json({ data: await payrollService.getPeriodResults(req.params.id) });
  }),
);

// ---------- Chạy tính lương ----------
const runSchema = z.object({
  payPeriodId: z.string().uuid(),
  region: z.number().int().min(1).max(4),
  employmentIds: z.array(z.string().uuid()).optional(),
});

router.post(
  '/run',
  asyncHandler(async (req, res) => {
    const input = runSchema.parse(req.body);
    res.json({ data: await payrollService.run(input) });
  }),
);

router.post(
  '/periods/:id/lock',
  asyncHandler(async (req, res) => {
    res.json({ data: await payrollService.lockPeriod(req.params.id) });
  }),
);

// ---------- Quy đổi Net -> Gross ----------
const netToGrossSchema = z.object({
  targetNet: z.number().positive(),
  region: z.number().int().min(1).max(4),
  dependantCount: z.number().int().min(0),
  fixedInsuranceSalary: z.number().nonnegative().optional(),
});

router.post(
  '/net-to-gross',
  asyncHandler(async (req, res) => {
    const input = netToGrossSchema.parse(req.body);
    const r = netToGross({ ...input, legal: await loadLegalParams(new Date()) });
    res.json({
      data: {
        gross: r.gross.toFixed(),
        achievedNet: r.achievedNet.toFixed(),
        iterations: r.iterations,
      },
    });
  }),
);

// ---------- Thanh toán khi nghỉ việc ----------
const settlementSchema = z.object({
  totalWorkedMonths: z.number().int().min(0),
  unemploymentInsuredMonths: z.number().int().min(0),
  avgSalary6Months: z.number().nonnegative(),
  unusedLeaveDays: z.number().min(0),
  standardDaysPerMonth: z.number().positive().optional(),
  isRedundancy: z.boolean().optional(),
});

router.post(
  '/final-settlement',
  asyncHandler(async (req, res) => {
    const input = settlementSchema.parse(req.body);
    const r = calcFinalSettlement(input);
    res.json({
      data: {
        severanceYears: r.severanceYears.toFixed(),
        severanceAmount: r.severanceAmount.toFixed(),
        unusedLeaveAmount: r.unusedLeaveAmount.toFixed(),
        total: r.total.toFixed(),
      },
    });
  }),
);

// ---------- Tính lương từ danh sách pay element ----------
const elementLineSchema = z.object({
  code: z.string(),
  name: z.string(),
  type: z.enum(['EARNING', 'DEDUCTION']),
  amount: z.number(),
  isInsuranceBase: z.boolean().optional(),
  taxTreatment: z.enum(['TAXABLE', 'PARTIAL_EXEMPT', 'EXEMPT']).optional(),
  taxExemptLimit: z.number().optional(),
});

const elementPreviewSchema = z.object({
  lines: z.array(elementLineSchema).min(1),
  region: z.number().int().min(1).max(4),
  dependantCount: z.number().int().min(0),
  taxMethod: z.enum(['PROGRESSIVE', 'FLAT_10', 'FLAT_20']).default('PROGRESSIVE'),
});

router.post(
  '/preview-elements',
  asyncHandler(async (req, res) => {
    const input = elementPreviewSchema.parse(req.body);
    const agg = aggregateElements(input.lines as PayElementLine[]);
    const result = calcPayroll({
      taxableEarnings: [agg.taxableEarnings],
      nonTaxableEarnings: [agg.nonTaxableEarnings],
      insuranceSalary: agg.insuranceBase,
      region: input.region,
      dependantCount: input.dependantCount,
      taxMethod: input.taxMethod,
      otherDeductions: agg.otherDeductions,
      legal: await loadLegalParams(new Date()),
    });
    res.json({
      data: {
        aggregated: {
          taxableEarnings: agg.taxableEarnings.toFixed(),
          nonTaxableEarnings: agg.nonTaxableEarnings.toFixed(),
          insuranceBase: agg.insuranceBase.toFixed(),
          otherDeductions: agg.otherDeductions.toFixed(),
        },
        grossIncome: result.grossIncome.toFixed(),
        empInsurance: result.empInsurance.toFixed(),
        pitAmount: result.pitAmount.toFixed(),
        appliedOtherDeductions: result.appliedOtherDeductions.toFixed(),
        deferredDeduction: result.deferredDeduction.toFixed(),
        netPay: result.netPay.toFixed(),
      },
    });
  }),
);

// ---------- Lương tháng 13 ----------
const thirteenthSchema = z.object({
  monthlySalary: z.number().nonnegative(),
  monthsWorked: z.number().int().min(0).max(12),
});

router.post(
  '/thirteenth-month',
  asyncHandler(async (req, res) => {
    const input = thirteenthSchema.parse(req.body);
    const amount = calcThirteenthMonth(input.monthlySalary, input.monthsWorked);
    res.json({ data: { amount: amount.toFixed() } });
  }),
);

// ---------- Tạm ứng ----------
const createAdvanceSchema = z.object({
  employmentId: z.string().uuid(),
  requestDate: z.coerce.date(),
  amount: z.number().positive(),
  reason: z.string().optional(),
  installments: z.number().int().min(1),
});

router.post(
  '/advances',
  asyncHandler(async (req, res) => {
    const input = createAdvanceSchema.parse(req.body);
    res.status(201).json({ data: await advanceService.create(input) });
  }),
);

router.get(
  '/advances/:employmentId',
  asyncHandler(async (req, res) => {
    res.json({ data: await advanceService.list(req.params.employmentId) });
  }),
);

// ---------- Phiếu lương ----------
const payslipSchema = z.object({
  employeeName: z.string(),
  employeeCode: z.string(),
  periodCode: z.string(),
  grossIncome: z.number(),
  empInsurance: z.number(),
  companyInsurance: z.number(),
  pitAmount: z.number(),
  otherDeductions: z.number().optional(),
  netPay: z.number(),
});

router.post(
  '/payslip',
  asyncHandler(async (req, res) => {
    const input = payslipSchema.parse(req.body);
    const data = buildPayslip(input);
    // Trả cả dữ liệu có cấu trúc lẫn HTML để xem trước.
    res.json({ data: { payslip: data, html: payslipToHtml(data) } });
  }),
);

// Phiếu lương PDF (tải file)
router.post(
  '/payslip/pdf',
  asyncHandler(async (req, res) => {
    const input = payslipSchema.parse(req.body);
    const data = buildPayslip(input);
    await sendPayslipPdf(res, data);
  }),
);

/** GET /api/payroll/results/:id/payslip — phiếu lương chi tiết (JSON, để xem trên web). */
router.get(
  '/results/:id/payslip',
  asyncHandler(async (req, res) => {
    res.json({ data: await payrollService.payslipForResult(req.params.id) });
  }),
);

/** GET /api/payroll/results/:id/payslip.pdf — phiếu lương từ kết quả đã lưu. */
router.get(
  '/results/:id/payslip.pdf',
  asyncHandler(async (req, res) => {
    const data = await payrollService.payslipForResult(req.params.id);
    await sendPayslipPdf(res, data);
  }),
);

// ---------- Báo cáo bảng lương (Excel) ----------
router.get(
  '/periods/:id/report',
  asyncHandler(async (req, res) => {
    const period = await payrollService.getPeriodResults(req.params.id);
    const rows: PayrollReportRow[] = period.results.map(
      (r: (typeof period.results)[number]) => ({
        employeeCode: r.employment.person.personCode,
        employeeName: r.employment.person.fullName,
        grossIncome: Number(r.grossIncome),
        empInsurance: Number(r.empInsurance),
        companyInsurance: Number(r.companyInsurance),
        pitAmount: Number(r.pitAmount),
        netPay: Number(r.netPay),
      }),
    );
    const xlsx = await buildPayrollReportXlsx(period.code, rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bang-luong-${period.code}.xlsx"`,
    );
    res.send(xlsx);
  }),
);

export default router;
