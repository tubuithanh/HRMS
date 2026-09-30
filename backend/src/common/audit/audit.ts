import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { currentContext, PendingChange, requestContext } from './context';

/**
 * NHẬT KÝ THAO TÁC
 *
 * 1. Mỗi request ghi dữ liệu (POST/PUT/PATCH/DELETE) → 1 dòng REQUEST:
 *    ai, lúc nào, IP, API nào, mã kết quả, nội dung gửi lên (đã che mật khẩu/file).
 * 2. Mỗi thay đổi trên các bảng quan trọng → 1 dòng CHANGE với giá trị trước/sau
 *    (Prisma extension, bắt cả thay đổi qua import, chạy lương...).
 * 3. Đăng nhập thành công / thất bại → dòng AUTH.
 *
 * Dòng REQUEST và CHANGE chỉ được lưu khi request thành công (mã < 400): nếu
 * giao dịch bị huỷ, không để lại nhật ký sai.
 */

/** Bảng được theo dõi thay đổi chi tiết (tên model Prisma → tên bảng hiển thị). */
export const AUDITED_MODELS: Record<string, string> = {
  Person: 'person',
  Employment: 'employment',
  Assignment: 'assignment',
  EmployeeSalary: 'employee_salary',
  EmployeeTaxProfile: 'employee_tax_profile',
  EmployeeElement: 'employee_element',
  PeriodElement: 'period_element',
  PayPeriod: 'pay_period',
  PayElement: 'pay_element',
  Advance: 'advance',
  LaborContract: 'labor_contract',
  Dependant: 'dependant',
  LeaveRequest: 'leave_request',
  LeaveType: 'leave_type',
  OvertimeRequest: 'overtime_request',
  AttendanceRecord: 'attendance_record',
  Holiday: 'holiday',
  OrgStructure: 'org_structure',
  Position: 'position',
  Job: 'job',
  User: 'app_user',
  JobOpening: 'job_opening',
  JobApplication: 'job_application',
  SystemSetting: 'system_setting',
  Company: 'company',
  LegalParameter: 'legal_parameter',
  TaxBracket: 'tax_bracket',
  InsuranceRate: 'insurance_rate',
};

const SECRET_KEYS = ['password', 'passwordHash', 'currentPassword', 'newPassword', 'token'];

/** Bỏ mật khẩu, rút gọn chuỗi dài (file base64), đổi Decimal/Date sang chuỗi. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 4) return '…';
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toString();
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 40)}… (${value.length} ký tự)` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.includes(k) ? '***' : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Như sanitize, nhưng ghi rõ trường bí mật (mật khẩu) có bị đổi hay không. */
function markSecretChanges(before: unknown, after: unknown): unknown {
  const out = sanitize(after) as Record<string, unknown> | null;
  if (!out || typeof before !== 'object' || before === null || typeof after !== 'object' || after === null) return out;
  for (const k of SECRET_KEYS) {
    const b = (before as Record<string, unknown>)[k];
    const a = (after as Record<string, unknown>)[k];
    if (a !== undefined && b !== a) out[k] = '*** (đã thay đổi)';
  }
  return out;
}

// ---------- Middleware: mở ngữ cảnh + ghi dòng REQUEST ----------

let db: PrismaClient;
/** Client KHÔNG có extension để ghi nhật ký (tránh tự ghi nhật ký cho chính nó). */
export function setAuditClient(client: PrismaClient) {
  db = client;
}

function clientIp(req: Request) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0] : req.socket.remoteAddress ?? null)?.trim() ?? null;
}

/** Bọc mọi request trong ngữ cảnh nhật ký. Đặt trước các router. */
export function auditContext(req: Request, res: Response, next: NextFunction) {
  const ctx = { requestId: randomUUID(), userId: null, username: null, ip: clientIp(req), changes: [] };
  requestContext.run(ctx, () => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      res.on('finish', () => {
        void flush(req, res.statusCode, ctx).catch((e) => console.error('Ghi nhật ký lỗi:', e));
      });
    }
    next();
  });
}

async function flush(req: Request, status: number, ctx: NonNullable<ReturnType<typeof currentContext>>) {
  if (!db) return;
  // Đăng nhập được ghi riêng (AUTH); request không đăng nhập thì bỏ qua.
  if (!ctx.userId) return;
  if (status >= 400) return;
  const base = { requestId: ctx.requestId, userId: ctx.userId, username: ctx.username, ip: ctx.ip };
  await db.auditLog.createMany({
    data: [
      {
        ...base,
        kind: 'REQUEST',
        action: `${req.method} ${req.originalUrl.split('?')[0]}`,
        status,
        after: sanitize(req.body) as Prisma.InputJsonValue,
      },
      ...ctx.changes.map((c) => ({
        ...base,
        kind: 'CHANGE',
        action: c.action,
        entity: c.entity,
        entityId: c.entityId,
        summary: c.summary ?? null,
        before: (c.before ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        after: (c.after ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      })),
    ],
  });
}

/** Gắn người dùng vào ngữ cảnh (gọi trong requireAuth). */
export function setAuditUser(userId: string, username: string) {
  const ctx = currentContext();
  if (ctx) {
    ctx.userId = userId;
    ctx.username = username;
  }
}

/** Ghi sự kiện đăng nhập ngay (không chờ cuối request). */
export async function logAuth(action: 'LOGIN' | 'LOGIN_FAILED', username: string, userId: string | null) {
  if (!db) return;
  await db.auditLog.create({
    data: { kind: 'AUTH', action, username, userId, ip: currentContext()?.ip ?? null },
  });
}

// ---------- Prisma extension: thu thập thay đổi dữ liệu ----------

type Delegate = { findUnique(args: unknown): Promise<unknown>; findMany(args: unknown): Promise<unknown[]> };

function delegateOf(client: PrismaClient, model: string): Delegate {
  return (client as unknown as Record<string, Delegate>)[model.charAt(0).toLowerCase() + model.slice(1)];
}

const idOf = (row: unknown) => (row && typeof row === 'object' && 'id' in row ? String((row as { id: unknown }).id) : null);

export function auditExtension(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'audit',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ctx = currentContext();
          const entity = model ? AUDITED_MODELS[model] : undefined;
          const writes = ['create', 'update', 'upsert', 'delete', 'updateMany', 'deleteMany', 'createMany'];
          // Chỉ theo dõi khi có người dùng (seed, script chạy tay thì bỏ qua).
          if (!ctx?.userId || !entity || !model || !writes.includes(operation)) return query(args);

          const a = args as { where?: unknown };
          const delegate = delegateOf(base, model);
          let before: unknown = null;
          if ((operation === 'update' || operation === 'delete' || operation === 'upsert') && a.where) {
            before = await delegate.findUnique({ where: a.where }).catch(() => null);
          }
          const result = await query(args);

          const change = (c: Omit<PendingChange, 'entity'>) => ctx.changes.push({ entity, ...c });
          if (operation === 'create') change({ action: 'CREATE', entityId: idOf(result), before: null, after: sanitize(result) });
          else if (operation === 'upsert') change({ action: before ? 'UPDATE' : 'CREATE', entityId: idOf(result), before: sanitize(before), after: sanitize(result) });
          else if (operation === 'update') change({ action: 'UPDATE', entityId: idOf(result), before: sanitize(before), after: markSecretChanges(before, result) });
          else if (operation === 'delete') change({ action: 'DELETE', entityId: idOf(before), before: sanitize(before), after: null });
          else {
            // Thao tác hàng loạt: ghi điều kiện và số dòng.
            const count = (result as { count?: number })?.count ?? null;
            change({
              action: operation === 'deleteMany' ? 'DELETE_MANY' : operation === 'createMany' ? 'CREATE_MANY' : 'UPDATE_MANY',
              entityId: null,
              before: sanitize(a.where ?? null),
              after: sanitize(operation === 'createMany' ? { count } : { ...(args as object), count }),
              summary: `${operation} ${count ?? ''} dòng`,
            });
          }
          return result;
        },
      },
    },
  });
}
