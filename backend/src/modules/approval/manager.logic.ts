/**
 * Xác định quản lý trực tiếp của nhân viên. Hàm thuần — nhận dữ liệu đã tải.
 *
 * Thứ tự:
 *  1. Quản lý chỉ định riêng trên vị trí công việc (Assignment.directManagerEmploymentId).
 *  2. Người giữ vị trí then chốt (Position.isKeyPosition) trong cùng đơn vị.
 *     Nếu chính nhân viên là người đứng đầu đơn vị (hoặc đơn vị không có ai),
 *     tìm tiếp ở đơn vị cha, rồi cha của cha...
 * Không tìm được → null (đơn đi thẳng tới nhân sự).
 */

export interface OrgNode {
  id: string;
  parentId: string | null;
}

export interface ActiveAssignment {
  employmentId: string;
  orgId: string;
  isKeyPosition: boolean;
  directManagerEmploymentId: string | null;
}

export function computeManagers(orgs: OrgNode[], assignments: ActiveAssignment[]): Map<string, string | null> {
  const parent = new Map(orgs.map((o) => [o.id, o.parentId]));
  const heads = new Map<string, string[]>();
  for (const a of assignments) {
    if (!a.isKeyPosition) continue;
    heads.set(a.orgId, [...(heads.get(a.orgId) ?? []), a.employmentId]);
  }
  const active = new Set(assignments.map((a) => a.employmentId));

  const result = new Map<string, string | null>();
  for (const a of assignments) {
    if (a.directManagerEmploymentId && a.directManagerEmploymentId !== a.employmentId && active.has(a.directManagerEmploymentId)) {
      result.set(a.employmentId, a.directManagerEmploymentId);
      continue;
    }
    let org: string | null = a.orgId;
    let found: string | null = null;
    const seen = new Set<string>();
    while (org && !seen.has(org)) {
      seen.add(org);
      const candidates = (heads.get(org) ?? []).filter((e) => e !== a.employmentId);
      // Nhân viên là một trong những người đứng đầu đơn vị này → lên cấp trên.
      const isHeadHere = (heads.get(org) ?? []).includes(a.employmentId);
      if (candidates.length && !isHeadHere) {
        found = candidates[0];
        break;
      }
      org = parent.get(org) ?? null;
    }
    result.set(a.employmentId, found);
  }
  return result;
}
