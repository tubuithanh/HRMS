import { useState } from 'react';
import { api } from '../../api/client';
import { useCanWrite } from '../../auth';
import { ActionButton, Badge, Card, DataTable, ErrorBox, FieldDef, FormModal, Loading, PageHeader, Tabs } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, labels, options, todayISO } from '../../lib/format';
import { Company, Job, OrgUnit, Position } from '../../types/models';

type Dialog =
  | { kind: 'org'; parentId?: string }
  | { kind: 'org-edit'; unit: OrgUnit }
  | { kind: 'job' }
  | { kind: 'position'; orgStructureId?: string }
  | null;

function OrgTree(props: {
  units: OrgUnit[];
  parentId: string | null;
  canWrite: boolean;
  onAdd: (parentId: string) => void;
  onEdit: (u: OrgUnit) => void;
  onAddPosition: (orgId: string) => void;
  onDeleted: () => void;
  root?: boolean;
}) {
  const children = props.units.filter((u) => u.parentId === props.parentId);
  if (children.length === 0) return null;
  return (
    <ul className={`tree${props.root ? ' root' : ''}`}>
      {children.map((u) => (
        <li key={u.id}>
          <div className="node">
            <Badge>{labels.orgType[u.orgType as keyof typeof labels.orgType] ?? u.orgType}</Badge>
            <strong>{u.name}</strong>
            <span className="muted">{u.code}</span>
            {props.canWrite && (
              <span className="toolbar" style={{ marginLeft: 'auto' }}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => props.onAdd(u.id)}>+ Đơn vị con</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => props.onAddPosition(u.id)}>+ Vị trí</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => props.onEdit(u)}>Sửa</button>
                <ActionButton
                  label="Xoá"
                  className="btn btn-sm btn-outline-danger"
                  confirm={`Xoá đơn vị ${u.name}?`}
                  run={() => api.delete(`/corehr/org/${u.id}`)}
                  success="Đã xoá"
                  onDone={props.onDeleted}
                />
              </span>
            )}
          </div>
          <OrgTree {...props} parentId={u.id} root={false} />
        </li>
      ))}
    </ul>
  );
}

export default function OrgPage() {
  const [tab, setTab] = useState<'tree' | 'positions' | 'jobs'>('tree');
  const [dialog, setDialog] = useState<Dialog>(null);
  const canWrite = useCanWrite('corehr');
  const org = useFetch<OrgUnit[]>('/corehr/org');
  const jobs = useFetch<Job[]>('/corehr/jobs');
  const positions = useFetch<Position[]>('/corehr/positions');
  const companies = useFetch<Company[]>('/corehr/companies');
  const units = org.data ?? [];

  const orgOptions = units.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }));
  const orgFields: FieldDef[] = [
    { name: 'companyId', label: 'Công ty', type: 'select', required: true, options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
    { name: 'code', label: 'Mã đơn vị', required: true },
    { name: 'name', label: 'Tên đơn vị', required: true },
    { name: 'orgType', label: 'Loại', type: 'select', options: options(labels.orgType) },
    { name: 'parentId', label: 'Đơn vị cha', type: 'select', options: orgOptions },
    { name: 'effectiveDate', label: 'Hiệu lực từ', type: 'date', required: true },
  ];
  const orgEditFields: FieldDef[] = [
    { name: 'name', label: 'Tên đơn vị', required: true },
    { name: 'orgType', label: 'Loại', type: 'select', options: options(labels.orgType) },
    { name: 'parentId', label: 'Đơn vị cha', type: 'select', options: orgOptions, nullable: true },
  ];
  const jobFields: FieldDef[] = [
    { name: 'code', label: 'Mã chức danh', required: true },
    { name: 'name', label: 'Tên chức danh', required: true },
    { name: 'jobFamily', label: 'Nhóm nghề' },
    { name: 'maxProbationDays', label: 'Thử việc tối đa (ngày)', type: 'number' },
    { name: 'isHazardous', label: 'Nặng nhọc, độc hại', type: 'checkbox' },
  ];
  const positionFields: FieldDef[] = [
    { name: 'code', label: 'Mã vị trí', required: true },
    { name: 'jobId', label: 'Chức danh', type: 'select', required: true, options: (jobs.data ?? []).map((j) => ({ value: j.id, label: `${j.name} (${j.code})` })) },
    { name: 'orgStructureId', label: 'Phòng ban', type: 'select', required: true, options: orgOptions },
    { name: 'parentPositionId', label: 'Báo cáo cho vị trí', type: 'select', options: (positions.data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.job.name}` })) },
    { name: 'effectiveDate', label: 'Hiệu lực từ', type: 'date', required: true },
    { name: 'isKeyPosition', label: 'Vị trí then chốt', type: 'checkbox' },
  ];

  const reloadAll = () => {
    setDialog(null);
    org.reload();
    jobs.reload();
    positions.reload();
  };
  const defaultCompany = companies.data?.length === 1 ? companies.data[0].id : '';

  return (
    <>
      <PageHeader
        title="Tổ chức"
        subtitle="Cơ cấu phòng ban, chức danh và vị trí định biên"
        actions={
          canWrite && (
            <>
              <button className="btn btn-outline-secondary" onClick={() => setDialog({ kind: 'job' })}>+ Chức danh</button>
              <button className="btn btn-outline-secondary" onClick={() => setDialog({ kind: 'position' })}>+ Vị trí</button>
              <button className="btn btn-primary" onClick={() => setDialog({ kind: 'org' })}>+ Đơn vị</button>
            </>
          )
        }
      />
      <Tabs
        tabs={[
          { key: 'tree', label: 'Sơ đồ tổ chức' },
          { key: 'positions', label: `Vị trí (${positions.data?.length ?? '…'})` },
          { key: 'jobs', label: `Chức danh (${jobs.data?.length ?? '…'})` },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'tree' && (
        <Card>
          <ErrorBox error={org.error} />
          {org.loading && !org.data ? (
            <Loading />
          ) : units.length === 0 ? (
            <div className="empty">Chưa có đơn vị nào</div>
          ) : (
            <OrgTree
              root
              units={units}
              parentId={null}
              canWrite={canWrite}
              onAdd={(parentId) => setDialog({ kind: 'org', parentId })}
              onEdit={(unit) => setDialog({ kind: 'org-edit', unit })}
              onAddPosition={(orgStructureId) => setDialog({ kind: 'position', orgStructureId })}
              onDeleted={org.reload}
            />
          )}
        </Card>
      )}
      {tab === 'positions' && (
        <Card flush>
          <ErrorBox error={positions.error} />
          <DataTable
            rows={positions.data}
            loading={positions.loading}
            rowKey={(p) => p.id}
            empty="Chưa có vị trí nào"
            columns={[
              { header: 'Mã', cell: (p) => p.code },
              { header: 'Chức danh', cell: (p) => p.job.name },
              { header: 'Phòng ban', cell: (p) => p.orgStructure.name },
              { header: 'Trạng thái', cell: (p) => <Badge tone={p.status === 'FILLED' ? 'green' : p.status === 'VACANT' ? 'yellow' : undefined}>{p.status === 'FILLED' ? 'Có người' : p.status === 'VACANT' ? 'Trống' : p.status}</Badge> },
              { header: 'Then chốt', cell: (p) => (p.isKeyPosition ? 'Có' : '') },
              { header: 'Hiệu lực', cell: (p) => date(p.effectiveDate) },
            ]}
          />
        </Card>
      )}
      {tab === 'jobs' && (
        <Card flush>
          <ErrorBox error={jobs.error} />
          <DataTable
            rows={jobs.data}
            loading={jobs.loading}
            rowKey={(j) => j.id}
            empty="Chưa có chức danh nào"
            columns={[
              { header: 'Mã', cell: (j) => j.code },
              { header: 'Tên', cell: (j) => j.name },
              { header: 'Nhóm nghề', cell: (j) => j.jobFamily ?? '—' },
              { header: 'Thử việc tối đa', cell: (j) => (j.maxProbationDays ? `${j.maxProbationDays} ngày` : '—') },
              { header: 'Độc hại', cell: (j) => (j.isHazardous ? 'Có' : '') },
            ]}
          />
        </Card>
      )}

      {dialog?.kind === 'org' && (
        <FormModal title="Thêm đơn vị" fields={orgFields} initial={{ companyId: defaultCompany, parentId: dialog.parentId, orgType: 'DEPARTMENT', effectiveDate: todayISO() }} path="/corehr/org" onClose={() => setDialog(null)} onSaved={reloadAll} />
      )}
      {dialog?.kind === 'org-edit' && (
        <FormModal title={`Sửa ${dialog.unit.name}`} fields={orgEditFields} initial={dialog.unit} method="patch" path={`/corehr/org/${dialog.unit.id}`} onClose={() => setDialog(null)} onSaved={reloadAll} />
      )}
      {dialog?.kind === 'job' && (
        <FormModal title="Thêm chức danh" fields={jobFields} path="/corehr/jobs" onClose={() => setDialog(null)} onSaved={reloadAll} />
      )}
      {dialog?.kind === 'position' && (
        <FormModal title="Thêm vị trí" fields={positionFields} initial={{ orgStructureId: dialog.orgStructureId, effectiveDate: todayISO() }} path="/corehr/positions" onClose={() => setDialog(null)} onSaved={reloadAll}>
          {(jobs.data?.length ?? 0) === 0 && <div className="alert alert-info">Cần tạo chức danh trước.</div>}
        </FormModal>
      )}
    </>
  );
}
