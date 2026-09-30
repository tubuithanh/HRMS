import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { requireRole } from '../../common/middleware/auth';
import { env } from '../../config/env';
import { sendMail } from '../../common/mailer';
import {
  bracketsSchema,
  insuranceSchema,
  legalService,
  loadLegalParams,
  parameterSchema,
} from '../payroll/legal.service';
import { companySchema, getCompany, getSettings, updateCompany, updateSettings } from './settings.service';

/** Cấu hình hệ thống. Đọc phần chung: mọi tài khoản; xem/sửa đầy đủ: ADMIN. */
const router = Router();

/** GET /api/settings/public — thông số giao diện cần (giờ làm, vùng mặc định...). */
router.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    res.json({ data: { attendance: s.attendance, payroll: s.payroll, approval: s.approval } });
  }),
);

router.use(requireRole('ADMIN'));

/** GET /api/settings — toàn bộ cấu hình, thông tin công ty, tham số pháp lý (chỉ xem), trạng thái email. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [settings, company, current] = await Promise.all([getSettings(), getCompany(), loadLegalParams(new Date())]);
    res.json({
      data: {
        settings,
        company: { name: company.name, taxCode: company.taxCode, address: company.address },
        legal: {
          personalDeduction: current.personalDeduction.toString(),
          dependantDeduction: current.dependantDeduction.toString(),
          baseSalary: current.baseSalary.toString(),
          minWageRegion: Object.fromEntries(Object.entries(current.minWageRegion).map(([k, v]) => [k, v.toString()])),
          pitBrackets: current.pitBrackets.map((b) => ({ from: b.from.toString(), to: b.to?.toString() ?? null, rate: b.rate.toString() })),
          insurance: current.insuranceRates.map((r) => ({
            type: r.type,
            employeeRate: r.employeeRate.toString(),
            companyRate: r.companyRate.toString(),
            cap: `${r.capMultiplier} × ${r.capBase === 'BASE_SALARY' ? 'lương cơ sở' : 'lương tối thiểu vùng'}`,
          })),
        },
        mail: { configured: !!env.SMTP_HOST, host: env.SMTP_HOST ?? null, from: env.SMTP_FROM, appUrl: env.APP_URL },
      },
    });
  }),
);

/** PUT /api/settings — cập nhật một hoặc nhiều nhóm cấu hình. */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = z.record(z.unknown()).parse(req.body);
    res.json({ data: await updateSettings(body) });
  }),
);

/** PUT /api/settings/company — thông tin công ty (in trên phiếu lương, báo cáo). */
router.put(
  '/company',
  asyncHandler(async (req, res) => {
    res.json({ data: await updateCompany(companySchema.parse(req.body)) });
  }),
);

// ---------- Tham số pháp lý theo ngày hiệu lực ----------
router.get(
  '/legal',
  asyncHandler(async (_req, res) => {
    res.json({ data: await legalService.overview() });
  }),
);

router.post(
  '/legal/parameters',
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await legalService.addParameter(parameterSchema.parse(req.body)) });
  }),
);

router.delete(
  '/legal/parameters/:id',
  asyncHandler(async (req, res) => {
    await legalService.removeParameter(req.params.id);
    res.json({ data: { deleted: true } });
  }),
);

router.post(
  '/legal/insurance',
  asyncHandler(async (req, res) => {
    await legalService.addInsurance(insuranceSchema.parse(req.body));
    res.status(201).json({ data: { saved: true } });
  }),
);

router.post(
  '/legal/brackets',
  asyncHandler(async (req, res) => {
    await legalService.addBrackets(bracketsSchema.parse(req.body));
    res.status(201).json({ data: { saved: true } });
  }),
);

/** POST /api/settings/test-email — gửi email thử để kiểm tra cấu hình SMTP. */
router.post(
  '/test-email',
  asyncHandler(async (req, res) => {
    const { to } = z.object({ to: z.string().email('Email không hợp lệ') }).parse(req.body);
    await sendMail(to, 'Email thử từ ATECH HRM', 'Nếu bạn nhận được email này, cấu hình gửi email của hệ thống đã hoạt động.');
    res.json({ data: { sent: true, configured: !!env.SMTP_HOST } });
  }),
);

export default router;
