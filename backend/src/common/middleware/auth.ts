import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { prisma } from '../../config/prisma';
import { setAuditUser } from '../audit/audit';
import { AuthUser, verifyToken } from '../../modules/auth/token';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Chưa đăng nhập hoặc phiên đã hết hạn') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Bạn không có quyền thực hiện thao tác này') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Bắt buộc đăng nhập. Đọc header `Authorization: Bearer <token>`,
 * rồi đọc lại tài khoản từ database để tài khoản bị khoá hoặc đổi vai trò
 * có hiệu lực ngay, không phải chờ token hết hạn. Gắn kết quả vào `req.user`.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new UnauthorizedError());

  let userId: string;
  let issuedAt: Date;
  try {
    ({ id: userId, issuedAt } = verifyToken(header.slice('Bearer '.length)));
  } catch {
    return next(new UnauthorizedError());
  }

  prisma.user
    .findUnique({ where: { id: userId } })
    .then((user) => {
      if (!user || !user.isActive) return next(new UnauthorizedError());
      // Token cấp trước lần đổi mật khẩu gần nhất → đăng nhập lại.
      // (iat của JWT làm tròn xuống giây nên cho sai lệch 1 giây.)
      if (user.passwordChangedAt && issuedAt.getTime() + 1000 <= user.passwordChangedAt.getTime()) {
        return next(new UnauthorizedError('Mật khẩu đã thay đổi, vui lòng đăng nhập lại'));
      }
      // Chưa đổi mật khẩu bắt buộc: chỉ được xem thông tin mình và đổi mật khẩu.
      const path = req.originalUrl.split('?')[0];
      if (user.mustChangePassword && !['/api/auth/me', '/api/auth/change-password'].includes(path)) {
        return next(new AppError('Bạn cần đổi mật khẩu trước khi tiếp tục', 403, 'PASSWORD_CHANGE_REQUIRED'));
      }
      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        personId: user.personId,
      };
      setAuditUser(user.id, user.username);
      next();
    })
    .catch(next);
}

/**
 * Chỉ cho phép các vai trò được liệt kê. ADMIN luôn được phép.
 * Đặt sau requireAuth.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (req.user.role === 'ADMIN' || roles.includes(req.user.role)) {
      return next();
    }
    next(new ForbiddenError());
  };
}
