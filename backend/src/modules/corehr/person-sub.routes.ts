import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { personSubService as svc } from './person-sub.service';
import {
  certificateSchema,
  dependantSchema,
  documentSchema,
  educationSchema,
  experienceSchema,
  relativeSchema,
  residenceCardSchema,
  skillSchema,
  updatePersonSchema,
  workPermitSchema,
} from './person-sub.schema';

const router = Router();

// ----- Sửa / xóa nhân sự -----
router.patch(
  '/persons/:id',
  asyncHandler(async (req, res) => {
    const input = updatePersonSchema.parse(req.body);
    res.json({ data: await svc.updatePerson(req.params.id, input) });
  }),
);

router.delete(
  '/persons/:id',
  asyncHandler(async (req, res) => {
    await svc.deletePerson(req.params.id);
    res.json({ data: { deleted: true } });
  }),
);

// ----- Cảnh báo hết hạn giấy tờ (đặt trước route có param) -----
router.get(
  '/expiring-documents',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 60;
    const companyId = req.query.companyId as string | undefined;
    res.json({ data: await svc.expiringDocuments(days, companyId) });
  }),
);

/**
 * Đăng ký một nhóm route con của person theo mẫu chung:
 *   GET    /persons/:id/<path>
 *   POST   /persons/:id/<path>
 *   DELETE /persons/:id/<path>/:subId
 */
function subResource(
  path: string,
  schema: { parse: (v: unknown) => unknown },
  list: (personId: string) => Promise<unknown>,
  add: (personId: string, data: Record<string, unknown>) => Promise<unknown>,
  remove: (personId: string, subId: string) => Promise<unknown>,
) {
  router.get(
    `/persons/:id/${path}`,
    asyncHandler(async (req, res) => {
      res.json({ data: await list(req.params.id) });
    }),
  );
  router.post(
    `/persons/:id/${path}`,
    asyncHandler(async (req, res) => {
      const input = schema.parse(req.body) as Record<string, unknown>;
      res.status(201).json({ data: await add(req.params.id, input) });
    }),
  );
  router.delete(
    `/persons/:id/${path}/:subId`,
    asyncHandler(async (req, res) => {
      await remove(req.params.id, req.params.subId);
      res.json({ data: { deleted: true } });
    }),
  );
}

subResource('relatives', relativeSchema, svc.listRelatives, svc.addRelative, svc.removeRelative);
subResource('dependants', dependantSchema, svc.listDependants, svc.addDependant, svc.removeDependant);
subResource('educations', educationSchema, svc.listEducations, svc.addEducation, svc.removeEducation);
subResource('certificates', certificateSchema, svc.listCertificates, svc.addCertificate, svc.removeCertificate);
subResource('experiences', experienceSchema, svc.listExperiences, svc.addExperience, svc.removeExperience);
subResource('skills', skillSchema, svc.listSkills, svc.addSkill, svc.removeSkill);
subResource('documents', documentSchema, svc.listDocuments, svc.addDocument, svc.removeDocument);
subResource('work-permits', workPermitSchema, svc.listWorkPermits, svc.addWorkPermit, svc.removeWorkPermit);
subResource('residence-cards', residenceCardSchema, svc.listResidenceCards, svc.addResidenceCard, svc.removeResidenceCard);

export default router;
