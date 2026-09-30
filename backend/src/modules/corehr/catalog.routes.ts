import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import {
  createJobSchema,
  createSalarySchema,
  createTaxProfileSchema,
  updateEmploymentSchema,
} from './catalog.schema';
import { catalogService as svc } from './catalog.service';
import { offboardingService, offboardSchema, previewQuery } from './offboarding.service';
import {
  contractService,
  createContractSchema,
  terminateContractSchema,
} from './contract.service';

const listEmploymentsQuery = z.object({
  status: z.enum(['UPCOMING', 'PROBATION', 'ACTIVE', 'SUSPENDED', 'TERMINATED']).optional(),
  companyId: z.string().uuid().optional(),
});

/**
 * Danh mục (công ty, chức danh, vị trí) và quản lý hợp đồng lao động:
 * trạng thái, lương cơ bản, hồ sơ thuế.
 */
const router = Router();

router.get(
  '/companies',
  asyncHandler(async (_req, res) => {
    res.json({ data: await svc.listCompanies() });
  }),
);

router.get(
  '/jobs',
  asyncHandler(async (_req, res) => {
    res.json({ data: await svc.listJobs() });
  }),
);

router.post(
  '/jobs',
  asyncHandler(async (req, res) => {
    const input = createJobSchema.parse(req.body);
    res.status(201).json({ data: await svc.createJob(input) });
  }),
);

router.get(
  '/positions',
  asyncHandler(async (req, res) => {
    const orgStructureId = req.query.orgStructureId as string | undefined;
    res.json({ data: await svc.listPositions(orgStructureId) });
  }),
);

router.get(
  '/employments',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listEmployments(listEmploymentsQuery.parse(req.query)) });
  }),
);

router.get(
  '/employments/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getEmployment(req.params.id) });
  }),
);

router.patch(
  '/employments/:id',
  asyncHandler(async (req, res) => {
    const input = updateEmploymentSchema.parse(req.body);
    res.json({ data: await svc.updateEmployment(req.params.id, input) });
  }),
);

router.post(
  '/employments/:id/salaries',
  asyncHandler(async (req, res) => {
    const input = createSalarySchema.parse(req.body);
    res.status(201).json({ data: await svc.addSalary(req.params.id, input) });
  }),
);

router.post(
  '/employments/:id/tax-profiles',
  asyncHandler(async (req, res) => {
    const input = createTaxProfileSchema.parse(req.body);
    res
      .status(201)
      .json({ data: await svc.addTaxProfile(req.params.id, input) });
  }),
);

// ---------- Nghỉ việc ----------
/** GET /employments/:id/offboarding-preview?date=&type= — số liệu quyết toán gợi ý. */
router.get(
  '/employments/:id/offboarding-preview',
  asyncHandler(async (req, res) => {
    res.json({ data: await offboardingService.preview(req.params.id, previewQuery.parse(req.query)) });
  }),
);

/** POST /employments/:id/offboard — cho nghỉ việc (một giao dịch). */
router.post(
  '/employments/:id/offboard',
  asyncHandler(async (req, res) => {
    res.json({ data: await offboardingService.offboard(req.params.id, offboardSchema.parse(req.body)) });
  }),
);

// ---------- Hợp đồng lao động (văn bản) ----------
router.get(
  '/contracts/expiring',
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    res.json({ data: await contractService.expiring(days) });
  }),
);

router.get(
  '/employments/:id/contracts',
  asyncHandler(async (req, res) => {
    res.json({ data: await contractService.list(req.params.id) });
  }),
);

router.post(
  '/employments/:id/contracts',
  asyncHandler(async (req, res) => {
    const input = createContractSchema.parse(req.body);
    res.status(201).json({ data: await contractService.create(req.params.id, input) });
  }),
);

router.post(
  '/contracts/:id/terminate',
  asyncHandler(async (req, res) => {
    const { terminatedDate, terminateReason } = terminateContractSchema.parse(req.body);
    res.json({ data: await contractService.terminate(req.params.id, terminatedDate, terminateReason) });
  }),
);

router.delete(
  '/contracts/:id',
  asyncHandler(async (req, res) => {
    await contractService.remove(req.params.id);
    res.json({ data: { deleted: true } });
  }),
);

export default router;
