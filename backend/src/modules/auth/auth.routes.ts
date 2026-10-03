import { NextFunction, Request, Response, Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { ForbiddenError, requireAuth, requirePermission, requireRole } from '../../common/middleware/auth';
import { groupSchema, permissionGroupService, updateGroupSchema } from './permission-group.service';
import { prisma } from '../../config/prisma';
import {
  changePasswordSchema,
  createUserSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  resetWithTokenSchema,
  updateUserSchema,
} from './auth.schema';
import { authService } from './auth.service';
import { RateLimiter } from './security.logic';
import { AppError } from '../../common/errors/AppError';

const router = Router();

// Chống dò mật khẩu: tối đa 20 lần đăng nhập / 15 phút / IP; 5 lần quên mật khẩu / giờ / IP.
const loginLimiter = new RateLimiter(20, 15 * 60_000);
const forgotLimiter = new RateLimiter(5, 60 * 60_000);
const limit = (limiter: RateLimiter) => (req: Request, _res: Response, next: NextFunction) => {
  if (limiter.hit(req.ip ?? 'unknown')) return next();
  next(new AppError('Bạn thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.', 429, 'TOO_MANY_REQUESTS'));
};

/** POST /api/auth/login — trả về { token, user }. */
router.post(
  '/login',
  limit(loginLimiter),
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    res.json({ data: await authService.login(username, password) });
  }),
);

/** GET /api/auth/me — thông tin tài khoản đang đăng nhập. */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ data: await authService.me(req.user!.id) });
  }),
);

/** POST /api/auth/change-password — tự đổi mật khẩu; trả token mới (phiên cũ bị vô hiệu). */
router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    res.json({ data: await authService.changePassword(req.user!.id, input.currentPassword, input.newPassword) });
  }),
);

/** POST /api/auth/forgot-password — gửi link đặt lại mật khẩu qua email. */
router.post(
  '/forgot-password',
  limit(forgotLimiter),
  asyncHandler(async (req, res) => {
    const { username } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(username);
    res.json({ data: { message: 'Nếu tài khoản tồn tại và có email, link đặt lại mật khẩu đã được gửi.' } });
  }),
);

/** POST /api/auth/reset-password — đặt mật khẩu mới bằng token trong email. */
router.post(
  '/reset-password',
  limit(forgotLimiter),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = resetWithTokenSchema.parse(req.body);
    await authService.resetWithToken(token, newPassword);
    res.status(204).end();
  }),
);

// ----- Quản lý tài khoản: chỉ ADMIN -----
// Tài khoản: theo quyền "users". Người không phải ADMIN không được tạo / sửa tài khoản ADMIN hay cấp vai trò ADMIN.
router.use('/users', requireAuth, (req, res, next) =>
  requirePermission(...(req.method === 'GET' ? (['users:read', 'users:write'] as const) : (['users:write'] as const)))(req, res, next),
);
router.use('/users', (req: Request, _res: Response, next: NextFunction) => {
  if (req.method === 'GET' || req.user!.role === 'ADMIN') return next();
  if (req.body?.role === 'ADMIN') return next(new ForbiddenError('Chỉ quản trị được cấp vai trò Quản trị'));
  const id = req.path.split('/')[1];
  if (!id) return next();
  prisma.user
    .findUnique({ where: { id }, select: { role: true } })
    .then((u) => next(u?.role === 'ADMIN' ? new ForbiddenError('Chỉ quản trị được sửa tài khoản Quản trị') : undefined))
    .catch(() => next());
});

// ---------- Nhóm quyền: chỉ ADMIN chỉnh ----------
router.use('/permission-groups', requireAuth, requireRole('ADMIN'));
router.get(
  '/permission-groups',
  asyncHandler(async (_req, res) => {
    res.json({ data: await permissionGroupService.list() });
  }),
);
router.post(
  '/permission-groups',
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await permissionGroupService.create(groupSchema.parse(req.body)) });
  }),
);
router.patch(
  '/permission-groups/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await permissionGroupService.update(req.params.id, updateGroupSchema.parse(req.body)) });
  }),
);
router.post(
  '/permission-groups/:id/reset',
  asyncHandler(async (req, res) => {
    res.json({ data: await permissionGroupService.resetSystem(req.params.id) });
  }),
);
router.delete(
  '/permission-groups/:id',
  asyncHandler(async (req, res) => {
    await permissionGroupService.remove(req.params.id);
    res.status(204).end();
  }),
);

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    res.json({ data: await authService.listUsers() });
  }),
);

router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const input = createUserSchema.parse(req.body);
    res.status(201).json({ data: await authService.createUser(input) });
  }),
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const input = updateUserSchema.parse(req.body);
    res.json({ data: await authService.updateUser(req.params.id, input) });
  }),
);

router.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const { newPassword } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(req.params.id, newPassword);
    res.status(204).end();
  }),
);

router.post(
  '/users/:id/unlock',
  asyncHandler(async (req, res) => {
    await authService.unlock(req.params.id);
    res.status(204).end();
  }),
);

export default router;
