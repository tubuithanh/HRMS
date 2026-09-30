import { z } from 'zod';

export const createPersonSchema = z.object({
  personCode: z.string().min(1).max(50),
  fullName: z.string().min(1).max(150),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dateOfBirth: z.coerce.date().optional(),
  idNo: z.string().regex(/^\d{12}$/, 'CCCD phải gồm 12 chữ số').optional(),
  personalTaxCode: z.string().max(20).optional(),
  socialInsNo: z.string().max(20).optional(),
  nationality: z.string().optional(),
  isForeigner: z.boolean().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const createEmploymentSchema = z.object({
  personId: z.string().uuid(),
  companyId: z.string().uuid(),
  codeEmp: z.string().min(1).max(50),
  codeAttendance: z.string().max(50).optional(),
  employmentType: z
    .enum(['EMPLOYEE', 'APPRENTICE', 'SEASONAL', 'CONTRACTOR'])
    .optional(),
  dateHire: z.coerce.date(),
  probationDays: z.number().int().min(0).optional(),
});

export const createPositionSchema = z.object({
  code: z.string().min(1).max(50),
  jobId: z.string().uuid(),
  orgStructureId: z.string().uuid(),
  parentPositionId: z.string().uuid().optional(),
  isKeyPosition: z.boolean().optional(),
  effectiveDate: z.coerce.date(),
});

/** Gán/đổi vị trí công việc — tạo một Assignment mới theo ngày hiệu lực. */
export const assignSchema = z.object({
  employmentId: z.string().uuid(),
  positionId: z.string().uuid(),
  // Không cần truyền: phòng ban được lấy từ chính vị trí (Position).
  // Nếu truyền, phải khớp với phòng ban của vị trí.
  orgStructureId: z.string().uuid().optional(),
  isPrimary: z.boolean().optional(),
  actionType: z
    .enum([
      'HIRE',
      'TRANSFER',
      'PROMOTION',
      'DEMOTION',
      'CONCURRENT',
      'INTER_COMPANY',
      'TERMINATE',
    ])
    .optional(),
  actionReason: z.string().optional(),
  effectiveDate: z.coerce.date(),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type CreateEmploymentInput = z.infer<typeof createEmploymentSchema>;
export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type AssignInput = z.infer<typeof assignSchema>;
