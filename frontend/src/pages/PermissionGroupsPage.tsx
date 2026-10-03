import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { ActionButton, Badge, Card, ErrorBox, Loading, Modal, PageHeader, useToast } from '../components/ui';
import { useFetch } from '../lib/hooks';

interface Group {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
}
interface Data {
  modules: Array<{ key: string; label: string }>;
  groups: Group[];
}

/**
 * Nhóm quyền (chỉ quản trị): ma trận phân hệ × Xem / Sửa. Nhóm hệ thống (theo vai trò) sửa được quyền,
 * khôi phục được mặc định, không xoá được. Nhóm Quản trị luôn toàn quyền.
 */
export default function PermissionGroupsPage() {
  const { data, error, reload } = useFetch<Data>('/auth/permission-groups');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const selected = data.groups.find((g) => g.id === selectedId) ?? data.groups.find((g) => g.code !== 'ADMIN') ?? data.groups[0];

  return (
    <>
      <PageHeader
        title="Nhóm quyền"
        subtitle="Tích chọn quyền Xem / Sửa cho từng chức năng. Gán nhóm cho tài khoản ở trang Tài khoản; tài khoản chưa gán nhóm dùng nhóm theo vai trò."
        actions={
          <>
            <Link to="/users" className="btn btn-outline-secondary">← Tài khoản</Link>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nhóm quyền</button>
          </>
        }
      />
      <div className="row g-3">
        <div className="col-lg-4">
          <div className="list-group shadow-sm">
            {data.groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`list-group-item list-group-item-action d-flex align-items-start gap-2${g.id === selected?.id ? ' active' : ''}`}
                onClick={() => setSelectedId(g.id)}
              >
                <i className={`bi ${g.code === 'ADMIN' ? 'bi-shield-fill-check' : g.isSystem ? 'bi-shield' : 'bi-people'} mt-1`} />
                <span className="flex-grow-1 text-start">
                  <span className="d-block fw-semibold">{g.name}</span>
                  <span className={`d-block small ${g.id === selected?.id ? '' : 'text-body-secondary'}`}>
                    {g.code} · {g.userCount} tài khoản{g.isSystem ? ' · hệ thống' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="col-lg-8">
          {selected && <GroupEditor key={selected.id + selected.permissions.join()} group={selected} modules={data.modules} onChanged={reload} onDeleted={() => { setSelectedId(null); reload(); }} />}
        </div>
      </div>
      {creating && (
        <CreateGroupModal
          groups={data.groups}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setSelectedId(id);
            reload();
          }}
        />
      )}
    </>
  );
}

function GroupEditor(props: { group: Group; modules: Data['modules']; onChanged: () => void; onDeleted: () => void }) {
  const g = props.group;
  const toast = useToast();
  const isAdmin = g.code === 'ADMIN';
  const [perms, setPerms] = useState<Set<string>>(new Set(g.permissions));
  const [name, setName] = useState(g.name);
  const [description, setDescription] = useState(g.description ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setPerms(new Set(g.permissions)), [g.permissions]);

  const has = (p: string) => isAdmin || perms.has(p);
  const toggle = (module: string, action: 'read' | 'write', on: boolean) => {
    const s = new Set(perms);
    if (action === 'write') {
      if (on) s.add(`${module}:write`).add(`${module}:read`);
      else s.delete(`${module}:write`);
    } else if (on) s.add(`${module}:read`);
    else {
      s.delete(`${module}:read`);
      s.delete(`${module}:write`);
    }
    setPerms(s);
  };
  const setAll = (action: 'read' | 'write' | 'none') => {
    const s = new Set<string>();
    if (action !== 'none') for (const m of props.modules) {
      s.add(`${m.key}:read`);
      if (action === 'write') s.add(`${m.key}:write`);
    }
    setPerms(s);
  };
  const dirty = name !== g.name || description !== (g.description ?? '') || [...perms].sort().join() !== [...g.permissions].sort().join();

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/auth/permission-groups/${g.id}`, { name, description: description || null, ...(isAdmin ? {} : { permissions: [...perms] }) });
      toast(`Đã lưu nhóm ${name}`);
      props.onChanged();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={
        <div className="d-flex align-items-center gap-2">
          <h2 className="h6 mb-0">{g.name}</h2>
          <code className="small">{g.code}</code>
          {g.isSystem && <Badge>Nhóm hệ thống</Badge>}
        </div>
      }
    >
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <div className="row g-2 mb-3">
        <div className="col-md-5">
          <label className="form-label small">Tên nhóm</label>
          <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="col-md-7">
          <label className="form-label small">Mô tả</label>
          <input className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      {isAdmin ? (
        <div className="alert alert-info small">Nhóm Quản trị luôn có toàn quyền (kể cả Nhóm quyền) để không bao giờ mất quyền quản trị hệ thống.</div>
      ) : (
        <div className="d-flex flex-wrap gap-2 mb-2 small">
          <span className="text-body-secondary me-1">Chọn nhanh:</span>
          <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setAll('read')}>Xem tất cả</button>
          <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setAll('write')}>Toàn quyền</button>
          <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setAll('none')}>Bỏ hết</button>
        </div>
      )}
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-2">
          <thead>
            <tr>
              <th>Chức năng</th>
              <th className="text-center" style={{ width: 90 }}>Xem</th>
              <th className="text-center" style={{ width: 130 }}>Thêm / sửa / duyệt</th>
            </tr>
          </thead>
          <tbody>
            {props.modules.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                {(['read', 'write'] as const).map((a) => (
                  <td key={a} className="text-center">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      aria-label={`${m.label} — ${a === 'read' ? 'xem' : 'sửa'}`}
                      checked={has(`${m.key}:${a}`)}
                      disabled={isAdmin}
                      onChange={(e) => toggle(m.key, a, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small text-body-secondary">
        Quyền sửa đã gồm quyền xem. Cổng nhân viên (hồ sơ, chấm công, nghỉ phép, phiếu lương của chính mình) luôn có cho mọi tài khoản.
        Thay đổi có hiệu lực trong tối đa 1 phút.
      </p>
      <div className="d-flex flex-wrap gap-2 justify-content-end">
        {g.isSystem && !isAdmin && (
          <ActionButton
            label="Khôi phục mặc định"
            className="btn btn-outline-secondary"
            confirm={`Khôi phục quyền mặc định của nhóm ${g.name}?`}
            run={() => api.post(`/auth/permission-groups/${g.id}/reset`)}
            success="Đã khôi phục"
            onDone={props.onChanged}
          />
        )}
        {!g.isSystem && (
          <ActionButton
            label="Xoá nhóm"
            className="btn btn-outline-danger"
            confirm={`Xoá nhóm quyền ${g.name}?`}
            run={() => api.delete(`/auth/permission-groups/${g.id}`)}
            success="Đã xoá nhóm"
            onDone={props.onDeleted}
          />
        )}
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
      </div>
    </Card>
  );
}

function CreateGroupModal(props: { groups: Group[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setErr(null);
    try {
      const src = props.groups.find((g) => g.id === copyFrom);
      const r = await api.post('/auth/permission-groups', { code: code.trim().toUpperCase(), name, permissions: src?.permissions ?? [] });
      props.onCreated(r.data.data.id);
    } catch (e) {
      const details = (e as { response?: { data?: { error?: { details?: Record<string, string[]> } } } }).response?.data?.error?.details;
      setErr(details ? Object.values(details).flat().join(' · ') : errorMessage(e));
    }
  }
  return (
    <Modal title="Thêm nhóm quyền" onClose={props.onClose}>
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <div className="mb-3">
        <label className="form-label">Mã nhóm</label>
        <input className="form-control" placeholder="VD: TRUONG_PHONG_NS" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </div>
      <div className="mb-3">
        <label className="form-label">Tên nhóm</label>
        <input className="form-control" placeholder="VD: Trưởng phòng nhân sự" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="form-label">Sao chép quyền từ</label>
        <select className="form-select" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
          <option value="">— Không (bắt đầu trống) —</option>
          {props.groups.filter((g) => g.code !== 'ADMIN').map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <div className="d-flex justify-content-end gap-2">
        <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
        <button className="btn btn-primary" disabled={!code || !name} onClick={submit}>Tạo nhóm</button>
      </div>
    </Modal>
  );
}
