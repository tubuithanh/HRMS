import { useState } from 'react';
import { api } from '../api/client';
import { roleLabels, useAuth } from '../auth';
import { ActionButton, Badge, Card, DataTable, ErrorBox, FieldDef, FormModal, PageHeader } from '../components/ui';
import { useFetch } from '../lib/hooks';
import { dateTime, options } from '../lib/format';
import { Person, UserAccount } from '../types/models';
import { PASSWORD_RULE } from './ChangePasswordPage';

type Dialog = 'create' | { edit: UserAccount } | { reset: UserAccount } | null;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const { data, error, loading, reload } = useFetch<UserAccount[]>('/auth/users');
  const persons = useFetch<Person[]>('/corehr/persons');

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
        actions={<button className="btn btn-primary" onClick={() => setDialog('create')}>+ Tài khoản</button>}
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
            { header: 'Nhân sự', cell: (u) => (u.person ? `${u.person.personCode} · ${u.person.fullName}` : <span className="muted">Chưa gắn</span>) },
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
