import { jobsState, runDailyJobs } from '../jobs/daily';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { requirePermission } from '../../common/middleware/auth';
import { env } from '../../config/env';
import { loadMailConfig, mailFrom, mailHost, mailMode, sendMailOrThrow } from '../../common/mailer';
import { mailConfigSchema, mailConfigService } from './mail-config';
import { AppError } from '../../common/errors/AppError';
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

/** GET /api/settings/mail/oauth/callback — Google chuyển về sau khi cho phép; lưu refresh token rồi quay lại trang Cấu hình. */
export const mailOAuthCallback = Router().get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z.object({ state: z.string().optional(), code: z.string().optional(), error: z.string().optional() }).parse(req.query);
    res.redirect(await mailConfigService.finishGmailAuth(q));
  }),
);

/** GET /api/settings/public — thông số giao diện cần (giờ làm, vùng mặc định...). */
router.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    // Không lộ IP / toạ độ văn phòng — chỉ cho biết có cần gửi vị trí không.
    res.json({ data: { attendance: s.attendance, payroll: s.payroll, approval: s.approval, checkin: { mode: s.checkin.mode } } });
  }),
);

router.use((req, res, next) =>
  requirePermission(...(req.method === 'GET' ? (['settings:read', 'settings:write'] as const) : (['settings:write'] as const)))(req, res, next),
);

/** GET /api/settings — toàn bộ cấu hình, thông tin công ty, tham số pháp lý (chỉ xem), trạng thái email. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [settings, company, current, mc] = await Promise.all([getSettings(), getCompany(), loadLegalParams(new Date()), loadMailConfig()]);
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
        mail: { configured: mailMode(mc) !== 'log', mode: mailMode(mc), host: mailHost(mc), from: mailFrom(mc), appUrl: env.APP_URL, source: mc.source },
        /** IP của người đang xem (sau proxy) — để điền nhanh IP văn phòng. */
        clientIp: req.ip ?? null,
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

// ---------- Cấu hình gửi email (Gmail OAuth2 / SMTP) ----------
router.get(
  '/mail',
  asyncHandler(async (req, res) => {
    res.json({ data: await mailConfigService.view(req) });
  }),
);
router.put(
  '/mail',
  asyncHandler(async (req, res) => {
    await mailConfigService.update(mailConfigSchema.parse(req.body));
    res.json({ data: await mailConfigService.view(req) });
  }),
);
/** POST /api/settings/mail/oauth/start — trả đường dẫn đăng nhập Google để cấp quyền gửi email. */
router.post(
  '/mail/oauth/start',
  asyncHandler(async (req, res) => {
    res.json({ data: await mailConfigService.startGmailAuth(req, req.user!.id) });
  }),
);
router.post(
  '/mail/oauth/disconnect',
  asyncHandler(async (req, res) => {
    await mailConfigService.disconnectGmail();
    res.json({ data: await mailConfigService.view(req) });
  }),
);

/** POST /api/settings/test-email — gửi email thử để kiểm tra cấu hình SMTP. */
router.post(
  '/test-email',
  asyncHandler(async (req, res) => {
    const { to } = z.object({ to: z.string().email('Email không hợp lệ') }).parse(req.body);
    try {
      const { mode } = await sendMailOrThrow(to, 'Email thử từ ATECH HRM', 'Nếu bạn nhận được email này, cấu hình gửi email của hệ thống đã hoạt động.');
      res.json({ data: { sent: mode !== 'log', mode, configured: mode !== 'log' } });
    } catch (e) {
      // Báo đúng lỗi (sai refresh token, bị chặn cổng SMTP…) thay vì báo đã gửi.
      throw new AppError(`Gửi thất bại: ${e instanceof Error ? e.message : String(e)}`, 502, 'MAIL_FAILED');
    }
  }),
);

// ---------- Nhắc việc hằng ngày ----------
/** GET /api/settings/jobs — lần chạy gần nhất. POST /api/settings/jobs/daily — chạy ngay (bỏ qua giờ / trạng thái). */
router.get(
  '/jobs',
  asyncHandler(async (_req, res) => {
    res.json({ data: { state: await jobsState(), cronEnabled: !!env.CRON_SECRET } });
  }),
);
router.post(
  '/jobs/daily',
  asyncHandler(async (_req, res) => {
    res.json({ data: await runDailyJobs({ force: true }) });
  }),
);

export default router;
