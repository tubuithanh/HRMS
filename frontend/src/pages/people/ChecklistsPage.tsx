import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth, useCanWrite } from '../../auth';
import { ActionButton, Card, DataTable, ErrorBox, FormModal, Loading, Modal, PageHeader, Tabs, useToast } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, todayISO } from '../../lib/format';
import { Employment } from '../../types/models';

export const OWNERS: Record<string, string> = { HR: 'Nhân sự', IT: 'IT / quản trị', MANAGER: 'Quản lý trực tiếp', EMPLOYEE: 'Nhân viên', ACCOUNTANT: 'Kế toán' };
export const KIND: Record<string, string> = { ONBOARDING: 'Tiếp nhận', OFFBOARDING: 'Nghỉ việc' };

interface Row {
  id: string;
  kind: string;
  name: string;
  startDate: string;
  status: string;
  total: number;
  done: number;
  overdue: number;
  employment: { id: string; codeEmp: string; person: { id: string; fullName: string } };
}
interface Task {
  id: string;
  title: string;
  owner: string;
  dueDate: string | null;
  doneAt: string | null;
  note: string | null;
  refType: string | null;
}
interface Template {
  id: string;
  kind: string;
  name: string;
  isDefault: boolean;
  items: Array<{ title: string; owner: string; dueDays: number }>;
}

export function Progress({ done, total, overdue }: { done: number; total: number; overdue?: number }) {
  return (
    <div style={{ minWidth: 160 }}>
      <div className="progress" style={{ height: 8 }}>
        <div className="progress-bar bg-success" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <div className="small text-body-secondary">
        {done}/{total} việc{overdue ? <span className="text-danger"> · {overdue} quá hạn</span> : ''}
      </div>
    </div>
  );
}

function StartModal(props: { onClose: () => void; onDone: (id: string) => void }) {
  const emps = useFetch<Employment[]>('/corehr/employments');
  return (
    <FormModal
      title="Mở danh sách việc"
      fields={[
        { name: 'employmentId', label: 'Nhân viên', type: 'select', required: true, options: (emps.data ?? []).map((e) => ({ value: e.id, label: `${e.codeEmp} · ${e.person?.fullName}${e.status === 'TERMINATED' ? ' (đã nghỉ)' : ''}` })) },
        { name: 'kind', label: 'Loại', type: 'select', required: true, options: [{ value: 'ONBOARDING', label: 'Tiếp nhận nhân viên mới' }, { value: 'OFFBOARDING', label: 'Cho nghỉ việc' }] },
        { name: 'startDate', label: 'Ngày bắt đầu (vào làm / nghỉ việc)', type: 'date', required: true },
      ]}
      initial={{ kind: 'ONBOARDING', startDate: todayISO() }}
      path="/checklists"
      onClose={props.onClose}
      onSaved={(d) => props.onDone((d as { id: string }).id)}
    >
      <p className="muted mt-0">Tạo nhân viên mới hoặc cho nghỉ việc thì hệ thống tự mở danh sách theo mẫu mặc định.</p>
    </FormModal>
  );
}

function TemplateEditor(props: { t: Template | null; onClose: () => void; onDone: () => void }) {
  const [t, setT] = useState<Omit<Template, 'id'>>(props.t ?? { kind: 'ONBOARDING', name: '', isDefault: false, items: [{ title: '', owner: 'HR', dueDays: 0 }] });
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const setItem = (i: number, p: Partial<Template['items'][number]>) => setT({ ...t, items: t.items.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  async function save() {
    try {
      if (props.t) await api.put(`/checklists/templates/${props.t.id}`, t);
      else await api.post('/checklists/templates', t);
      toast('Đã lưu mẫu');
      props.onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal title={props.t ? `Sửa mẫu: ${props.t.name}` : 'Mẫu mới'} onClose={props.onClose} width={820}>
      <ErrorBox error={error} />
      <div className="row g-2 mb-2">
        <div className="col-md-3">
          <label className="form-label">Loại</label>
          <select className="form-select" value={t.kind} onChange={(e) => setT({ ...t, kind: e.target.value })}>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label">Tên mẫu</label>
          <input className="form-control" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
        </div>
        <div className="col-md-3 d-flex align-items-end">
          <label className="form-check">
            <input type="checkbox" className="form-check-input" checked={t.isDefault} onChange={(e) => setT({ ...t, isDefault: e.target.checked })} />
            <span className="form-check-label">Mẫu mặc định</span>
          </label>
        </div>
      </div>
      <table className="table table-sm align-middle">
        <thead><tr><th>Việc</th><th style={{ width: 170 }}>Người làm</th><th style={{ width: 110 }}>Hạn (ngày)</th><th style={{ width: 40 }} /></tr></thead>
        <tbody>
          {t.items.map((it, i) => (
            <tr key={i}>
              <td><input className="form-control form-control-sm" value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} /></td>
              <td>
                <select className="form-select form-select-sm" value={it.owner} onChange={(e) => setItem(i, { owner: e.target.value })}>
                  {Object.entries(OWNERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              <td><input type="number" className="form-control form-control-sm" value={it.dueDays} onChange={(e) => setItem(i, { dueDays: Number(e.target.value) })} /></td>
              <td><button className="btn btn-sm btn-light text-danger" onClick={() => setT({ ...t, items: t.items.filter((_, k) => k !== i) })} aria-label="Xoá"><i className="bi bi-x-lg" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="d-flex justify-content-between">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => setT({ ...t, items: [...t.items, { title: '', owner: 'HR', dueDays: 0 }] })}>+ Thêm việc</button>
        <span className="small text-body-secondary">Hạn tính từ ngày vào làm / nghỉ việc (âm = trước ngày đó)</span>
      </div>
      <div className="d-flex justify-content-end gap-2 mt-3">
        <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
        <button className="btn btn-primary" disabled={!t.name.trim() || t.items.some((x) => !x.title.trim())} onClick={save}>Lưu</button>
      </div>
    </Modal>
  );
}

export default function ChecklistsPage() {
  const canWrite = useCanWrite('corehr');
  const [tab, setTab] = useState<'OPEN' | 'DONE' | 'TEMPLATES'>('OPEN');
  const [kind, setKind] = useState('');
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const navigate = useNavigate();
  const list = useFetch<Row[]>(tab === 'TEMPLATES' ? null : `/checklists?status=${tab}${kind ? `&kind=${kind}` : ''}`, [tab, kind]);
  const templates = useFetch<Template[]>(tab === 'TEMPLATES' ? '/checklists/templates' : null, [tab]);
  return (
    <>
      <PageHeader title="Tiếp nhận / nghỉ việc" subtitle="Danh sách việc cần làm khi nhân viên vào làm và khi nghỉ việc" actions={canWrite && <button className="btn btn-primary" onClick={() => setStarting(true)}>+ Mở danh sách</button>} />
      <Tabs tabs={[{ key: 'OPEN', label: 'Đang thực hiện' }, { key: 'DONE', label: 'Đã xong' }, { key: 'TEMPLATES', label: 'Mẫu' }]} active={tab} onChange={setTab} />
      {tab !== 'TEMPLATES' ? (
        <Card
          flush
          actions={
            <select className="form-select form-select-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          }
        >
          <ErrorBox error={list.error} />
          <DataTable
            rows={list.data}
            loading={list.loading}
            rowKey={(r) => r.id}
            empty="Không có danh sách nào"
            columns={[
              { header: 'Loại', cell: (r) => <span className={`badge ${r.kind === 'ONBOARDING' ? 'text-bg-success' : 'text-bg-secondary'}`}>{KIND[r.kind]}</span> },
              { header: 'Nhân viên', cell: (r) => <Link to={`/tasks/${r.id}`}>{r.employment.person.fullName}</Link> },
              { header: 'Ngày', cell: (r) => date(r.startDate) },
              { header: 'Tiến độ', cell: (r) => <Progress done={r.done} total={r.total} overdue={r.overdue} /> },
            ]}
          />
        </Card>
      ) : (
        <Card flush actions={canWrite && <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>+ Mẫu</button>}>
          <DataTable
            rows={templates.data}
            loading={templates.loading}
            rowKey={(t) => t.id}
            columns={[
              { header: 'Loại', cell: (t) => KIND[t.kind] },
              { header: 'Tên mẫu', cell: (t) => <>{t.name}{t.isDefault && <span className="badge text-bg-primary ms-2">Mặc định</span>}</> },
              { header: 'Số việc', cell: (t) => t.items.length, className: 'num' },
              {
                header: '',
                className: 'actions',
                cell: (t) =>
                  canWrite && (
                    <div className="d-flex gap-1 justify-content-end">
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(t)}>Sửa</button>
                      <ActionButton className="btn btn-sm btn-outline-danger" label={<i className="bi bi-trash" />} confirm="Xoá mẫu?" run={() => api.delete(`/checklists/templates/${t.id}`)} onDone={templates.reload} />
                    </div>
                  ),
              },
            ]}
          />
        </Card>
      )}
      {starting && <StartModal onClose={() => setStarting(false)} onDone={(id) => navigate(`/tasks/${id}`)} />}
      {editing && <TemplateEditor t={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); templates.reload(); }} />}
    </>
  );
}

/** Chi tiết một danh sách việc — dùng cho nhân sự, quản lý và chính nhân viên (mỗi người đánh dấu việc của vai trò mình). */
export function ChecklistDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, reload } = useFetch<{ id: string; kind: string; name: string; startDate: string; status: string; employment: Row['employment']; tasks: Task[]; myOwners: string[] }>(`/me/checklists/${id}`);
  const [adding, setAdding] = useState(false);
  const staff = user?.role === 'ADMIN' || user?.role === 'HR';
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const today = todayISO();
  const groups = Object.keys(OWNERS).filter((o) => data.tasks.some((t) => t.owner === o));
  const done = data.tasks.filter((t) => t.doneAt).length;
  return (
    <>
      <PageHeader
        title={`${KIND[data.kind]}: ${data.employment.person.fullName}`}
        subtitle={<>{data.name} · {data.kind === 'ONBOARDING' ? 'vào làm' : 'nghỉ việc'} {date(data.startDate)} · {data.status === 'DONE' ? 'đã xong' : 'đang thực hiện'}</>}
        actions={staff && <button className="btn btn-outline-primary" onClick={() => setAdding(true)}>+ Thêm việc</button>}
      />
      <div className="mb-3" style={{ maxWidth: 360 }}><Progress done={done} total={data.tasks.length} /></div>
      {groups.map((o) => (
        <Card key={o} title={OWNERS[o]} flush>
          <ul className="list-group list-group-flush">
            {data.tasks.filter((t) => t.owner === o).map((t) => {
              const can = data.myOwners.includes(t.owner) && !(t.refType === 'ASSET_RETURN' && !t.doneAt);
              const overdue = !t.doneAt && t.dueDate && t.dueDate.slice(0, 10) < today;
              return (
                <li key={t.id} className="list-group-item d-flex align-items-center gap-2">
                  <ActionButton
                    className={`btn btn-sm ${t.doneAt ? 'btn-success' : 'btn-outline-secondary'}`}
                    label={<i className={`bi ${t.doneAt ? 'bi-check-lg' : 'bi-square'}`} />}
                    disabled={!can}
                    run={() => api.post(`/me/checklist-tasks/${t.id}`, { done: !t.doneAt })}
                    onDone={reload}
                  />
                  <div className="flex-grow-1">
                    <div className={t.doneAt ? 'text-decoration-line-through text-body-secondary' : ''}>{t.title}</div>
                    <div className="small text-body-secondary">
                      {t.dueDate && <span className={overdue ? 'text-danger' : ''}>hạn {date(t.dueDate)}</span>}
                      {t.doneAt && <> · xong {date(t.doneAt)}</>}
                      {t.note && <> · {t.note}</>}
                      {t.refType === 'ASSET_RETURN' && !t.doneAt && <> · <Link to="/assets">ghi nhận thu hồi ở trang Tài sản</Link></>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      {adding && (
        <FormModal
          title="Thêm việc"
          fields={[
            { name: 'title', label: 'Việc cần làm', required: true, full: true },
            { name: 'owner', label: 'Người làm', type: 'select', required: true, options: Object.entries(OWNERS).map(([value, label]) => ({ value, label })) },
            { name: 'dueDate', label: 'Hạn', type: 'date' },
          ]}
          initial={{ owner: 'HR' }}
          path={`/checklists/${data.id}/tasks`}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); reload(); }}
        />
      )}
    </>
  );
}

/** Việc của tôi (theo vai trò / là quản lý / là chính nhân viên). */
export function MyTasksPage() {
  const { data, loading, reload } = useFetch<Array<Task & { checklist: { id: string; kind: string; name: string; employment: Row['employment'] } }>>('/me/tasks');
  const today = todayISO();
  return (
    <>
      <PageHeader title="Việc cần làm" subtitle="Việc tiếp nhận nhân viên mới / nghỉ việc được giao cho bạn" />
      <Card flush>
        <DataTable
          rows={data}
          loading={loading}
          rowKey={(t) => t.id}
          empty="Không có việc nào 🎉"
          columns={[
            {
              header: '',
              cell: (t) => (
                <ActionButton
                  className="btn btn-sm btn-outline-secondary"
                  label={<i className="bi bi-square" />}
                  disabled={t.refType === 'ASSET_RETURN'}
                  run={() => api.post(`/me/checklist-tasks/${t.id}`, { done: true })}
                  success="Đã xong"
                  onDone={reload}
                />
              ),
            },
            { header: 'Việc', cell: (t) => <>{t.title}<div className="small text-body-secondary">{OWNERS[t.owner]}</div></> },
            { header: 'Nhân viên', cell: (t) => <Link to={`/tasks/${t.checklist.id}`}>{KIND[t.checklist.kind]}: {t.checklist.employment.person.fullName}</Link> },
            { header: 'Hạn', cell: (t) => (t.dueDate ? <span className={t.dueDate.slice(0, 10) < today ? 'text-danger fw-semibold' : ''}>{date(t.dueDate)}</span> : '—'), className: 'nowrap' },
          ]}
        />
      </Card>
    </>
  );
}
