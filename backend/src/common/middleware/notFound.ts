import { Request, Response } from 'express';

/** Trả về 404 cho mọi route không khớp. */
export function notFound(req: Request, res: Response) {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Không tìm thấy đường dẫn: ${req.method} ${req.originalUrl}`,
    },
  });
}
