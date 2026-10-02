import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Card, ErrorBox, FormModal, Loading, PageHeader, Tabs } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, labels } from '../../lib/format';
import { Employment, Person } from '../../types/models';
import { personFields } from './PersonsPage';
import EmploymentsTab from './EmploymentsTab';
import SubResourceTab from './SubResourceTab';
import { subResources } from './subResources';

type PersonDetail = Person & { employments: Employment[] };

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error, loading, reload } = useFetch<PersonDetail>(`/corehr/persons/${id}`);
  const [tab, setTab] = useState('info');
  const [editing, setEditing] = useState(false);
  const canWrite = useCanWrite('corehr');
  const navigate = useNavigate();

  if (loading && !p) return <Loading />;
  if (error || !p) return <ErrorBox error={error ?? 'Không tìm thấy'} />;

  // Mã người và mã số không sửa qua form sửa.
  const editFields = personFields.filter((f) => f.name !== 'personCode');

  return (
    <>
      <div className="muted" style={{ marginBottom: 6 }}>
        <Link to="/persons">← Nhân sự</Link>
      </div>
      <PageHeader
        title={p.fullName}
        subtitle={`Mã ${p.personCode}`}
        actions={
          canWrite && (
            <>
              <button className="btn btn-outline-secondary" onClick={() => setEditing(true)}>Sửa thông tin</button>
              <ActionButton
                label="Xoá hồ sơ"
                className="btn btn-outline-danger"
                confirm={`Xoá hồ sơ ${p.fullName}?`}
                run={() => api.delete(`/corehr/persons/${p.id}`)}
                success="Đã xoá hồ sơ"
                onDone={() => navigate('/persons')}
              />
            </>
          )
        }
      />
      <Tabs
        tabs={[
          { key: 'info', label: 'Thông tin' },
          { key: 'employment', label: `Hợp đồng & lương (${p.employments.length})` },
          ...subResources.map((s) => ({ key: s.key, label: s.title })),
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'info' && (
        <Card>
          <dl className="kv">
            <dt>Họ và tên</dt><dd>{p.fullName}</dd>
            <dt>Giới tính</dt><dd>{p.gender ? labels.gender[p.gender] : '—'}</dd>
            <dt>Ngày sinh</dt><dd>{date(p.dateOfBirth)}</dd>
            <dt>Số CCCD</dt><dd>{p.idNo ?? '—'}</dd>
            <dt>MST cá nhân</dt><dd>{p.personalTaxCode ?? '—'}</dd>
            <dt>Mã số BHXH</dt><dd>{p.socialInsNo ?? '—'}</dd>
            <dt>Quốc tịch</dt><dd>{p.nationality ?? '—'}{p.isForeigner && ' (người nước ngoài)'}</dd>
            <dt>Email</dt><dd>{p.email ?? '—'}</dd>
            <dt>Điện thoại</dt><dd>{p.phone ?? '—'}</dd>
            <dt>Tài khoản nhận lương</dt>
            <dd>
              {p.bankAccountNo
                ? `${p.bankAccountNo} · ${labels.bank[p.bankName as keyof typeof labels.bank] ?? p.bankName ?? ''}${p.bankBranch ? ` – ${p.bankBranch}` : ''}`
                : <span className="text-warning-emphasis">Chưa khai — không có trong file chuyển lương</span>}
            </dd>
          </dl>
        </Card>
      )}
      {tab === 'employment' && (
        <EmploymentsTab personId={p.id} employmentIds={p.employments.map((e) => e.id)} onChanged={reload} />
      )}
      {subResources.map((s) => tab === s.key && <SubResourceTab key={s.key} personId={p.id} config={s} />)}

      {editing && (
        <FormModal
          title="Sửa thông tin nhân sự"
          fields={editFields}
          initial={p}
          method="patch"
          path={`/corehr/persons/${p.id}`}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </>
  );
}
