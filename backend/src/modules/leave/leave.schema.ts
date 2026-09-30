import { z } from 'zod';

export const createLeaveTypeSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  isPaid: z.boolean().optional(),
  daysPerYear: z.number().min(0).max(366).nullable().optional(),
  seniorityBonus: z.boolean().optional(),
  carryOverMaxDays: z.number().min(0).max(30).nullable().optional(),
  carryOverUntilMonth: z.number().int().min(1).max(12).nullable().optional(),
});

export const updateLeaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isPaid: z.boolean().optional(),
  daysPerYear: z.number().min(0).max(366).nullable().optional(),
  isActive: z.boolean().optional(),
  seniorityBonus: z.boolean().optional(),
  carryOverMaxDays: z.number().min(0).max(30).nullable().optional(),
  carryOverUntilMonth: z.number().int().min(1).max(12).nullable().optional(),
});

/** Đơn nghỉ do nhân viên tự tạo (không có employmentId). */
export const selfLeaveRequestSchema = z.object({
  leaveTypeId: z.string().uuid(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  isHalfDay: z.boolean().optional(),
  /** Nghỉ nửa ngày buổi nào (mặc định buổi sáng). */
  halfDayPart: z.enum(['MORNING', 'AFTERNOON']).optional(),
  reason: z.string().trim().max(500).optional(),
});

/** Đơn nghỉ do nhân sự tạo hộ. */
export const leaveRequestSchema = selfLeaveRequestSchema.extend({
  employmentId: z.string().uuid(),
});

export const reviewLeaveSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;
export type SelfLeaveRequestInput = z.infer<typeof selfLeaveRequestSchema>;
