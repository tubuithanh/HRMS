import { z } from 'zod';

const stage = z.enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']);

export const createOpeningSchema = z.object({
  code: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  orgStructureId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  openDate: z.coerce.date(),
  closeDate: z.coerce.date().optional(),
});

export const updateOpeningSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  orgStructureId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  closeDate: z.coerce.date().nullable().optional(),
});

export const createApplicationSchema = z.object({
  jobOpeningId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(150),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  source: z.string().max(100).optional(),
  cvUrl: z.string().url().optional(),
  note: z.string().max(2000).optional(),
});

/** Chuyển vòng / chấm điểm / hẹn phỏng vấn. Không dùng để chuyển sang HIRED. */
export const updateApplicationSchema = z.object({
  stage: stage.exclude(['HIRED']).optional(),
  interviewAt: z.coerce.date().nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

/** Nhận việc: tạo hồ sơ nhân sự từ ứng viên. */
export const hireSchema = z.object({
  personCode: z.string().trim().min(1).max(50),
});

export type CreateOpeningInput = z.infer<typeof createOpeningSchema>;
export type UpdateOpeningInput = z.infer<typeof updateOpeningSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
