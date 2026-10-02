import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { auditExtension, setAuditClient } from '../common/audit/audit';

/**
 * Một instance PrismaClient dùng chung cho toàn ứng dụng.
 * Tạo nhiều instance sẽ mở quá nhiều kết nối tới PostgreSQL.
 */
const base = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  // Mặc định Prisma huỷ giao dịch sau 5 giây — quá ngắn khi database ở xa (Neon, ~0,25 giây mỗi truy vấn)
  // và thao tác ghi nhiều dòng (khen thưởng tập thể, gán ca, mở kỳ đánh giá, cho nghỉ việc…).
  transactionOptions: { maxWait: 10_000, timeout: 60_000 },
});

// Client gốc dùng để ghi nhật ký; client dùng trong ứng dụng có gắn extension
// ghi lại thay đổi dữ liệu (xem common/audit/audit.ts).
setAuditClient(base);
export const prisma = base.$extends(auditExtension(base));

/** Kiểu client bên trong prisma.$transaction(async (tx) => ...) — dùng thay Prisma.TransactionClient. */
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
