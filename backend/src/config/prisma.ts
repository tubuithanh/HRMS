import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { auditExtension, setAuditClient } from '../common/audit/audit';

/**
 * Một instance PrismaClient dùng chung cho toàn ứng dụng.
 * Tạo nhiều instance sẽ mở quá nhiều kết nối tới PostgreSQL.
 */
const base = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

// Client gốc dùng để ghi nhật ký; client dùng trong ứng dụng có gắn extension
// ghi lại thay đổi dữ liệu (xem common/audit/audit.ts).
setAuditClient(base);
export const prisma = base.$extends(auditExtension(base));

/** Kiểu client bên trong prisma.$transaction(async (tx) => ...) — dùng thay Prisma.TransactionClient. */
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
