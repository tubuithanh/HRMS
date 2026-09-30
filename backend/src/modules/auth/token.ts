import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../../config/env';

/** Thông tin người dùng gắn vào mỗi request đã đăng nhập. */
export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  personId: string | null;
}

/** expiresInHours: thời hạn phiên (cấu hình hệ thống); không truyền thì dùng JWT_EXPIRES_IN. */
export function signToken(user: AuthUser, expiresInHours?: number): string {
  return jwt.sign(
    { username: user.username, role: user.role, personId: user.personId },
    env.JWT_SECRET,
    {
      subject: user.id,
      expiresIn: (expiresInHours ? `${expiresInHours}h` : env.JWT_EXPIRES_IN) as SignOptions['expiresIn'],
    },
  );
}

/** Giải mã token. Ném lỗi nếu token sai chữ ký hoặc đã hết hạn. */
export function verifyToken(token: string): AuthUser & { issuedAt: Date } {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  return {
    id: payload.sub as string,
    username: payload.username,
    role: payload.role,
    personId: payload.personId ?? null,
    issuedAt: new Date((payload.iat ?? 0) * 1000),
  };
}
