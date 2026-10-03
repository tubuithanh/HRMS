import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { env } from '../../config/env';

/**
 * Middleware xử lý lỗi tập trung. Đặt cuối cùng trong chuỗi middleware.
 * Chuyển mọi loại lỗi thành một cấu trúc JSON nhất quán.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // Lỗi validate từ Zod
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        details: err.flatten().fieldErrors,
      },
    });
  }

  // Lỗi nghiệp vụ đã biết
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Lỗi Prisma đã biết: mã không hợp lệ / không tìm thấy / trùng / đang được tham chiếu
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const map: Record<string, [number, string, string]> = {
      P2023: [404, 'NOT_FOUND', 'Không tìm thấy dữ liệu (mã không hợp lệ)'],
      P2025: [404, 'NOT_FOUND', 'Không tìm thấy dữ liệu'],
      P2002: [409, 'CONFLICT', 'Dữ liệu đã tồn tại'],
      P2003: [409, 'CONFLICT', 'Dữ liệu đang được sử dụng ở nơi khác, không thể xoá / sửa'],
    };
    const m = map[err.code];
    if (m) return res.status(m[0]).json({ error: { code: m[1], message: m[2] } });
  }
  // Mã UUID sai định dạng trong điều kiện truy vấn
  if (err instanceof Prisma.PrismaClientValidationError && /uuid/i.test(err.message)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu (mã không hợp lệ)' } });
  }

  // Lỗi ngoài dự kiến
  console.error('Lỗi không xác định:', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Đã xảy ra lỗi hệ thống',
      // Chỉ lộ chi tiết khi đang phát triển
      details:
        env.NODE_ENV === 'development' && err instanceof Error
          ? err.message
          : undefined,
    },
  });
}
