import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import {
  createEmployeeElementSchema,
  createPayElementSchema,
  createPeriodElementSchema,
  endEmployeeElementSchema,
  updatePayElementSchema,
} from './elements.schema';
import { elementsService as svc } from './elements.service';

/** Khoản lương: danh mục, khoản cố định của nhân viên, khoản phát sinh trong kỳ. */
const router = Router();

// ----- Danh mục -----
router.get(
  '/elements',
  asyncHandler(async (_req, res) => {
    res.json({ data: await svc.listElements() });
  }),
);

router.post(
  '/elements',
  asyncHandler(async (req, res) => {
    const input = createPayElementSchema.parse(req.body);
    res.status(201).json({ data: await svc.createElement(input) });
  }),
);

router.patch(
  '/elements/:id',
  asyncHandler(async (req, res) => {
    const input = updatePayElementSchema.parse(req.body);
    res.json({ data: await svc.updateElement(req.params.id, input) });
  }),
);

// ----- Khoản cố định của nhân viên -----
router.get(
  '/employments/:employmentId/elements',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listEmployeeElements(req.params.employmentId) });
  }),
);

router.post(
  '/employments/:employmentId/elements',
  asyncHandler(async (req, res) => {
    const input = createEmployeeElementSchema.parse(req.body);
    res
      .status(201)
      .json({ data: await svc.addEmployeeElement(req.params.employmentId, input) });
  }),
);

router.post(
  '/employments/:employmentId/elements/:id/end',
  asyncHandler(async (req, res) => {
    const { endDate } = endEmployeeElementSchema.parse(req.body);
    res.json({
      data: await svc.endEmployeeElement(req.params.employmentId, req.params.id, endDate),
    });
  }),
);

// ----- Khoản phát sinh trong kỳ -----
router.get(
  '/periods/:id/elements',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listPeriodElements(req.params.id) });
  }),
);

router.post(
  '/periods/:id/elements',
  asyncHandler(async (req, res) => {
    const input = createPeriodElementSchema.parse(req.body);
    res.status(201).json({ data: await svc.addPeriodElement(req.params.id, input) });
  }),
);

router.delete(
  '/periods/:id/elements/:elementId',
  asyncHandler(async (req, res) => {
    await svc.removePeriodElement(req.params.id, req.params.elementId);
    res.json({ data: { deleted: true } });
  }),
);

export default router;
