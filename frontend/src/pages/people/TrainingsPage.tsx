import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useCanWrite } from '../../auth';
import EmployeePicker from '../../components/EmployeePicker';
import { ActionButton, Card, DataTable, ErrorBox, FieldDef, FormModal, Loading, Modal, PageHeader, useToast } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, money, options } from '../../lib/format';

export const COURSE_STATUS: Record<string, string> = { PLANNED: 'Kế hoạch', ONGOING: 'Đang học', DONE: 'Đã xong', CANCELLED: 'Huỷ' };
const STATUS_TONE: Record<string, string> = { PLANNED: 'text-bg-info', ONGOING: 'text-bg-primary', DONE: 'text-bg-success', CANCELLED: 'text-bg-secondary' };
export const RESULT: Record<string, string> = { REGISTERED: 'Đã đăng ký', PASSED: 'Đạt', FAILED: 'Không đạt', ABSENT: 'Vắng' };
const RESULT_TONE: Record<string, string> = { REGISTERED: 'text-bg-light border', PASSED: 'text-bg-success', FAILED: 'text-bg-danger', ABSENT: 'text-bg-secondary' };

interface Course {
  id: string;
  code: string;
  name: string;
  provider: string | null;
  location: string | null;
  startDate: string;
  endDate: string;
  costPerPerson: string;
  commitmentMonths: number;
  status: string;
  description: string | null;
  _count?: { participants: number };
}

interface Participant {
  id: string;
  result: string;
  score: string | null;
  certificateNo: string | null;
  certificateExpiry: string | null;
  note: string | null;
  employment: { id: string; codeEmp: string; status: string; person: { id: string; fullName: string } };
}

const courseFields = (edit: boolean): FieldDef[] => [
  ...(edit ? [] : [{ name: 'code', label: 'Mã khoá', required: true } as FieldDef]),
  { name: 'name', label: 'Tên khoá học', required: true, full: true },
  { name: 'provider', label: 'Đơn vị đào tạo', nullable: true },
  { name: 'location', label: 'Địa điểm', nullable: true },
  { name: 'startDate', label: 'Từ ngày', type: 'date', required: true },
  { name: 'endDate', label: 'Đến ngày', type: 'date', required: true },
  { name: 'costPerPerson', label: 'Chi phí / người (VND)', type: 'number' },
  { name: 'commitmentMonths', label: 'Cam kết làm việc sau khoá (tháng)', type: 'number' },
  { name: 'status', label: 'Trạng thái', type: 'select', options: options(COURSE_STATUS) },
  { name: 'description', label: 'Ghi chú / điều khoản cam kết', type: 'textarea', full: true, nullable: true },
];

export const CourseBadge = ({ status }: { status: string }) => <span className={`badge ${STATUS_TONE[status] ?? ''}`}>{COURSE_STATUS[status] ?? status}</span>;
export const ResultBadge = ({ result }: { result: string }) => <span className={`badge ${RESULT_TONE[result] ?? ''}`}>{RESULT[result] ?? result}</span>;

export default function TrainingsPage() {
  const canWrite = useCanWrite('people');
  const [creating, setCreating] = useState(false);
  const list = useFetch<Course[]>('/people/trainings');
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Đào tạo" actions={canWrite && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Khoá học</button>} />
      <Card flush>
        <ErrorBox error={list.error} />
        <DataTable
          rows={list.data}
          loading={list.loading}
          rowKey={(c) => c.id}
          empty="Chưa có khoá học"
          columns={[
            { header: 'Mã', cell: (c) => <Link to={`/trainings/${c.id}`}>{c.code}</Link> },
            { header: 'Khoá học', cell: (c) => <>{c.name}<div className="small text-body-secondary">{c.provider}</div></> },
            { header: 'Thời gian', cell: (c) => `${date(c.startDate)} – ${date(c.endDate)}`, className: 'nowrap' },
            { header: 'Học viên', cell: (c) => c._count?.participants ?? 0, className: 'num' },
            { header: 'Chi phí / người', cell: (c) => money(c.costPerPerson), className: 'num' },
            { header: 'Cam kết', cell: (c) => (c.commitmentMonths ? `${c.commitmentMonths} tháng` : '—') },
            { header: 'Trạng thái', cell: (c) => <CourseBadge status={c.status} /> },
          ]}
        />
      </Card>
      {creating && (
        <FormModal
          title="Thêm khoá học"
          fields={courseFields(false)}
          initial={{ status: 'PLANNED', costPerPerson: 0, commitmentMonths: 0 }}
          path="/people/trainings"
          onClose={() => setCreating(false)}
          onSaved={(d) => navigate(`/trainings/${(d as { id: string }).id}`)}
        />
      )}
    </>
  );
}

function ResultModal(props: { p: Participant; onClose: () => void; onDone: () => void }) {
  return (
    <FormModal
      title={`Kết quả: ${props.p.employment.person.fullName}`}
      fields={[
        { name: 'result', label: 'Kết quả', type: 'select', options: options(RESULT) },
        { name: 'score', label: 'Điểm (0–100)', type: 'number', nullable: true },
        { name: 'certificateNo', label: 'Số chứng chỉ', nullable: true },
        { name: 'certificateExpiry', label: 'Chứng chỉ hết hạn', type: 'date', nullable: true },
        { name: 'note', label: 'Ghi chú', nullable: true, full: true },
      ]}
      initial={props.p}
      method="patch"
      path={`/people/participants/${props.p.id}`}
      onClose={props.onClose}
      onSaved={props.onDone}
    />
  );
}

export function TrainingDetailPage() {
  const { id } = useParams();
  const canWrite = useCanWrite('people');
  const course = useFetch<Course & { participants: Participant[]; commitmentEnd: string | null }>(`/people/trainings/${id}`);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<Participant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  const c = course.data;
  if (course.error) return <ErrorBox error={course.error} />;
  if (!c) return <Loading />;
  const passed = c.participants.filter((p) => p.result === 'PASSED').length;

  async function addPeople() {
    try {
      const r = await api.post(`/people/trainings/${c!.id}/participants`, { employmentIds: picked });
      toast(`Đã thêm ${r.data.data.added} học viên`);
      setAdding(false);
      setPicked([]);
      course.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title={`${c.code} · ${c.name}`}
        subtitle={<Link to="/trainings">← Danh sách khoá học</Link>}
        actions={
          canWrite && (
            <>
              <button className="btn btn-outline-secondary" onClick={() => setEditing(true)}>Sửa</button>
              <ActionButton
                className="btn btn-outline-danger"
                label="Xoá"
                confirm="Xoá khoá học và danh sách học viên?"
                run={() => api.delete(`/people/trainings/${c.id}`)}
                onDone={() => navigate('/trainings')}
              />
            </>
          )
        }
      />
      <div className="row g-3 mb-3">
        {([
          ['Trạng thái', <CourseBadge key="s" status={c.status} />],
          ['Thời gian', `${date(c.startDate)} – ${date(c.endDate)}`],
          ['Đơn vị / địa điểm', [c.provider, c.location].filter(Boolean).join(' · ') || '—'],
          ['Chi phí / người', `${money(c.costPerPerson)}đ`],
          ['Cam kết', c.commitmentMonths ? `${c.commitmentMonths} tháng (đến ${date(c.commitmentEnd)})` : 'Không'],
          ['Kết quả', `${passed}/${c.participants.length} đạt`],
        ] as Array<[string, React.ReactNode]>).map(([k, v]) => (
          <div key={k} className="col-6 col-md-4 col-xl-2">
            <div className="card card-body py-2 h-100">
              <div className="small text-body-secondary">{k}</div>
              <div className="fw-semibold">{v}</div>
            </div>
          </div>
        ))}
      </div>
      {c.description && <div className="alert alert-light border small">{c.description}</div>}
      <Card
        flush
        title={`Học viên (${c.participants.length})`}
        actions={canWrite && <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>+ Thêm học viên</button>}
      >
        <DataTable
          rows={c.participants}
          rowKey={(p) => p.id}
          empty="Chưa có học viên"
          columns={[
            { header: 'Mã NV', cell: (p) => p.employment.codeEmp },
            { header: 'Họ tên', cell: (p) => <Link to={`/persons/${p.employment.person.id}`}>{p.employment.person.fullName}</Link> },
            { header: 'Kết quả', cell: (p) => <ResultBadge result={p.result} /> },
            { header: 'Điểm', cell: (p) => (p.score !== null ? Number(p.score) : '—'), className: 'num' },
            { header: 'Chứng chỉ', cell: (p) => p.certificateNo ?? '—' },
            { header: 'Hết hạn', cell: (p) => (p.certificateExpiry ? date(p.certificateExpiry) : '—') },
            {
              header: '',
              className: 'actions',
              cell: (p) =>
                canWrite && (
                  <div className="d-flex gap-1 justify-content-end">
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setResult(p)}>Kết quả</button>
                    <ActionButton
                      className="btn btn-sm btn-outline-danger"
                      label={<i className="bi bi-x-lg" />}
                      confirm="Bỏ học viên khỏi khoá?"
                      run={() => api.delete(`/people/participants/${p.id}`)}
                      onDone={course.reload}
                    />
                  </div>
                ),
            },
          ]}
        />
      </Card>
      {editing && (
        <FormModal
          title="Sửa khoá học"
          fields={courseFields(true)}
          initial={{ ...c, costPerPerson: Number(c.costPerPerson) }}
          method="patch"
          path={`/people/trainings/${c.id}`}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); course.reload(); }}
        />
      )}
      {adding && (
        <Modal title="Thêm học viên" onClose={() => setAdding(false)} width={640}>
          <ErrorBox error={error} />
          <EmployeePicker value={picked} onChange={setPicked} height={380} />
          <div className="d-flex justify-content-end gap-2 mt-3">
            <button className="btn btn-outline-secondary" onClick={() => setAdding(false)}>Huỷ</button>
            <button className="btn btn-primary" disabled={picked.length === 0} onClick={addPeople}>Thêm {picked.length} người</button>
          </div>
        </Modal>
      )}
      {result && <ResultModal p={result} onClose={() => setResult(null)} onDone={() => { setResult(null); course.reload(); }} />}
    </>
  );
}
