import { NextFunction, Request, Response } from 'express';

/**
 * Bọc một route handler async để mọi lỗi (kể cả Promise bị reject)
 * được chuyển tới middleware xử lý lỗi, thay vì làm sập tiến trình.
 *
 * Dùng: router.get('/', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler =
  (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
