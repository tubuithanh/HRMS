import { createHash, randomBytes } from 'crypto';
import { Prisma, User } from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  AppError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/AppError';
import { UnauthorizedError } from '../../common/middleware/auth';
import { hashPassword, verifyPassword } from './password';
import { signToken } from './token';
import { logAuth } from '../../common/audit/audit';
import { sendMail } from '../../common/mailer';
import { env } from '../../config/env';
import { afterFailedLogin, isLocked, passwordProblem } from './security.logic';
import { getSettings } from '../settings/settings.service';
import { CreateUserInput, UpdateUserInput } from './auth.schema';

const personSummary = {
  select: { id: true, personCode: true, fullName: true },
} as const;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Mật khẩu mới phải đủ mạnh; ném lỗi 422 nếu không. */
function assertStrongPassword(password: string, username: string) {
  const problem = passwordProblem(password, username);
  if (problem) throw new AppError(problem, 422, 'WEAK_PASSWORD');
}

const hhmm = (d: Date) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** Bỏ passwordHash trước khi trả ra ngoài API. */
function toPublic<T extends User>(user: T): Omit<T, 'passwordHash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}

/** Không để hệ thống rơi vào trạng thái không còn ADMIN nào hoạt động. */
async function assertNotLastAdmin(userId: string) {
  const otherAdmins = await prisma.user.count({
    where: { role: 'ADMIN', isActive: true, id: { not: userId } },
  });
  if (otherAdmins === 0) {
    throw new AppError(
      'Phải còn ít nhất một tài khoản ADMIN đang hoạt động',
      400,
      'LAST_ADMIN',
    );
  }
}

async function assertPersonExists(personId: string) {
  const person = await prisma.person.findFirst({
    where: { id: personId, isDelete: false },
  });
  if (!person) throw new NotFoundError('Không tìm thấy nhân sự để gắn tài khoản');
}

function rethrowUnique(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw new ConflictError(
      'Tên đăng nhập đã tồn tại hoặc nhân sự đã có tài khoản',
    );
  }
  throw e;
}

export const authService = {
  async login(username: string, password: string) {
    const now = new Date();
    const { security } = await getSettings();
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    if (user && isLocked(user, now)) {
      await logAuth('LOGIN_FAILED', user.username, user.id);
      throw new AppError(
        `Tài khoản tạm khoá đến ${hhmm(user.lockedUntil!)} do nhập sai mật khẩu nhiều lần. Liên hệ quản trị để mở sớm hơn.`,
        423,
        'ACCOUNT_LOCKED',
      );
    }
    // Cùng một thông báo cho mọi trường hợp để không lộ tài khoản nào tồn tại.
    const ok = user && user.isActive && (await verifyPassword(password, user.passwordHash));
    if (!ok) {
      if (user) {
        const next = afterFailedLogin(user, now, security.maxFailedLogins, security.lockMinutes);
        await prisma.user.update({ where: { id: user.id }, data: next });
      }
      await logAuth('LOGIN_FAILED', username.toLowerCase(), user?.id ?? null);
      throw new UnauthorizedError('Sai tên đăng nhập hoặc mật khẩu');
    }
    await logAuth('LOGIN', user.username, user.id);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now, failedLoginCount: 0, lockedUntil: null },
    });
    return { token: signToken(updated, security.sessionHours), user: toPublic(updated) };
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { person: personSummary },
    });
    if (!user) throw new NotFoundError();
    return toPublic(user);
  },

  /** Tự đổi mật khẩu. Trả về token mới vì các phiên cũ bị vô hiệu. */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError('Mật khẩu hiện tại không đúng', 400, 'WRONG_PASSWORD');
    }
    assertStrongPassword(newPassword, user.username);
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new AppError('Mật khẩu mới phải khác mật khẩu hiện tại', 422, 'SAME_PASSWORD');
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    return { token: signToken(updated, (await getSettings()).security.sessionHours) };
  },

  /**
   * Quên mật khẩu: gửi link đặt lại tới email của nhân sự gắn với tài khoản.
   * Luôn "thành công" để không lộ tài khoản nào tồn tại.
   */
  async forgotPassword(username: string) {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: { person: { select: { email: true, fullName: true } } },
    });
    const email = user?.person?.email;
    if (!user || !user.isActive || !email) return;
    const token = randomBytes(32).toString('base64url');
    const minutes = (await getSettings()).security.resetTokenMinutes;
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + minutes * 60_000) },
    });
    const link = `${env.APP_URL}/reset-password?token=${token}`;
    await sendMail(
      email,
      'Đặt lại mật khẩu ATECH HRM',
      `Chào ${user.person!.fullName},\n\nCó yêu cầu đặt lại mật khẩu cho tài khoản ${user.username}.\n` +
        `Mở link sau trong ${minutes} phút để đặt mật khẩu mới (chỉ dùng được một lần):\n${link}\n\n` +
        'Nếu bạn không yêu cầu, hãy bỏ qua email này.',
    );
  },

  /** Đặt mật khẩu mới bằng token trong email. */
  async resetWithToken(token: string, newPassword: string) {
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) {
      throw new AppError('Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 400, 'INVALID_RESET_TOKEN');
    }
    assertStrongPassword(newPassword, row.user.username);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      // Vô hiệu mọi link còn lại của tài khoản này.
      prisma.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
  },

  // ----- Quản lý tài khoản (ADMIN) -----

  async listUsers() {
    const users = await prisma.user.findMany({
      orderBy: { username: 'asc' },
      include: { person: personSummary },
    });
    return users.map(toPublic);
  },

  async createUser(input: CreateUserInput) {
    assertStrongPassword(input.password, input.username);
    if (input.personId) await assertPersonExists(input.personId);
    try {
      const user = await prisma.user.create({
        data: {
          username: input.username,
          passwordHash: await hashPassword(input.password),
          role: input.role,
          personId: input.personId,
          mustChangePassword: input.mustChangePassword ?? true,
        },
      });
      return toPublic(user);
    } catch (e) {
      rethrowUnique(e);
    }
  },

  async updateUser(id: string, input: UpdateUserInput) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('Không tìm thấy tài khoản');
    const losesAdmin =
      user.role === 'ADMIN' &&
      ((input.role !== undefined && input.role !== 'ADMIN') ||
        input.isActive === false);
    if (losesAdmin) await assertNotLastAdmin(id);
    if (input.personId) await assertPersonExists(input.personId);
    try {
      return toPublic(await prisma.user.update({ where: { id }, data: input }));
    } catch (e) {
      rethrowUnique(e);
    }
  },

  async resetPassword(id: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('Không tìm thấy tài khoản');
    assertStrongPassword(newPassword, user.username);
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(newPassword),
        // Mật khẩu do quản trị đặt: người dùng phải đổi khi đăng nhập.
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  },

  async unlock(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('Không tìm thấy tài khoản');
    await prisma.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
  },
};
