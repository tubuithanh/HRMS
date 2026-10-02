import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { ASSET_CATEGORIES, ASSET_STATUS, assetSchema, assetService as svc, assignSchema, returnSchema } from './asset.service';

/** Tài sản cấp phát cho nhân viên. */
const router = Router();

router.get('/catalog', (_req, res) => res.json({ data: { categories: ASSET_CATEGORIES, statuses: ASSET_STATUS } }));
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z.object({ status: z.string().optional(), category: z.string().optional(), q: z.string().optional() }).parse(req.query);
    res.json({ data: await svc.list(q) });
  }),
);
router.get('/employments/:id', asyncHandler(async (req, res) => res.json({ data: await svc.byEmployment(req.params.id) })));
router.get('/:id', asyncHandler(async (req, res) => res.json({ data: await svc.get(req.params.id) })));
router.post('/', asyncHandler(async (req, res) => res.status(201).json({ data: await svc.create(assetSchema.parse(req.body)) })));
router.patch('/:id', asyncHandler(async (req, res) => res.json({ data: await svc.update(req.params.id, assetSchema.partial().parse(req.body)) })));
router.post('/:id/assign', asyncHandler(async (req, res) => res.json({ data: await svc.assign(req.params.id, assignSchema.parse(req.body)) })));
router.post(
  '/assignments/:id/return',
  asyncHandler(async (req, res) => res.json({ data: await svc.returnAsset(req.params.id, returnSchema.parse(req.body), req.user?.id) })),
);

export default router;
