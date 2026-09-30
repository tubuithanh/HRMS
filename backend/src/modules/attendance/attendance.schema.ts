import { z } from 'zod';

export const monthQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng phải có dạng YYYY-MM'),
  employmentId: z.string().uuid().optional(),
});

export const upsertRecordSchema = z
  .object({
    employmentId: z.string().uuid(),
    workDate: z.coerce.date(),
    status: z.enum(['PRESENT', 'LATE', 'REMOTE', 'ABSENT', 'LEAVE', 'HOLIDAY']),
    checkIn: z.coerce.date().nullable().optional(),
    checkOut: z.coerce.date().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => !v.checkIn || !v.checkOut || v.checkOut > v.checkIn, {
    message: 'Giờ ra phải sau giờ vào',
    path: ['checkOut'],
  });

export type UpsertRecordInput = z.infer<typeof upsertRecordSchema>;
