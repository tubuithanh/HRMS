import { z } from 'zod';

const taxTreatment = z.enum(['TAXABLE', 'PARTIAL_EXEMPT', 'EXEMPT']);

export const createPayElementSchema = z
  .object({
    code: z.string().trim().min(1).max(30),
    name: z.string().trim().min(1).max(100),
    type: z.enum(['EARNING', 'DEDUCTION']),
    taxTreatment: taxTreatment.optional(),
    taxExemptLimit: z.number().nonnegative().optional(),
    isInsuranceBase: z.boolean().optional(),
    isProrated: z.boolean().optional(),
  })
  .refine((v) => v.taxTreatment !== 'PARTIAL_EXEMPT' || v.taxExemptLimit !== undefined, {
    message: 'Miễn thuế một phần cần có mức miễn thuế',
    path: ['taxExemptLimit'],
  });

export const updatePayElementSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  taxTreatment: taxTreatment.optional(),
  taxExemptLimit: z.number().nonnegative().nullable().optional(),
  isInsuranceBase: z.boolean().optional(),
  isProrated: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/** Khoản cố định mới của nhân viên, có hiệu lực từ effectiveDate. */
export const createEmployeeElementSchema = z.object({
  payElementId: z.string().uuid(),
  amount: z.number().positive(),
  effectiveDate: z.coerce.date(),
});

/** Kết thúc một khoản cố định (không xoá để giữ lịch sử). */
export const endEmployeeElementSchema = z.object({
  endDate: z.coerce.date(),
});

export const createPeriodElementSchema = z.object({
  employmentId: z.string().uuid(),
  payElementId: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().trim().max(500).optional(),
});

export type CreatePayElementInput = z.infer<typeof createPayElementSchema>;
export type UpdatePayElementInput = z.infer<typeof updatePayElementSchema>;
export type CreateEmployeeElementInput = z.infer<typeof createEmployeeElementSchema>;
export type CreatePeriodElementInput = z.infer<typeof createPeriodElementSchema>;
