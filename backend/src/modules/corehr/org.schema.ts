import { z } from 'zod';

export const createOrgSchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  orgType: z
    .enum(['COMPANY', 'BLOCK', 'DIVISION', 'DEPARTMENT', 'TEAM'])
    .optional(),
  parentId: z.string().uuid().optional(),
  isRoot: z.boolean().optional(),
  effectiveDate: z.coerce.date(),
});

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  orgType: z
    .enum(['COMPANY', 'BLOCK', 'DIVISION', 'DEPARTMENT', 'TEAM'])
    .optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
