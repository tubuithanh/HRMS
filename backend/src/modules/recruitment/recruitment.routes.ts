import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import {
  createApplicationSchema,
  createOpeningSchema,
  hireSchema,
  updateApplicationSchema,
  updateOpeningSchema,
} from './recruitment.schema';
import { recruitmentService as svc } from './recruitment.service';

const router = Router();

// ----- Tin tuyển dụng -----
router.get(
  '/openings',
  asyncHandler(async (_req, res) => {
    res.json({ data: await svc.listOpenings() });
  }),
);

router.post(
  '/openings',
  asyncHandler(async (req, res) => {
    const input = createOpeningSchema.parse(req.body);
    res.status(201).json({ data: await svc.createOpening(input) });
  }),
);

router.patch(
  '/openings/:id',
  asyncHandler(async (req, res) => {
    const input = updateOpeningSchema.parse(req.body);
    res.json({ data: await svc.updateOpening(req.params.id, input) });
  }),
);

router.delete(
  '/openings/:id',
  asyncHandler(async (req, res) => {
    await svc.deleteOpening(req.params.id);
    res.json({ data: { deleted: true } });
  }),
);

// ----- Hồ sơ ứng tuyển -----
router.get(
  '/applications',
  asyncHandler(async (req, res) => {
    const jobOpeningId = req.query.jobOpeningId as string | undefined;
    res.json({ data: await svc.listApplications(jobOpeningId) });
  }),
);

router.post(
  '/applications',
  asyncHandler(async (req, res) => {
    const input = createApplicationSchema.parse(req.body);
    res.status(201).json({ data: await svc.createApplication(input) });
  }),
);

router.patch(
  '/applications/:id',
  asyncHandler(async (req, res) => {
    const input = updateApplicationSchema.parse(req.body);
    res.json({ data: await svc.updateApplication(req.params.id, input) });
  }),
);

router.delete(
  '/applications/:id',
  asyncHandler(async (req, res) => {
    await svc.deleteApplication(req.params.id);
    res.json({ data: { deleted: true } });
  }),
);

/** POST /api/recruitment/applications/:id/hire — nhận việc, tạo hồ sơ nhân sự. */
router.post(
  '/applications/:id/hire',
  asyncHandler(async (req, res) => {
    const { personCode } = hireSchema.parse(req.body);
    res.json({ data: await svc.hire(req.params.id, personCode) });
  }),
);

export default router;
