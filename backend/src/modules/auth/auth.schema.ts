import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
  .max(128);

const role = z.enum(['ADMIN', 'HR', 'ACCOUNTANT', 'EMPLOYEE']);

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, 'Tên đăng nhập 3–50 ký tự: a-z, 0-9, . _ -'),
  password,
  role,
  personId: z.string().uuid().optional(),
  /** Bắt đổi mật khẩu ở lần đăng nhập đầu (mặc định có). */
  mustChangePassword: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  role: role.optional(),
  personId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  /** Phạm vi dữ liệu: danh sách đơn vị; rỗng = toàn công ty. */
  orgScope: z.array(z.string().uuid()).max(50).optional(),
});

export const resetPasswordSchema = z.object({ newPassword: password });

export const forgotPasswordSchema = z.object({ username: z.string().trim().min(1).max(100) });

export const resetWithTokenSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: password,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
