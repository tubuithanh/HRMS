import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCanWrite } from '../../auth';
import { Badge, Card, DataTable, ErrorBox, FieldDef, FormModal, PageHeader, Tabs } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, labels, options } from '../../lib/format';
import { Employment, Person } from '../../types/models';

export const personFields: FieldDef[] = [
  { name: 'personCode', label: 'Mã người', required: true },
  { name: 'fullName', label: 'Họ và tên', required: true },
  { name: 'gender', label: 'Giới tính', type: 'select', options: options(labels.gender) },
  { name: 'dateOfBirth', label: 'Ngày sinh', type: 'date' },
  { name: 'idNo', label: 'Số CCCD (12 số)' },
  { name: 'personalTaxCode', label: 'Mã số thuế cá nhân' },
  { name: 'socialInsNo', label: 'Mã số BHXH' },
  { name: 'nationality', label: 'Quốc tịch', placeholder: 'Việt Nam' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Điện thoại' },
  { name: 'isForeigner', label: 'Người nước ngoài', type: 'checkbox' },
];

const statusTone: Record<string, 'green' | 'yellow' | 'red' | 'blue' | undefined> = {
  ACTIVE: 'green',
  PROBATION: 'yellow',
  TERMINATED: 'red',
  UPCOMING: 'blue',
};

export function EmploymentStatus({ status }: { status: string }) {
  return (
    <Badge tone={statusTone[status]}>
      {labels.employmentStatus[status as keyof typeof labels.employmentStatus] ?? status}
    </Badge>
  );
}

export default function PersonsPage() {
  const [tab, setTab] = useState<'employees' | 'persons'>('employees');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const canWrite = useCanWrite('corehr');
  const navigate = useNavigate();
  const persons = useFetch<Person[]>('/corehr/persons');
  const employments = useFetch<Employment[]>('/corehr/employments');

  const needle = q.trim().toLowerCase();
  const match = (...s: Array<string | null | undefined>) =>
    !needle || s.some((x) => x?.toLowerCase().includes(needle));

  const empRows = useMemo(
    () =>
      employments.data?.filter((e) =>
        match(e.codeEmp, e.person?.fullName, e.person?.personCode),
      ) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employments.data, needle],
  );
  const personRows = useMemo(
    () => persons.data?.filter((p) => match(p.personCode, p.fullName, p.email, p.phone, p.idNo)) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persons.data, needle],
  );

  return (
    <>
      <PageHeader
        title="Nhân sự"
        subtitle="Hồ sơ cá nhân và hợp đồng lao động"
        actions={
          canWrite && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              + Thêm nhân sự
            </button>
          )
        }
      />
      <Tabs
        tabs={[
          { key: 'employees', label: `Nhân viên (${employments.data?.length ?? '…'})` },
          { key: 'persons', label: `Tất cả hồ sơ (${persons.data?.length ?? '…'})` },
        ]}
        active={tab}
        onChange={setTab}
      />
      <Card flush>
        <div className="card-header">
          <input
            className="form-control"
            style={{ maxWidth: 320 }}
            placeholder="Tìm theo tên, mã, email, CCCD…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {tab === 'employees' ? (
          <>
            <ErrorBox error={employments.error} />
            <DataTable
              rows={empRows}
              loading={employments.loading}
              rowKey={(e) => e.id}
              empty="Chưa có hợp đồng lao động nào"
              columns={[
                { header: 'Mã NV', cell: (e) => e.codeEmp },
                {
                  header: 'Họ tên',
                  cell: (e) => <Link to={`/persons/${e.personId}`}>{e.person?.fullName}</Link>,
                },
                {
                  header: 'Vị trí / Phòng ban',
                  cell: (e) => {
                    const a = e.assignments?.[0];
                    return a ? (
                      <>
                        {a.position.job?.name ?? a.position.code}
                        <div className="muted">{a.orgStructure.name}</div>
                      </>
                    ) : (
                      <span className="muted">Chưa gán</span>
                    );
                  },
                },
                { header: 'Ngày vào', cell: (e) => date(e.dateHire), className: 'nowrap' },
                { header: 'Trạng thái', cell: (e) => <EmploymentStatus status={e.status} /> },
              ]}
            />
          </>
        ) : (
          <>
            <ErrorBox error={persons.error} />
            <DataTable
              rows={personRows}
              loading={persons.loading}
              rowKey={(p) => p.id}
              empty="Chưa có hồ sơ nào"
              columns={[
                { header: 'Mã', cell: (p) => p.personCode },
                { header: 'Họ tên', cell: (p) => <Link to={`/persons/${p.id}`}>{p.fullName}</Link> },
                { header: 'Giới tính', cell: (p) => (p.gender ? labels.gender[p.gender] : '—') },
                { header: 'Ngày sinh', cell: (p) => date(p.dateOfBirth), className: 'nowrap' },
                { header: 'Điện thoại', cell: (p) => p.phone ?? '—' },
                { header: 'Email', cell: (p) => p.email ?? '—' },
              ]}
            />
          </>
        )}
      </Card>

      {creating && (
        <FormModal
          title="Thêm nhân sự"
          fields={personFields}
          path="/corehr/persons"
          successMessage="Đã thêm nhân sự"
          onClose={() => setCreating(false)}
          onSaved={(p) => navigate(`/persons/${(p as Person).id}`)}
        >
          <p className="muted" style={{ marginTop: 0 }}>
            Sau khi tạo hồ sơ, hãy thêm hợp đồng lao động ở tab “Hợp đồng & lương”.
          </p>
        </FormModal>
      )}
    </>
  );
}
