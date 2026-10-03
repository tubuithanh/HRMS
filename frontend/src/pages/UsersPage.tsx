import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { roleLabels, useAuth } from '../auth';
import { ActionButton, Badge, Card, DataTable, ErrorBox, FieldDef, FormModal, PageHeader } from '../components/ui';
import { useFetch } from '../lib/hooks';
import { dateTime, options } from '../lib/format';
import { OrgUnit, Person, UserAccount } from '../types/models';
import { Modal, useToast } from '../components/ui';
import { errorMessage } from '../api/client';
import { PASSWORD_RULE } from './ChangePasswordPage';

type Dialog = 'create' | { edit: UserAccount } | { reset: UserAccount } | { scope: UserAccount } | { groups: UserAccount } | null;

interface GroupLite {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const { data, error, loading, reload } = useFetch<UserAccount[]>('/auth/users');
  const persons = useFetch<Person[]>('/corehr/persons');
  const orgs = useFetch<OrgUnit[]>('/corehr/org');
  const orgName = (id: string) => orgs.data?.find((o) => o.id === id)?.name ?? '…';
  // Nhóm quyền: chỉ quản trị xem / gán được.
  const isAdmin = me?.role === 'ADMIN';
  const groups = useFetch<{ groups: GroupLite[] }>(isAdmin ? '/auth/permission-groups' : null);
  const groupList = groups.data?.groups ?? [];
  const groupNames = (u: UserAccount) =>
    u.role === 'ADMIN'
      ? 'Toàn quyền'
      : u.permissionGroupIds?.length
        ? u.permissionGroupIds.map((id) => groupList.find((g) => g.id === id)?.name ?? '…').join(', ')
        : `Theo vai trò (${roleLabels[u.role]})`;

  const personOptions = (persons.data ?? []).map((p) => ({ value: p.id, label: `${p.personCode} · ${p.fullName}` }));
  const roleOptions = options(roleLabels);
  const createFields: FieldDef[] = [
    { name: 'username', label: 'Tên đăng nhập', required: true, placeholder: 'a-z, 0-9, . _ -' },
    { name: 'password', label: 'Mật khẩu (8+ ký tự, có chữ và số)', type: 'password', required: true },
    { name: 'role', label: 'Vai trò', type: 'select', required: true, options: roleOptions },
    { name: 'personId', label: 'Gắn với nhân sự', type: 'select', options: personOptions },
    { name: 'mustChangePassword', label: 'Bắt đổi mật khẩu ở lần đăng nhập đầu', type: 'checkbox' },
  ];
  const editFields: FieldDef[] = [
    { name: 'role', label: 'Vai trò', type: 'select', required: true, options: roleOptions },
    { name: 'personId', label: 'Gắn với nhân sự', type: 'select', options: personOptions, nullable: true },
  ];
  const done = () => {
    setDialog(null);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Tài khoản"
        subtitle="Nhân viên cần được gắn với hồ sơ nhân sự để xem phiếu lương, xin nghỉ, chấm công"
        actions={
          <>
            {isAdmin && <Link to="/users/groups" className="btn btn-outline-primary"><i className="bi bi-shield-lock me-1" />Nhóm quyền</Link>}
            <button className="btn btn-primary" onClick={() => setDialog('create')}>+ Tài khoản</button>
          </>
        }
      />
      <Card flush>
        <ErrorBox error={error} />
        <DataTable
          rows={data}
          loading={loading}
          rowKey={(u) => u.id}
          columns={[
            { header: 'Tên đăng nhập', cell: (u) => <strong>{u.username}</strong> },
            { header: 'Vai trò', cell: (u) => <Badge tone={u.role === 'ADMIN' ? 'blue' : undefined}>{roleLabels[u.role]}</Badge> },
            ...(isAdmin ? [{ header: 'Nhóm quyền', cell: (u: UserAccount) => <span className="small">{groupNames(u)}</span> }] : []),
            { header: 'Nhân sự', cell: (u) => (u.person ? `${u.person.personCode} · ${u.person.fullName}` : <span className="muted">Chưa gắn</span>) },
            {
              header: 'Phạm vi dữ liệu',
              cell: (u) =>
                u.role === 'ADMIN' || u.role === 'EMPLOYEE' ? (
                  <span className="text-body-tertiary">—</span>
                ) : u.orgScope?.length ? (
                  <span className="small">{u.orgScope.map(orgName).join(', ')}</span>
                ) : (
                  <span className="small text-body-secondary">Toàn công ty</span>
                ),
            },
            { header: 'Đăng nhập gần nhất', cell: (u) => dateTime(u.lastLoginAt), className: 'nowrap' },
            {
              header: 'Trạng thái',
              cell: (u) => {
                const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                return (
                  <span className="d-flex flex-wrap gap-1">
                    {u.isActive ? <Badge tone="green">Hoạt động</Badge> : <Badge tone="red">Đã khoá</Badge>}
                    {locked && <Badge tone="yellow">Tạm khoá đến {dateTime(u.lockedUntil)}</Badge>}
                    {u.mustChangePassword && <Badge>Chờ đổi mật khẩu</Badge>}
                  </span>
                );
              },
            },
            {
              header: '',
              className: 'actions',
              cell: (u) => (
                <span className="toolbar" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ edit: u })}>Sửa</button>
                  {isAdmin && u.role !== 'ADMIN' && (
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ groups: u })}>Quyền</button>
                  )}
                  {(u.role === 'HR' || u.role === 'ACCOUNTANT') && (
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ scope: u })}>Phạm vi</button>
                  )}
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ reset: u })}>Đặt lại MK</button>
                  {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
                    <ActionButton label="Mở khoá" run={() => api.post(`/auth/users/${u.id}/unlock`)} success="Đã mở khoá" onDone={reload} />
                  )}
                  {u.id !== me?.id && (
                    <ActionButton
                      label={u.isActive ? 'Khoá' : 'Mở khoá'}
                      className={`btn btn-sm ${u.isActive ? 'btn-outline-danger' : 'btn-outline-secondary'}`}
                      confirm={u.isActive ? `Khoá tài khoản ${u.username}?` : undefined}
                      run={() => api.patch(`/auth/users/${u.id}`, { isActive: !u.isActive })}
                      success={u.isActive ? 'Đã khoá tài khoản' : 'Đã mở khoá'}
                      onDone={reload}
                    />
                  )}
                </span>
              ),
            },
          ]}
        />
      </Card>

      {dialog && typeof dialog === 'object' && 'scope' in dialog && (
        <ScopeModal user={dialog.scope} orgs={orgs.data ?? []} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog && typeof dialog === 'object' && 'groups' in dialog && (
        <GroupsModal user={dialog.groups} groups={groupList} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog === 'create' && (
        <FormModal title="Tạo tài khoản" fields={createFields} initial={{ role: 'EMPLOYEE', mustChangePassword: true }} path="/auth/users" successMessage="Đã tạo tài khoản" onClose={() => setDialog(null)} onSaved={done} />
      )}
      {dialog && typeof dialog === 'object' && 'edit' in dialog && (
        <FormModal title={`Sửa ${dialog.edit.username}`} fields={editFields} initial={dialog.edit} method="patch" path={`/auth/users/${dialog.edit.id}`} onClose={() => setDialog(null)} onSaved={done} />
      )}
      {dialog && typeof dialog === 'object' && 'reset' in dialog && (
        <FormModal
          title={`Đặt lại mật khẩu: ${dialog.reset.username}`}
          fields={[{ name: 'newPassword', label: 'Mật khẩu mới (ít nhất 8 ký tự)', type: 'password', required: true }]}
          path={`/auth/users/${dialog.reset.id}/reset-password`}
          successMessage="Đã đặt lại mật khẩu"
          onClose={() => setDialog(null)}
          onSaved={done}
        >
          <p className="small text-body-secondary mt-0">
            Người dùng sẽ phải đổi mật khẩu khi đăng nhập; các phiên đang mở của họ bị đăng xuất. {PASSWORD_RULE}
          </p>
        </FormModal>
      )}
    </>
  );
}

/** Chọn đơn vị cho phạm vi dữ liệu của một tài khoản nhân sự / kế toán. */
function ScopeModal(props: { user: UserAccount; orgs: OrgUnit[]; onClose: () => void; onDone: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set(props.user.orgScope ?? []));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // Hiển thị dạng cây: sắp theo cha → con
  const byParent = new Map<string | null, OrgUnit[]>();
  for (const o of props.orgs) byParent.set(o.parentId, [...(byParent.get(o.parentId) ?? []), o]);
  const ids = new Set(props.orgs.map((o) => o.id));
  const roots = props.orgs.filter((o) => !o.parentId || !ids.has(o.parentId));
  const rows: Array<{ o: OrgUnit; depth: number }> = [];
  const walk = (o: OrgUnit, depth: number) => {
    rows.push({ o, depth });
    for (const c of (byParent.get(o.id) ?? []).sort((a, b) => a.name.localeCompare(b.name))) walk(c, depth + 1);
  };
  roots.forEach((r) => walk(r, 0));
  const toggle = (id: string) => {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };
  async function save() {
    setBusy(true);
    try {
      await api.patch(`/auth/users/${props.user.id}`, { orgScope: [...sel] });
      toast(sel.size ? `Đã giới hạn ${props.user.username} trong ${sel.size} đơn vị` : `${props.user.username} xem được toàn công ty`);
      props.onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal title={`Phạm vi dữ liệu: ${props.user.username}`} onClose={props.onClose} width={640}>
      <ErrorBox error={error} />
      <p className="small text-body-secondary mt-0">
        Chọn đơn vị: tài khoản chỉ thấy và thao tác với nhân viên có vị trí chính thuộc các đơn vị này (kể cả đơn vị con) — hồ sơ, chấm công,
        nghỉ phép, lương, báo cáo, dashboard… Không chọn gì = toàn công ty. Nhân viên mới chưa gán vị trí thì mọi nhân sự đều thấy.
      </p>
      <div className="border rounded" style={{ maxHeight: 380, overflowY: 'auto' }}>
        {rows.map(({ o, depth }) => (
          <label key={o.id} className="d-flex align-items-center gap-2 px-2 py-1 border-bottom small" style={{ paddingLeft: 8 + depth * 18, cursor: 'pointer' }}>
            <input type="checkbox" className="form-check-input mt-0" checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
            <span className={depth === 0 ? 'fw-semibold' : ''}>{o.name}</span>
          </label>
        ))}
      </div>
      <div className="d-flex justify-content-between align-items-center mt-3">
        <button className="btn btn-link px-0" onClick={() => setSel(new Set())}>Bỏ chọn (toàn công ty)</button>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>Lưu</button>
        </div>
      </div>
    </Modal>
  );
}

/** Gán nhóm quyền cho tài khoản (không chọn nhóm nào = dùng nhóm theo vai trò). */
function GroupsModal(props: { user: UserAccount; groups: GroupLite[]; onClose: () => void; onDone: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set(props.user.permissionGroupIds ?? []));
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  async function save() {
    try {
      await api.patch(`/auth/users/${props.user.id}`, { permissionGroupIds: [...sel] });
      toast('Đã cập nhật nhóm quyền');
      props.onDone();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <Modal title={`Nhóm quyền: ${props.user.username}`} onClose={props.onClose}>
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <p className="small text-body-secondary mt-0">
        Quyền của tài khoản = gộp quyền các nhóm được chọn. Không chọn nhóm nào thì dùng nhóm theo vai trò (<strong>{roleLabels[props.user.role]}</strong>).
        Chỉnh quyền của từng nhóm ở trang <Link to="/users/groups">Nhóm quyền</Link>.
      </p>
      <div className="list-group mb-3">
        {props.groups.filter((g) => g.code !== 'ADMIN').map((g) => (
          <label key={g.id} className="list-group-item d-flex gap-2 align-items-center">
            <input
              type="checkbox"
              className="form-check-input mt-0"
              checked={sel.has(g.id)}
              onChange={(e) => {
                const s = new Set(sel);
                if (e.target.checked) s.add(g.id);
                else s.delete(g.id);
                setSel(s);
              }}
            />
            <span className="flex-grow-1">{g.name}</span>
            <code className="small">{g.code}</code>
          </label>
        ))}
      </div>
      <div className="d-flex justify-content-end gap-2">
        <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
        <button className="btn btn-primary" onClick={save}>Lưu</button>
      </div>
    </Modal>
  );
}
