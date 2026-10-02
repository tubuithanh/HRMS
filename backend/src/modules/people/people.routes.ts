import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { rewardSchema, rewardService } from './reward.service';
import { courseSchema, participantSchema, trainingService } from './training.service';
import { cycleSchema, managerSchema, reviewService } from './review.service';
import { DISCIPLINE_FORMS, RATING_LABEL, REWARD_FORMS } from './people.logic';

/** Quản lý con người: khen thưởng – kỷ luật, đào tạo, đánh giá hiệu suất. Nhân sự ghi, kế toán xem. */
const router = Router();

router.get('/catalog', (_req, res) => {
  res.json({ data: { rewardForms: REWARD_FORMS, disciplineForms: DISCIPLINE_FORMS, ratings: RATING_LABEL } });
});

// ---------- Khen thưởng – kỷ luật ----------
router.get(
  '/rewards',
  asyncHandler(async (req, res) => {
    const q = z
      .object({ employmentId: z.string().uuid().optional(), kind: z.enum(['REWARD', 'DISCIPLINE']).optional(), year: z.coerce.number().int().optional() })
      .parse(req.query);
    res.json({ data: await rewardService.list(q) });
  }),
);
router.post(
  '/rewards',
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await rewardService.create(rewardSchema.parse(req.body), req.user?.id) });
  }),
);
router.delete(
  '/rewards/:id',
  asyncHandler(async (req, res) => {
    await rewardService.remove(req.params.id);
    res.json({ data: { ok: true } });
  }),
);

// ---------- Đào tạo ----------
router.get('/trainings', asyncHandler(async (_req, res) => res.json({ data: await trainingService.list() })));
router.get('/trainings/:id', asyncHandler(async (req, res) => res.json({ data: await trainingService.get(req.params.id) })));
router.post('/trainings', asyncHandler(async (req, res) => res.status(201).json({ data: await trainingService.create(courseSchema.parse(req.body)) })));
router.patch(
  '/trainings/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await trainingService.update(req.params.id, courseSchema.innerType().partial().parse(req.body)) });
  }),
);
router.delete(
  '/trainings/:id',
  asyncHandler(async (req, res) => {
    await trainingService.remove(req.params.id);
    res.json({ data: { ok: true } });
  }),
);
router.post(
  '/trainings/:id/participants',
  asyncHandler(async (req, res) => {
    const { employmentIds } = z.object({ employmentIds: z.array(z.string().uuid()).min(1) }).parse(req.body);
    res.json({ data: await trainingService.addParticipants(req.params.id, employmentIds) });
  }),
);
router.patch(
  '/participants/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await trainingService.updateParticipant(req.params.id, participantSchema.parse(req.body)) });
  }),
);
router.delete(
  '/participants/:id',
  asyncHandler(async (req, res) => {
    await trainingService.removeParticipant(req.params.id);
    res.json({ data: { ok: true } });
  }),
);
router.get(
  '/employments/:id/trainings',
  asyncHandler(async (req, res) => res.json({ data: await trainingService.history(req.params.id) })),
);
/** GET /api/people/employments/:id/training-refunds?date= — bồi hoàn đào tạo nếu nghỉ vào ngày đó. */
router.get(
  '/employments/:id/training-refunds',
  asyncHandler(async (req, res) => {
    const date = z.coerce.date().parse(req.query.date);
    res.json({ data: await trainingService.refundsOnLeave(req.params.id, date) });
  }),
);

// ---------- Đánh giá hiệu suất ----------
router.get('/review-cycles', asyncHandler(async (_req, res) => res.json({ data: await reviewService.listCycles() })));
router.get('/review-cycles/:id', asyncHandler(async (req, res) => res.json({ data: await reviewService.getCycle(req.params.id) })));
router.post('/review-cycles', asyncHandler(async (req, res) => res.status(201).json({ data: await reviewService.createCycle(cycleSchema.parse(req.body)) })));
router.post(
  '/review-cycles/:id/close',
  asyncHandler(async (req, res) => {
    res.json({ data: await reviewService.closeCycle(req.params.id, z.object({ close: z.boolean() }).parse(req.body).close) });
  }),
);
router.delete(
  '/review-cycles/:id',
  asyncHandler(async (req, res) => {
    await reviewService.removeCycle(req.params.id);
    res.json({ data: { ok: true } });
  }),
);
router.get('/reviews/:id', asyncHandler(async (req, res) => res.json({ data: await reviewService.get(req.params.id, req.user!) })));
router.post('/reviews/:id/reopen', asyncHandler(async (req, res) => res.json({ data: await reviewService.reopen(req.params.id) })));
/** Nhân sự chấm thay khi người được đánh giá không có quản lý trực tiếp. */
router.put(
  '/reviews/:id/manager',
  asyncHandler(async (req, res) => {
    res.json({ data: await reviewService.saveManager(req.params.id, req.user!, managerSchema.parse(req.body)) });
  }),
);

export default router;
