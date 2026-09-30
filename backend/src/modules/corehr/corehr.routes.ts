import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import orgRoutes from './org.routes';
import catalogRoutes from './catalog.routes';
import personSubRoutes from './person-sub.routes';
import {
  assignSchema,
  createEmploymentSchema,
  createPersonSchema,
  createPositionSchema,
} from './corehr.schema';
import { coreHrService } from './corehr.service';

const router = Router();

// ----- Person -----
router.get(
  '/persons',
  asyncHandler(async (_req, res) => {
    res.json({ data: await coreHrService.listPersons() });
  }),
);

router.post(
  '/persons',
  asyncHandler(async (req, res) => {
    const input = createPersonSchema.parse(req.body);
    res.status(201).json({ data: await coreHrService.createPerson(input) });
  }),
);

router.get(
  '/persons/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await coreHrService.getPerson(req.params.id) });
  }),
);

// ----- Employment -----
router.post(
  '/employments',
  asyncHandler(async (req, res) => {
    const input = createEmploymentSchema.parse(req.body);
    res.status(201).json({ data: await coreHrService.createEmployment(input) });
  }),
);

router.get(
  '/employments/:id/assignments',
  asyncHandler(async (req, res) => {
    res.json({ data: await coreHrService.getAssignments(req.params.id) });
  }),
);

// ----- Position -----
router.post(
  '/positions',
  asyncHandler(async (req, res) => {
    const input = createPositionSchema.parse(req.body);
    res.status(201).json({ data: await coreHrService.createPosition(input) });
  }),
);

// ----- Assignment (gán/đổi vị trí) -----
router.post(
  '/assignments',
  asyncHandler(async (req, res) => {
    const input = assignSchema.parse(req.body);
    res.status(201).json({ data: await coreHrService.assign(input) });
  }),
);

// ----- Danh mục, hợp đồng, lương cơ bản, hồ sơ thuế -----
router.use('/', catalogRoutes);

// ----- Cây tổ chức -----
router.use('/org', orgRoutes);

// ----- Hồ sơ mở rộng, người thân, lao động nước ngoài, cảnh báo -----
router.use('/', personSubRoutes);

export default router;
