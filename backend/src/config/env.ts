import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Kiểm tra và chuẩn hoá biến môi trường ngay khi khởi động.
 * Nếu thiếu hoặc sai, server dừng ngay thay vì lỗi mơ hồ lúc chạy.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL là bắt buộc'),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim())),
  // Khoá ký JWT. Dùng chuỗi ngẫu nhiên dài, KHÔNG commit giá trị thật.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài ít nhất 32 ký tự'),
  // Thời hạn token, cú pháp của jsonwebtoken: 8h, 1d, 30m...
  JWT_EXPIRES_IN: z.string().default('8h'),
  // Địa chỉ giao diện web, dùng để tạo link đặt lại mật khẩu trong email.
  APP_URL: z.string().url().default('http://localhost:5173'),
  // Gửi email (tuỳ chọn). Không cấu hình thì link đặt lại mật khẩu được in ra log.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('ATECH HRM <no-reply@atech.local>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Cấu hình môi trường không hợp lệ:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
