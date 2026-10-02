import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password';

/**
 * Đặt lại mật khẩu tài khoản admin (khi quên mật khẩu hoặc seed đã tạo admin với mật khẩu khác).
 * Mật khẩu lấy từ SEED_ADMIN_PASSWORD; mở khoá tài khoản và bắt đổi mật khẩu ở lần đăng nhập kế tiếp.
 *   npm run reset:admin
 */
const prisma = new PrismaClient();

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Cần SEED_ADMIN_PASSWORD (ít nhất 8 ký tự)');
  }
  const now = new Date();
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash: await hashPassword(password),
      isActive: true,
      failedLoginCount: 0,
      lockedUntil: null,
      mustChangePassword: true,
      passwordChangedAt: now,
    },
    create: {
      username: 'admin',
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
      mustChangePassword: true,
    },
  });
  console.log('✅ Đã đặt lại mật khẩu admin và mở khoá tài khoản.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
