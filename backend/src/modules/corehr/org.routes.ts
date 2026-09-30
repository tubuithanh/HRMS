import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { createOrgSchema, updateOrgSchema } from './org.schema';
import { orgService } from './org.service';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.query.companyId as string | undefined;
    res.json({ data: await orgService.list(companyId) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createOrgSchema.parse(req.body);
    res.status(201).json({ data: await orgService.create(input) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateOrgSchema.parse(req.body);
    res.json({ data: await orgService.update(req.params.id, input) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await orgService.remove(req.params.id);
    res.json({ data: { deleted: true } });
  }),
);

export default router;
