import { Link } from 'react-router-dom';
import { Card, DataTable } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, money } from '../../lib/format';
import { DISCIPLINE_FORMS, DisciplineStatus, REWARD_FORMS, RewardRow } from './RewardsPage';
import { CourseBadge, ResultBadge } from './TrainingsPage';
import { AssetHolding, HoldingsTable } from './AssetsPage';
import { Claim, ClaimsTable } from './BenefitsPage';

export interface TrainingRow {
  id: string;
  result: string;
  score: string | null;
  certificateNo: string | null;
  certificateExpiry: string | null;
  course: { id: string; code: string; name: string; startDate: string; endDate: string; status: string; commitmentMonths: number };
}

/** Bảng khen thưởng – kỷ luật và đào tạo; dùng ở hồ sơ nhân sự và hồ sơ của tôi. */
export function RewardsTable({ rows, loading }: { rows: RewardRow[] | null; loading?: boolean }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      rowKey={(r) => r.id}
      empty="Chưa có khen thưởng, kỷ luật"
      columns={[
        { header: 'Loại', cell: (r) => (r.kind === 'REWARD' ? <span className="badge text-bg-success">Khen thưởng</span> : <span className="badge text-bg-danger">Kỷ luật</span>) },
        { header: 'Hình thức', cell: (r) => (r.kind === 'REWARD' ? REWARD_FORMS : DISCIPLINE_FORMS)[r.form] ?? r.form },
        { header: 'Quyết định', cell: (r) => `${r.decisionNo ?? ''} ${date(r.decisionDate)}`.trim(), className: 'nowrap' },
        { header: 'Lý do', cell: (r) => <span className="small">{r.reason}</span> },
        { header: 'Số tiền', cell: (r) => (r.amount ? money(r.amount) : '—'), className: 'num' },
        { header: '', cell: (r) => <DisciplineStatus r={r} /> },
      ]}
    />
  );
}

export function TrainingsTable({ rows, loading, linkCourse }: { rows: TrainingRow[] | null; loading?: boolean; linkCourse?: boolean }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      rowKey={(t) => t.id}
      empty="Chưa tham gia khoá đào tạo nào"
      columns={[
        { header: 'Khoá học', cell: (t) => (linkCourse ? <Link to={`/trainings/${t.course.id}`}>{t.course.code} · {t.course.name}</Link> : `${t.course.code} · ${t.course.name}`) },
        { header: 'Thời gian', cell: (t) => `${date(t.course.startDate)} – ${date(t.course.endDate)}`, className: 'nowrap' },
        { header: 'Khoá', cell: (t) => <CourseBadge status={t.course.status} /> },
        { header: 'Kết quả', cell: (t) => <ResultBadge result={t.result} /> },
        { header: 'Chứng chỉ', cell: (t) => (t.certificateNo ? `${t.certificateNo}${t.certificateExpiry ? ` (hết hạn ${date(t.certificateExpiry)})` : ''}` : '—') },
        { header: 'Cam kết', cell: (t) => (t.course.commitmentMonths ? `${t.course.commitmentMonths} tháng` : '—') },
      ]}
    />
  );
}

function EmploymentBlock({ employmentId }: { employmentId: string }) {
  const rewards = useFetch<RewardRow[]>(`/people/rewards?employmentId=${employmentId}`);
  const trainings = useFetch<TrainingRow[]>(`/people/employments/${employmentId}/trainings`);
  const assets = useFetch<AssetHolding[]>(`/assets/employments/${employmentId}`);
  const claims = useFetch<Claim[]>(`/benefits/claims?employmentId=${employmentId}`);
  return (
    <>
      <Card flush title="Tài sản đang giữ / đã trả">
        <HoldingsTable rows={assets.data} loading={assets.loading} />
      </Card>
      <Card flush title="Chế độ BHXH">
        <ClaimsTable rows={claims.data} loading={claims.loading} />
      </Card>
      <Card flush title="Khen thưởng – kỷ luật">
        <RewardsTable rows={rewards.data} loading={rewards.loading} />
      </Card>
      <Card flush title="Đào tạo">
        <TrainingsTable rows={trainings.data} loading={trainings.loading} linkCourse />
      </Card>
    </>
  );
}

export default function PersonPeopleTab({ employmentIds }: { employmentIds: string[] }) {
  if (employmentIds.length === 0) return <Card><div className="text-body-secondary">Chưa có hợp đồng lao động.</div></Card>;
  return (
    <>
      {employmentIds.map((id) => (
        <EmploymentBlock key={id} employmentId={id} />
      ))}
    </>
  );
}
