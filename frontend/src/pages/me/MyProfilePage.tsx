import { Card, DataTable, ErrorBox, Loading, PageHeader } from '../../components/ui';
import { useAuth, roleLabels } from '../../auth';
import { useFetch } from '../../lib/hooks';
import { date, labels } from '../../lib/format';
import { Employment, Person } from '../../types/models';
import { EmploymentStatus } from '../persons/PersonsPage';
import { RewardsTable, TrainingRow, TrainingsTable } from '../people/PersonPeopleTab';
import { RewardRow } from '../people/RewardsPage';

type Profile = Person & {
  employments: Array<Employment & { company: { name: string } }>;
  dependants: Array<{ id: string; dependantName: string; relationship: string; dateOfBirth: string | null }>;
};

/** Thông báo khi tài khoản chưa gắn hồ sơ nhân sự / chưa có hợp đồng. */
export function SelfServiceError({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="alert alert-info">{error}</div>;
}

export default function MyProfilePage() {
  const { user } = useAuth();
  const { data: p, error, loading } = useFetch<Profile>(user?.personId ? '/me/profile' : null);

  return (
    <>
      <PageHeader title="Hồ sơ của tôi" subtitle={user && `${user.username} · ${roleLabels[user.role]}`} />
      {!user?.personId && (
        <div className="alert alert-info">Tài khoản chưa được gắn với hồ sơ nhân sự. Liên hệ quản trị để được gắn.</div>
      )}
      <SelfServiceError error={error} />
      {loading && !p && <Loading />}
      {p && (
        <div className="stack">
          <Card title="Thông tin cá nhân">
            <dl className="kv">
              <dt>Họ và tên</dt><dd>{p.fullName}</dd>
              <dt>Mã</dt><dd>{p.personCode}</dd>
              <dt>Giới tính</dt><dd>{p.gender ? labels.gender[p.gender] : '—'}</dd>
              <dt>Ngày sinh</dt><dd>{date(p.dateOfBirth)}</dd>
              <dt>Email</dt><dd>{p.email ?? '—'}</dd>
              <dt>Điện thoại</dt><dd>{p.phone ?? '—'}</dd>
              <dt>MST cá nhân</dt><dd>{p.personalTaxCode ?? '—'}</dd>
              <dt>Mã số BHXH</dt><dd>{p.socialInsNo ?? '—'}</dd>
            </dl>
            <p className="muted" style={{ marginBottom: 0 }}>Thông tin sai? Hãy báo phòng nhân sự để cập nhật.</p>
          </Card>
          <Card title="Quá trình làm việc" flush>
            <DataTable
              rows={p.employments}
              rowKey={(e) => e.id}
              columns={[
                { header: 'Mã NV', cell: (e) => e.codeEmp },
                { header: 'Công ty', cell: (e) => e.company.name },
                {
                  header: 'Vị trí',
                  cell: (e) => {
                    const a = e.assignments?.[0];
                    return a ? `${a.position.job?.name ?? a.position.code} · ${a.orgStructure.name}` : '—';
                  },
                },
                { header: 'Ngày vào', cell: (e) => date(e.dateHire) },
                { header: 'Trạng thái', cell: (e) => <EmploymentStatus status={e.status} /> },
              ]}
            />
          </Card>
          <MyRewardsAndTrainings />
          <Card title="Người phụ thuộc (giảm trừ gia cảnh)" flush>
            <DataTable
              rows={p.dependants}
              rowKey={(d) => d.id}
              empty="Không có người phụ thuộc"
              columns={[
                { header: 'Họ tên', cell: (d) => d.dependantName },
                { header: 'Quan hệ', cell: (d) => d.relationship },
                { header: 'Ngày sinh', cell: (d) => date(d.dateOfBirth) },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}

function MyRewardsAndTrainings() {
  const rewards = useFetch<RewardRow[]>('/me/rewards');
  const trainings = useFetch<TrainingRow[]>('/me/trainings');
  return (
    <>
      <Card title="Khen thưởng – kỷ luật" flush>
        <RewardsTable rows={rewards.data} loading={rewards.loading} />
      </Card>
      <Card title="Đào tạo" flush>
        <TrainingsTable rows={trainings.data} loading={trainings.loading} />
      </Card>
    </>
  );
}
