import { Prisma, PrismaClient } from '@prisma/client';
import { currentContext, requestContext } from '../audit/context';
import { AppError } from '../errors/AppError';

/**
 * PHẠM VI DỮ LIỆU — tài khoản nhân sự / kế toán được gán một số đơn vị (User.orgScope) chỉ thấy và thao tác
 * với nhân viên có vị trí chính thuộc các đơn vị đó (kể cả đơn vị con), cộng với chính mình.
 *
 * Áp ở tầng Prisma (extension) cho mọi truy vấn trong request của tài khoản bị giới hạn:
 * - Đọc model gắn với nhân viên (employmentId / personId): tự thêm điều kiện lọc; mảng lồng nhau có
 *   employmentId cũng được lọc (vd kỳ lương → kết quả lương).
 * - Ghi: tạo / sửa / xoá bản ghi của nhân viên ngoài phạm vi → 403.
 * Việc hệ thống cần toàn bộ dữ liệu (quản lý trực tiếp, nhắc việc hằng ngày) chạy trong withoutScope().
 */

export interface DataScope {
  orgIds: string[];
  employmentIds: Set<string>;
  personIds: Set<string>;
}

/** Model → trường chứa id hợp đồng lao động (employment). */
const EMP_FIELD: Record<string, string> = {
  Employment: 'id',
  Advance: 'employmentId',
  AssetAssignment: 'employmentId',
  Assignment: 'employmentId',
  AttendanceRecord: 'employmentId',
  EmployeeChecklist: 'employmentId',
  EmployeeElement: 'employmentId',
  EmployeeSalary: 'employmentId',
  EmployeeTaxProfile: 'employmentId',
  InsuranceClaim: 'employmentId',
  LaborContract: 'employmentId',
  LeaveRequest: 'employmentId',
  OvertimeRequest: 'employmentId',
  PayrollResult: 'employmentId',
  PerformanceReview: 'employmentId',
  PeriodElement: 'employmentId',
  PitCertificate: 'employmentId',
  RewardDiscipline: 'employmentId',
  ShiftAssignment: 'employmentId',
  ShiftRoster: 'employmentId',
  TrainingParticipant: 'employmentId',
};
/** Model → trường chứa id hồ sơ người (person). */
const PERSON_FIELD: Record<string, string> = {
  Person: 'id',
  Dependant: 'personId',
  Relative: 'personId',
  PersonCertificate: 'personId',
  PersonDocument: 'personId',
  PersonEducation: 'personId',
  PersonExperience: 'personId',
  PersonSkill: 'personId',
  ResidenceCard: 'personId',
  WorkPermit: 'personId',
};

export class OutOfScopeError extends AppError {
  constructor() {
    super('Nhân viên này ngoài phạm vi dữ liệu của bạn', 403, 'OUT_OF_SCOPE');
  }
}

const READ_MANY = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy']);
const READ_UNIQUE = new Set(['findUnique', 'findUniqueOrThrow']);

export const currentScope = (): DataScope | undefined => (currentContext() as { scope?: DataScope } | undefined)?.scope;

/** Chạy fn không giới hạn phạm vi (việc của hệ thống). */
export function withoutScope<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = currentContext();
  if (!ctx || !(ctx as { scope?: DataScope }).scope) return fn();
  return requestContext.run({ ...ctx, scope: undefined } as typeof ctx, fn);
}

/** Gắn phạm vi vào request hiện tại (gọi trong requireAuth). */
export function setRequestScope(scope: DataScope | undefined) {
  const ctx = currentContext();
  if (ctx) (ctx as { scope?: DataScope }).scope = scope;
}

// ---------- Tính phạm vi (có cache 60 giây) ----------
const cache = new Map<string, { at: number; scope: DataScope }>();
const TTL = 60_000;

export function clearScopeCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/** Đơn vị trong cây: các id gốc + toàn bộ đơn vị con. */
export function expandOrgTree(roots: string[], orgs: Array<{ id: string; parentId: string | null }>): Set<string> {
  const children = new Map<string, string[]>();
  for (const o of orgs) if (o.parentId) children.set(o.parentId, [...(children.get(o.parentId) ?? []), o.id]);
  const out = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

export async function computeScope(base: PrismaClient, user: { id: string; personId: string | null; orgScope: string[] }): Promise<DataScope> {
  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < TTL) return hit.scope;
  const [orgs, assignments, own, allEmps, loose] = await Promise.all([
    base.orgStructure.findMany({ where: { isDelete: false }, select: { id: true, parentId: true } }),
    base.assignment.findMany({
      where: { isDelete: false, isPrimary: true },
      select: { employmentId: true, orgStructureId: true, effectiveDate: true, employment: { select: { personId: true } } },
      orderBy: { effectiveDate: 'desc' },
    }),
    user.personId ? base.employment.findMany({ where: { personId: user.personId }, select: { id: true } }) : Promise.resolve([]),
    base.employment.findMany({ where: { isDelete: false }, select: { id: true, personId: true } }),
    // Hồ sơ chưa có hợp đồng nào (vừa nhập / ứng viên vừa nhận việc)
    base.person.findMany({ where: { isDelete: false, employments: { none: {} } }, select: { id: true } }),
  ]);
  const orgSet = expandOrgTree(user.orgScope, orgs);
  const employmentIds = new Set<string>();
  const personIds = new Set<string>();
  const seen = new Set<string>();
  // Vị trí chính gần nhất của mỗi hợp đồng quyết định thuộc đơn vị nào (kể cả người đã nghỉ).
  for (const a of assignments) {
    if (seen.has(a.employmentId)) continue;
    seen.add(a.employmentId);
    if (orgSet.has(a.orgStructureId)) {
      employmentIds.add(a.employmentId);
      personIds.add(a.employment.personId);
    }
  }
  // Chưa gán vị trí chính nào → chưa thuộc đơn vị nào → mọi nhân sự đều thấy (để gán vị trí cho người mới).
  for (const e of allEmps) {
    if (!seen.has(e.id)) {
      employmentIds.add(e.id);
      personIds.add(e.personId);
    }
  }
  for (const p of loose) personIds.add(p.id);
  // Luôn thấy chính mình.
  for (const e of own) employmentIds.add(e.id);
  if (user.personId) personIds.add(user.personId);
  const scope = { orgIds: [...orgSet], employmentIds, personIds };
  cache.set(user.id, { at: Date.now(), scope });
  return scope;
}

// ---------- Prisma extension ----------
type Args = Record<string, unknown> & { where?: unknown; data?: unknown };

function filterOf(model: string, scope: DataScope): Record<string, unknown> | null {
  if (EMP_FIELD[model]) return { [EMP_FIELD[model]]: { in: [...scope.employmentIds] } };
  if (PERSON_FIELD[model]) return { [PERSON_FIELD[model]]: { in: [...scope.personIds] } };
  return null;
}

function inScope(model: string, row: Record<string, unknown> | null | undefined, scope: DataScope): boolean {
  if (!row) return true;
  if (EMP_FIELD[model]) {
    const v = row[EMP_FIELD[model]];
    return typeof v !== 'string' || scope.employmentIds.has(v);
  }
  if (PERSON_FIELD[model]) {
    const v = row[PERSON_FIELD[model]];
    return typeof v !== 'string' || scope.personIds.has(v);
  }
  return true;
}

/** Lọc các mảng lồng nhau chứa bản ghi của nhân viên ngoài phạm vi (vd PayPeriod.results, TrainingCourse.participants). */
function pruneNested(value: unknown, scope: DataScope, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date || Prisma.Decimal.isDecimal(value) || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    const kept = value.filter((item) => {
      if (!item || typeof item !== 'object') return true;
      const o = item as Record<string, unknown>;
      if (typeof o.employmentId === 'string') return scope.employmentIds.has(o.employmentId);
      // Bản ghi hợp đồng lao động lồng nhau (có codeEmp)
      if (typeof o.codeEmp === 'string' && typeof o.id === 'string' && 'personId' in o) return scope.employmentIds.has(o.id);
      return true;
    });
    for (const k of kept) pruneNested(k, scope, depth + 1);
    if (kept.length !== value.length) {
      value.splice(0, value.length, ...kept);
    }
    return value;
  }
  for (const v of Object.values(value as Record<string, unknown>)) pruneNested(v, scope, depth + 1);
  return value;
}

/** Id hợp đồng / người trong dữ liệu ghi (trực tiếp hoặc connect). */
function idsInData(model: string, data: unknown): string[] {
  const rows = Array.isArray(data) ? data : [data];
  const field = EMP_FIELD[model] ?? PERSON_FIELD[model];
  const rel = EMP_FIELD[model] ? 'employment' : 'person';
  const out: string[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (field !== 'id' && typeof o[field] === 'string') out.push(o[field] as string);
    const c = (o[rel] as { connect?: { id?: string } } | undefined)?.connect?.id;
    if (c) out.push(c);
  }
  return out;
}

export function scopeExtension(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'data-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scope = currentScope();
          if (!scope) return query(args);
          const run = query as unknown as (x: unknown) => Promise<unknown>;
          const a = (args ?? {}) as Args;
          const filter = filterOf(model, scope);
          const allowed = (id: string) => (EMP_FIELD[model] ? scope.employmentIds.has(id) : scope.personIds.has(id));

          if (READ_MANY.has(operation)) {
            if (filter) a.where = a.where ? { AND: [a.where, filter] } : filter;
            return pruneNested(await run(a), scope);
          }
          if (READ_UNIQUE.has(operation)) {
            const row = (await run(a)) as Record<string, unknown> | null;
            if (filter && !inScope(model, row, scope)) {
              if (operation === 'findUniqueOrThrow') throw new OutOfScopeError();
              return null;
            }
            return pruneNested(row, scope);
          }
          if (!filter) return run(a);

          // Ghi vào model gắn với nhân viên
          if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') {
            if (idsInData(model, a.data).some((id) => !allowed(id))) throw new OutOfScopeError();
            const created = (await run(a)) as { id?: string } | null;
            // Hồ sơ / hợp đồng vừa tạo trong request này: cho phép thao tác tiếp (gán vị trí, lương…).
            if (operation === 'create' && created?.id) {
              if (model === 'Employment') scope.employmentIds.add(created.id);
              if (model === 'Person') scope.personIds.add(created.id);
              clearScopeCache();
            }
            return created;
          }
          if (operation === 'updateMany' || operation === 'deleteMany') {
            a.where = a.where ? { AND: [a.where, filter] } : filter;
            return run(a);
          }
          if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
            const delegate = (base as unknown as Record<string, { findUnique(x: unknown): Promise<Record<string, unknown> | null> }>)[model.charAt(0).toLowerCase() + model.slice(1)];
            const existing = await delegate.findUnique({ where: a.where });
            if (existing && !inScope(model, existing, scope)) throw new OutOfScopeError();
            if (operation === 'upsert' && !existing && idsInData(model, (a as { create?: unknown }).create).some((id) => !allowed(id))) throw new OutOfScopeError();
            const moved = idsInData(model, a.data ?? (a as { update?: unknown }).update);
            if (moved.some((id) => !allowed(id))) throw new OutOfScopeError();
            return run(a);
          }
          return run(a);
        },
      },
    },
  });
}
