import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { checklistService as svc, OWNERS, templateSchema } from './checklist.service';

/** Danh sách việc khi tiếp nhận / cho nghỉ việc — quản lý (nhân sự). Người thực hiện đánh dấu qua /api/me/tasks. */
const router = Router();

router.get('/owners', (_req, res) => res.json({ data: OWNERS }));
router.get('/templates', asyncHandler(async (_req, res) => res.json({ data: await svc.listTemplates() })));
router.post('/templates', asyncHandler(async (req, res) => res.status(201).json({ data: await svc.saveTemplate(null, templateSchema.parse(req.body)) })));
router.put('/templates/:id', asyncHandler(async (req, res) => res.json({ data: await svc.saveTemplate(req.params.id, templateSchema.parse(req.body)) })));
router.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    await svc.removeTemplate(req.params.id);
    res.json({ data: { ok: true } });
  }),
);
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z.object({ kind: z.string().optional(), status: z.string().optional() }).parse(req.query);
    res.json({ data: await svc.list(q) });
  }),
);
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = z
      .object({ employmentId: z.string().uuid(), kind: z.enum(['ONBOARDING', 'OFFBOARDING']), startDate: z.coerce.date(), templateId: z.string().uuid().optional() })
      .parse(req.body);
    res.status(201).json({ data: await svc.start(b.employmentId, b.kind, b.startDate, b.templateId) });
  }),
);
router.get('/:id', asyncHandler(async (req, res) => res.json({ data: await svc.get(req.params.id, req.user!) })));
router.post(
  '/:id/tasks',
  asyncHandler(async (req, res) => {
    const b = z.object({ title: z.string().trim().min(1).max(200), owner: z.enum(Object.keys(OWNERS) as [keyof typeof OWNERS]), dueDate: z.coerce.date().optional() }).parse(req.body);
    res.status(201).json({ data: await svc.addTask(req.params.id, b) });
  }),
);
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await svc.remove(req.params.id);
    res.json({ data: { ok: true } });
  }),
);

export default router;
