import { prisma } from '../../config/prisma';
import { formatDate } from '../../common/utils/dates';
import { notify } from './notification.service';

/** Thông báo theo sự kiện nghiệp vụ. Gọi sau khi thao tác chính đã thành công; không chặn, không ném lỗi. */

type Kind = 'leave' | 'overtime';
const LABEL: Record<Kind, string> = { leave: 'nghỉ phép', overtime: 'làm thêm giờ' };
const HR_PAGE: Record<Kind, string> = { leave: '/leave', overtime: '/overtime' };
const MY_PAGE: Record<Kind, string> = { leave: '/me/leave', overtime: '/me/overtime' };
const dmy = (d: Date) => formatDate(d).split('-').reverse().join('/');

async function nameOf(employmentId: string) {
  const e = await prisma.employment.findUnique({ where: { id: employmentId }, select: { person: { select: { fullName: true } } } });
  return e?.person.fullName ?? 'Nhân viên';
}

export interface RequestInfo {
  employmentId: string;
  approvalStage: string;
  approverEmploymentId: string | null;
  /** vd "02/10/2026 – 03/10/2026 (2 ngày)" */
  summary: string;
}

export function leaveSummary(r: { fromDate: Date; toDate: Date; days: unknown }) {
  return `${dmy(r.fromDate)}${r.toDate.getTime() !== r.fromDate.getTime() ? ` – ${dmy(r.toDate)}` : ''} (${String(r.days)} ngày)`;
}
export function overtimeSummary(r: { workDate: Date; hours: unknown }) {
  return `${dmy(r.workDate)} (${String(r.hours)} giờ)`;
}

const rawEvents = {
  /** Đơn mới: báo người duyệt bước đầu. */
  async requestSubmitted(kind: Kind, r: RequestInfo) {
    const name = await nameOf(r.employmentId);
    const n = { title: `Đơn ${LABEL[kind]} chờ duyệt: ${name}`, body: r.summary, email: true };
    if (r.approvalStage === 'MANAGER' && r.approverEmploymentId) await notify.employment(r.approverEmploymentId, { ...n, link: '/me/approvals' });
    else await notify.roles(['HR'], { ...n, link: HR_PAGE[kind] });
  },

  /** Quản lý duyệt bước 1 → báo nhân sự; từ chối → báo người làm đơn. */
  async managerReviewed(kind: Kind, r: { employmentId: string; summary: string }, approved: boolean, note?: string | null) {
    const name = await nameOf(r.employmentId);
    if (approved) await notify.roles(['HR'], { title: `Đơn ${LABEL[kind]} chờ duyệt cuối: ${name}`, body: `${r.summary} — quản lý đã duyệt`, link: HR_PAGE[kind] });
    else await notify.employment(r.employmentId, { title: `Đơn ${LABEL[kind]} bị từ chối`, body: `${r.summary}${note ? ` — ${note}` : ''}`, link: MY_PAGE[kind], email: true });
  },

  /** Nhân sự duyệt cuối → báo người làm đơn. */
  async finalReviewed(kind: Kind, r: { employmentId: string; summary: string }, approved: boolean, note?: string | null) {
    await notify.employment(r.employmentId, {
      title: `Đơn ${LABEL[kind]} ${approved ? 'đã được duyệt' : 'bị từ chối'}`,
      body: `${r.summary}${note ? ` — ${note}` : ''}`,
      link: MY_PAGE[kind],
      email: true,
    });
  },

  /** Khoá kỳ lương → mọi người có phiếu lương. */
  async payrollLocked(periodId: string, code: string) {
    const rows = await prisma.payrollResult.findMany({ where: { payPeriodId: periodId }, select: { employmentId: true } });
    await notify.employment(rows.map((r) => r.employmentId), { title: `Đã có phiếu lương kỳ ${code}`, link: '/me/payslips', dedupeKey: `payslip:${periodId}` });
  },
};

/** Mọi sự kiện đều nuốt lỗi (chỉ ghi log) để gọi kiểu `void events.x(...)` an toàn. */
export const events = Object.fromEntries(
  Object.entries(rawEvents).map(([k, fn]) => [
    k,
    async (...args: unknown[]) => {
      try {
        await (fn as (...a: unknown[]) => Promise<void>)(...args);
      } catch (e) {
        console.error(`Thông báo "${k}" lỗi:`, e instanceof Error ? e.message : e);
      }
    },
  ]),
) as typeof rawEvents;
