import { prisma } from '../../config/prisma';
import { todayDate } from '../../common/utils/dates';

/**
 * Dữ liệu sơ đồ tổ chức: mỗi đơn vị kèm nhân viên đang giữ vị trí chính (đang làm / thử việc),
 * người phụ trách (vị trí chủ chốt) và số vị trí trống. Tổng theo nhánh do giao diện cộng dồn.
 * Theo phạm vi dữ liệu: người bị giới hạn chỉ thấy nhân viên trong phạm vi của mình.
 */
export async function orgChart(asOf = todayDate()) {
  const [units, assignments, positions] = await Promise.all([
    prisma.orgStructure.findMany({
      where: { isDelete: false, effectiveDate: { lte: asOf }, OR: [{ endDate: null }, { endDate: { gte: asOf } }] },
      select: { id: true, code: true, name: true, orgType: true, parentId: true },
      orderBy: { code: 'asc' },
    }),
    prisma.assignment.findMany({
      where: {
        isDelete: false,
        isPrimary: true,
        effectiveDate: { lte: asOf },
        OR: [{ endDate: null }, { endDate: { gte: asOf } }],
        employment: { isDelete: false, status: { in: ['ACTIVE', 'PROBATION'] } },
      },
      select: {
        employmentId: true,
        orgStructureId: true,
        position: { select: { isKeyPosition: true, job: { select: { name: true } } } },
        employment: { select: { codeEmp: true, status: true, person: { select: { id: true, fullName: true, gender: true } } } },
      },
    }),
    prisma.position.groupBy({ by: ['orgStructureId', 'status'], _count: true, where: { isDelete: false } }),
  ]);

  const byOrg = new Map<string, typeof assignments>();
  for (const a of assignments) byOrg.set(a.orgStructureId, [...(byOrg.get(a.orgStructureId) ?? []), a]);

  return {
    asOf,
    units: units.map((u) => {
      const members = (byOrg.get(u.id) ?? [])
        .map((a) => ({
          employmentId: a.employmentId,
          personId: a.employment.person.id,
          codeEmp: a.employment.codeEmp,
          fullName: a.employment.person.fullName,
          gender: a.employment.person.gender,
          jobName: a.position.job?.name ?? null,
          isKey: a.position.isKeyPosition,
          probation: a.employment.status === 'PROBATION',
        }))
        .sort((x, y) => Number(y.isKey) - Number(x.isKey) || x.codeEmp.localeCompare(y.codeEmp));
      const pos = positions.filter((p) => p.orgStructureId === u.id);
      return {
        ...u,
        head: members.find((m) => m.isKey) ?? null,
        members,
        positions: pos.reduce((n, p) => n + p._count, 0),
        vacancies: pos.filter((p) => p.status === 'VACANT').reduce((n, p) => n + p._count, 0),
      };
    }),
  };
}
