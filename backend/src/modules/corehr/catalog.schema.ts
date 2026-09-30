import { z } from 'zod';

export const createJobSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  jobFamily: z.string().max(100).optional(),
  isHazardous: z.boolean().optional(),
  maxProbationDays: z.number().int().min(0).max(180).optional(),
});

/** Đổi trạng thái hợp đồng: hết thử việc, tạm hoãn, nghỉ việc... */
export const updateEmploymentSchema = z
  .object({
    status: z
      .enum(['UPCOMING', 'PROBATION', 'ACTIVE', 'SUSPENDED', 'TERMINATED'])
      .optional(),
    dateTerminate: z.coerce.date().nullable().optional(),
    codeAttendance: z.string().max(50).nullable().optional(),
  })
  .refine((v) => v.status !== 'TERMINATED' || v.dateTerminate, {
    message: 'Nghỉ việc phải có ngày nghỉ việc',
    path: ['dateTerminate'],
  });

/** Lương cơ bản mới, có hiệu lực từ effectiveDate (tự đóng dòng cũ). */
export const createSalarySchema = z.object({
  salaryType: z.enum(['GROSS', 'NET']).optional(),
  baseAmount: z.number().positive(),
  insuranceSalary: z.number().positive().optional(),
  effectiveDate: z.coerce.date(),
});

export const createTaxProfileSchema = z.object({
  taxResidentStatus: z.enum(['RESIDENT', 'NON_RESIDENT']).optional(),
  taxMethod: z.enum(['PROGRESSIVE', 'FLAT_10', 'FLAT_20']),
  hasCommitment08: z.boolean().optional(),
  effectiveDate: z.coerce.date(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateEmploymentInput = z.infer<typeof updateEmploymentSchema>;
export type CreateSalaryInput = z.infer<typeof createSalarySchema>;
export type CreateTaxProfileInput = z.infer<typeof createTaxProfileSchema>;
