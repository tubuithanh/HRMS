import { Response, Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { reportsService as svc } from './reports.service';
import { issueSchema, pitCertificateService as certs } from './pit-certificate';
import { bankTemplatesSchema, getBankTemplates, saveBankTemplates } from './bank-templates';

/** Báo cáo định kỳ: BHXH (D02-LT), thuế TNCN (05/KK, 05/QTT), file chuyển lương. Thêm ?format=xlsx để tải Excel. */
const router = Router();

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng dạng YYYY-MM (01–12)');
const wantsXlsx = (q: unknown) => (q as { format?: string }).format === 'xlsx';

function sendXlsx(res: Response, file: { buffer: Buffer; filename: string }) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
}

/** GET /api/reports/insurance-changes?month=2026-09 — lao động tăng / giảm / điều chỉnh BHXH. */
router.get(
  '/insurance-changes',
  asyncHandler(async (req, res) => {
    const m = month.parse(req.query.month);
    if (wantsXlsx(req.query)) sendXlsx(res, await svc.insuranceChangesXlsx(m));
    else res.json({ data: await svc.insuranceChanges(m) });
  }),
);

/** GET /api/reports/pit-declaration?period=2026-09 | 2026-Q3 — tờ khai 05/KK-TNCN. */
router.get(
  '/pit-declaration',
  asyncHandler(async (req, res) => {
    const p = z.string().min(1).parse(req.query.period);
    if (wantsXlsx(req.query)) sendXlsx(res, await svc.pitDeclarationXlsx(p));
    else res.json({ data: await svc.pitDeclaration(p) });
  }),
);

/** GET /api/reports/pit-annual?year=2026 — quyết toán thuế TNCN năm (05/QTT, phụ lục 05-1, 05-2). */
router.get(
  '/pit-annual',
  asyncHandler(async (req, res) => {
    const y = z.coerce.number().int().min(2000).max(2100).parse(req.query.year);
    if (wantsXlsx(req.query)) sendXlsx(res, await svc.pitAnnualXlsx(y));
    else res.json({ data: await svc.pitAnnual(y) });
  }),
);

/** GET /api/reports/bank-transfer?periodId=…&sourceBank=VCB — file chuyển lương. */
router.get(
  '/bank-transfer',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        periodId: z.string().uuid(),
        sourceBank: z.string().max(20).optional(),
        templateId: z.string().max(40).optional(),
        part: z.enum(['same', 'other']).optional(),
        format: z.string().optional(),
      })
      .parse(req.query);
    if (q.format === 'file') {
      const f = await svc.bankTransferFile(q.periodId, q.sourceBank, q.templateId, q.part);
      res.setHeader('Content-Type', f.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
      res.send(f.buffer);
    } else res.json({ data: await svc.bankTransfer(q.periodId, q.sourceBank) });
  }),
);

// ---------- Chứng từ khấu trừ thuế TNCN ----------
router.get(
  '/pit-certificates',
  asyncHandler(async (req, res) => {
    const year = z.coerce.number().int().parse(req.query.year);
    res.json({ data: await certs.list({ year }) });
  }),
);

/** POST /api/reports/pit-certificates — lập chứng từ cho mọi người bị khấu trừ trong khoảng tháng. */
router.post(
  '/pit-certificates',
  asyncHandler(async (req, res) => {
    res.json({ data: await certs.issue(issueSchema.parse(req.body), req.user?.id) });
  }),
);

router.delete(
  '/pit-certificates/:id',
  asyncHandler(async (req, res) => {
    await certs.remove(req.params.id);
    res.json({ data: { ok: true } });
  }),
);

/** GET /api/reports/pit-certificates/pdf?ids=a,b,c — in nhiều chứng từ trong một file. */
router.get(
  '/pit-certificates/pdf',
  asyncHandler(async (req, res) => {
    // ids=a,b,c hoặc year=2026 (in tất cả chứng từ của năm).
    const ids = typeof req.query.ids === 'string' && req.query.ids
      ? req.query.ids.split(',').filter(Boolean)
      : (await certs.list({ year: z.coerce.number().int().parse(req.query.year) })).map((c) => c.id);
    const pdf = await certs.pdf(ids);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="chung-tu-khau-tru-TNCN.pdf"');
    res.send(pdf);
  }),
);

// ---------- Mẫu file chuyển lương ----------
router.get(
  '/bank-templates',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getBankTemplates() });
  }),
);

router.put(
  '/bank-templates',
  asyncHandler(async (req, res) => {
    res.json({ data: await saveBankTemplates(bankTemplatesSchema.parse(req.body)) });
  }),
);

export default router;
