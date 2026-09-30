import { useState } from 'react';
import { useCanWrite } from '../../auth';
import { Card, DataTable, ErrorBox, FieldDef, FormModal, Loading } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, labels, money, options, todayISO } from '../../lib/format';
import { Company, Employment, Position } from '../../types/models';
import { EmploymentStatus } from './PersonsPage';
import OffboardModal from './OffboardModal';
import { AdvancesSection, ContractsSection, ElementsSection } from './EmploymentExtras';

type Dialog = 'status' | 'assign' | 'salary' | 'tax' | null;

const salaryFields: FieldDef[] = [
  { name: 'baseAmount', label: 'Lương cơ bản (VND)', type: 'number', required: true },
  { name: 'insuranceSalary', label: 'Lương đóng BH (để trống = lương cơ bản)', type: 'number' },
  { name: 'salaryType', label: 'Loại lương', type: 'select', options: options({ GROSS: 'Gross', NET: 'Net' }) },
  { name: 'effectiveDate', label: 'Hiệu lực từ', type: 'date', required: true },
];

const taxFields: FieldDef[] = [
  { name: 'taxMethod', label: 'Cách tính thuế', type: 'select', required: true, options: options(labels.taxMethod) },
  { name: 'taxResidentStatus', label: 'Cư trú', type: 'select', options: options({ RESIDENT: 'Cư trú', NON_RESIDENT: 'Không cư trú' }) },
  { name: 'effectiveDate', label: 'Hiệu lực từ', type: 'date', required: true },
  { name: 'hasCommitment08', label: 'Có cam kết 08/CK-TNCN', type: 'checkbox' },
];

const statusFields: FieldDef[] = [
  { name: 'status', label: 'Trạng thái', type: 'select', required: true, options: options(labels.employmentStatus) },
  { name: 'dateTerminate', label: 'Ngày nghỉ việc (khi nghỉ việc)', type: 'date', nullable: true },
  { name: 'codeAttendance', label: 'Mã chấm công', nullable: true },
];

function EmploymentCard({ id, positions, onChanged }: { id: string; positions: Position[]; onChanged: () => void }) {
  const { data: emp, error, reload } = useFetch<Employment>(`/corehr/employments/${id}`);
  const [offboarding, setOffboarding] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const canWrite = useCanWrite('corehr');
  const close = () => setDialog(null);
  const saved = () => {
    setDialog(null);
    reload();
    onChanged();
  };

  if (error) return <ErrorBox error={error} />;
  if (!emp) return <Loading />;

  const assignFields: FieldDef[] = [
    {
      name: 'positionId',
      label: 'Vị trí',
      type: 'select',
      required: true,
      options: positions.map((p) => ({ value: p.id, label: `${p.code} · ${p.job.name} · ${p.orgStructure.name}` })),
    },
    { name: 'actionType', label: 'Loại thay đổi', type: 'select', options: options(labels.assignmentAction) },
    { name: 'effectiveDate', label: 'Hiệu lực từ', type: 'date', required: true },
    { name: 'actionReason', label: 'Lý do', full: true },
  ];

  return (
    <Card
      title={
        <div>
          <h2 style={{ display: 'inline' }}>{emp.codeEmp}</h2>{' '}
          <EmploymentStatus status={emp.status} />
          <div className="muted" style={{ fontSize: 13 }}>
            {emp.company?.name} · {labels.employmentType[emp.employmentType as keyof typeof labels.employmentType]} · vào làm{' '}
            {date(emp.dateHire)}
            {emp.probationEndDate && <> · hết thử việc {date(emp.probationEndDate)}</>}
            {emp.dateTerminate && <> · nghỉ việc {date(emp.dateTerminate)}</>}
          </div>
        </div>
      }
      actions={
        canWrite && (
          <>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog('status')}>Trạng thái</button>
            {emp.status !== 'TERMINATED' && (
              <button className="btn btn-sm btn-outline-danger" onClick={() => setOffboarding(true)}>
                <i className="bi bi-box-arrow-right me-1" />
                Cho nghỉ việc
              </button>
            )}
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog('assign')}>Gán vị trí</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog('salary')}>Thêm lương</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog('tax')}>Hồ sơ thuế</button>
          </>
        )
      }
    >
      <div className="stack">
        <div>
          <h3 className="h6 mb-2">Vị trí công việc</h3>
          <DataTable
            rows={emp.assignments ?? []}
            rowKey={(a) => a.id}
            empty="Chưa gán vị trí"
            columns={[
              { header: 'Vị trí', cell: (a) => `${a.position.code} · ${a.position.job?.name ?? ''}` },
              { header: 'Phòng ban', cell: (a) => a.orgStructure.name },
              { header: 'Loại', cell: (a) => labels.assignmentAction[a.actionType as keyof typeof labels.assignmentAction] ?? a.actionType },
              { header: 'Hiệu lực', cell: (a) => `${date(a.effectiveDate)} → ${a.endDate ? date(a.endDate) : 'nay'}`, className: 'nowrap' },
            ]}
          />
        </div>
        <div>
          <h3 className="h6 mb-2">Lương cơ bản</h3>
          <DataTable
            rows={emp.salaries ?? []}
            rowKey={(s) => s.id}
            empty="Chưa có lương — cần nhập lương thì mới tính lương được"
            columns={[
              { header: 'Lương cơ bản', cell: (s) => money(s.baseAmount), className: 'num' },
              { header: 'Lương đóng BH', cell: (s) => (s.insuranceSalary ? money(s.insuranceSalary) : '= lương CB'), className: 'num' },
              { header: 'Loại', cell: (s) => s.salaryType },
              { header: 'Hiệu lực', cell: (s) => `${date(s.effectiveDate)} → ${s.endDate ? date(s.endDate) : 'nay'}`, className: 'nowrap' },
            ]}
          />
        </div>
        <ContractsSection employmentId={id} />
        <ElementsSection employmentId={id} />
        <AdvancesSection employmentId={id} />
        <div>
          <h3 className="h6 mb-2">Hồ sơ thuế</h3>
          <DataTable
            rows={emp.taxProfiles ?? []}
            rowKey={(t) => t.id}
            empty="Chưa khai — mặc định tính thuế lũy tiến"
            columns={[
              { header: 'Cách tính', cell: (t) => labels.taxMethod[t.taxMethod as keyof typeof labels.taxMethod] },
              { header: 'Cư trú', cell: (t) => (t.taxResidentStatus === 'RESIDENT' ? 'Cư trú' : 'Không cư trú') },
              { header: 'Cam kết 08', cell: (t) => (t.hasCommitment08 ? 'Có' : '') },
              { header: 'Hiệu lực', cell: (t) => `${date(t.effectiveDate)} → ${t.endDate ? date(t.endDate) : 'nay'}`, className: 'nowrap' },
            ]}
          />
        </div>
      </div>

      {offboarding && (
        <OffboardModal
          employmentId={id}
          onClose={() => setOffboarding(false)}
          onDone={() => {
            setOffboarding(false);
            saved();
          }}
        />
      )}
      {dialog === 'status' && (
        <FormModal title="Đổi trạng thái hợp đồng" fields={statusFields} initial={emp} method="patch" path={`/corehr/employments/${id}`} onClose={close} onSaved={saved} />
      )}
      {dialog === 'assign' && (
        <FormModal
          title="Gán / đổi vị trí"
          fields={assignFields}
          initial={{ effectiveDate: todayISO() }}
          path="/corehr/assignments"
          transform={(b) => ({ ...b, employmentId: id })}
          onClose={close}
          onSaved={saved}
        >
          {positions.length === 0 && <div className="alert alert-info">Chưa có vị trí nào. Hãy tạo ở trang Tổ chức.</div>}
        </FormModal>
      )}
      {dialog === 'salary' && (
        <FormModal title="Thêm lương cơ bản" fields={salaryFields} initial={{ effectiveDate: todayISO(), salaryType: 'GROSS' }} path={`/corehr/employments/${id}/salaries`} onClose={close} onSaved={saved}>
          <p className="muted" style={{ marginTop: 0 }}>Dòng lương hiện tại sẽ tự kết thúc vào ngày trước ngày hiệu lực mới.</p>
        </FormModal>
      )}
      {dialog === 'tax' && (
        <FormModal title="Hồ sơ thuế" fields={taxFields} initial={{ effectiveDate: todayISO(), taxMethod: 'PROGRESSIVE', taxResidentStatus: 'RESIDENT' }} path={`/corehr/employments/${id}/tax-profiles`} onClose={close} onSaved={saved} />
      )}
    </Card>
  );
}

export default function EmploymentsTab({ personId, employmentIds, onChanged }: { personId: string; employmentIds: string[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const canWrite = useCanWrite('corehr');
  const companies = useFetch<Company[]>('/corehr/companies');
  const positions = useFetch<Position[]>('/corehr/positions');

  const fields: FieldDef[] = [
    { name: 'companyId', label: 'Công ty', type: 'select', required: true, options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
    { name: 'codeEmp', label: 'Mã nhân viên', required: true },
    { name: 'codeAttendance', label: 'Mã chấm công' },
    { name: 'employmentType', label: 'Loại lao động', type: 'select', options: options(labels.employmentType) },
    { name: 'dateHire', label: 'Ngày vào làm', type: 'date', required: true },
    { name: 'probationDays', label: 'Số ngày thử việc', type: 'number' },
  ];

  return (
    <div className="stack">
      {canWrite && (
        <div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Thêm hợp đồng lao động
          </button>
        </div>
      )}
      {employmentIds.length === 0 && <Card><div className="muted">Chưa có hợp đồng lao động.</div></Card>}
      {employmentIds.map((id) => (
        <EmploymentCard key={id} id={id} positions={positions.data ?? []} onChanged={onChanged} />
      ))}
      {adding && (
        <FormModal
          title="Thêm hợp đồng lao động"
          fields={fields}
          initial={{ companyId: companies.data?.length === 1 ? companies.data[0].id : '', dateHire: todayISO(), employmentType: 'EMPLOYEE' }}
          path="/corehr/employments"
          transform={(b) => ({ ...b, personId })}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onChanged();
          }}
        >
          <p className="muted" style={{ marginTop: 0 }}>Có số ngày thử việc thì trạng thái là “Thử việc”, không có thì “Đang làm việc”.</p>
        </FormModal>
      )}
    </div>
  );
}
