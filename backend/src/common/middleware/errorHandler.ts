import { NextFunction, Request, Response } from 'express';
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
