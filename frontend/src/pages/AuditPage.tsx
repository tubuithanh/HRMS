import { Fragment, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, PageHeader } from '../components/ui';
import { useFetch } from '../lib/hooks';
import { dateTime } from '../lib/format';

interface AuditRow {
  id: string;
  at: string;
  requestId: string | null;
  username: string | null;
  ip: string | null;
  kind: 'REQUEST' | 'CHANGE' | 'AUTH';
  action: string;
  entity: string | null;
  entityId: string | null;
  summary: string | null;
  status: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

interface Page {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditRow[];
}

const ENTITY: Record<string, string> = {
  person: 'Hồ sơ nhân sự',
  employment: 'Quá trình làm việc',
  assignment: 'Vị trí công việc',
  employee_salary: 'Lương cơ bản',
  employee_tax_profile: 'Hồ sơ thuế',
  employee_element: 'Khoản cố định',
  period_element: 'Khoản phát sinh',
  pay_period: 'Kỳ lương',
  pay_element: 'Danh mục khoản lương',
  advance: 'Tạm ứng',
  labor_contract: 'Hợp đồng lao động',
  dependant: 'Người phụ thuộc',
  leave_request: 'Đơn nghỉ',
  leave_type: 'Loại nghỉ',
  overtime_request: 'Làm thêm giờ',
  attendance_record: 'Chấm công',
  holiday: 'Ngày lễ',
  org_structure: 'Đơn vị tổ chức',
  position: 'Vị trí định biên',
  job: 'Chức danh',
  app_user: 'Tài khoản',
  job_opening: 'Tin tuyển dụng',
  job_application: 'Hồ sơ ứng tuyển',
};

const ACTION: Record<string, [string, 'green' | 'blue' | 'red' | 'yellow' | undefined]> = {
  CREATE: ['Tạo', 'green'],
  UPDATE: ['Sửa', 'blue'],
  DELETE: ['Xoá', 'red'],
  CREATE_MANY: ['Tạo nhiều', 'green'],
  UPDATE_MANY: ['Sửa nhiều', 'blue'],
  DELETE_MANY: ['Xoá nhiều', 'red'],
  LOGIN: ['Đăng nhập', 'green'],
  LOGIN_FAILED: ['Đăng nhập sai', 'red'],
};

const IGNORED = new Set(['updatedAt', 'createdAt']);

function show(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Bảng các trường thay đổi (sửa) hoặc toàn bộ trường (tạo/xoá/request). */
function Detail({ row }: { row: AuditRow }) {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !IGNORED.has(k));
  const changed = row.action === 'UPDATE' ? keys.filter((k) => show(before[k]) !== show(after[k])) : keys;
  if (changed.length === 0) return <div className="muted small">Không có trường nào thay đổi.</div>;
  const twoCols = row.kind === 'CHANGE' && row.action === 'UPDATE';
  return (
    <table className="table table-sm mb-0 small" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th style={{ width: 200 }}>Trường</th>
          {twoCols ? (
            <>
              <th>Trước</th>
              <th>Sau</th>
            </>
          ) : (
            <th>Giá trị</th>
          )}
        </tr>
      </thead>
      <tbody>
        {changed.map((k) => (
          <tr key={k}>
            <td className="font-monospace">{k}</td>
            {twoCols ? (
              <>
                <td className="text-danger-emphasis text-break">{show(before[k])}</td>
                <td className="text-success-emphasis text-break">{show(after[k])}</td>
              </>
            ) : (
              <td className="text-break">{show(row.action === 'DELETE' ? before[k] : after[k])}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AuditPage() {
  const [filters, setFilters] = useState({ from: '', to: '', username: '', kind: '', entity: '', q: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const { data, error, loading } = useFetch<Page>(`/audit?${params}`);
  const set = (k: keyof typeof filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const pages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1;

  return (
    <>
      <PageHeader title="Nhật ký thao tác" subtitle="Ai đã làm gì, lúc nào — gồm cả giá trị trước và sau khi sửa. Chỉ ghi các thao tác thành công." />
      <div className="card shadow-sm mb-3">
        <div className="card-body row g-2 align-items-end">
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Từ ngày</label>
            <input type="date" className="form-control form-control-sm" value={filters.from} onChange={(e) => set('from', e.target.value)} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Đến ngày</label>
            <input type="date" className="form-control form-control-sm" value={filters.to} onChange={(e) => set('to', e.target.value)} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Người thực hiện</label>
            <input className="form-control form-control-sm" placeholder="tên đăng nhập" value={filters.username} onChange={(e) => set('username', e.target.value)} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Loại</label>
            <select className="form-select form-select-sm" value={filters.kind} onChange={(e) => set('kind', e.target.value)}>
              <option value="">Tất cả</option>
              <option value="CHANGE">Thay đổi dữ liệu</option>
              <option value="REQUEST">Thao tác (API)</option>
              <option value="AUTH">Đăng nhập</option>
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Dữ liệu</label>
            <select className="form-select form-select-sm" value={filters.entity} onChange={(e) => set('entity', e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(ENTITY).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Tìm</label>
            <input className="form-control form-control-sm" placeholder="đường dẫn API…" value={filters.q} onChange={(e) => set('q', e.target.value)} />
          </div>
        </div>
      </div>

      <Card flush>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : data && data.rows.length === 0 ? (
          <div className="empty">Không có nhật ký phù hợp</div>
        ) : (
          data && (
            <div className="table-responsive" style={{ opacity: loading ? 0.5 : 1 }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Thời gian</th>
                    <th>Người thực hiện</th>
                    <th>Thao tác</th>
                    <th>Nội dung</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const [label, tone] = ACTION[r.action] ?? [r.kind === 'REQUEST' ? 'API' : r.action, undefined];
                    const expandable = r.kind !== 'AUTH';
                    return (
                      <Fragment key={r.id}>
                        <tr style={{ cursor: expandable ? 'pointer' : 'default' }} onClick={() => expandable && setOpen(open === r.id ? null : r.id)}>
                          <td className="nowrap small">{dateTime(r.at)}</td>
                          <td className="small">
                            {r.username ?? '—'}
                            {r.ip && <div className="muted">{r.ip}</div>}
                          </td>
                          <td>
                            <Badge tone={tone}>{label}</Badge>
                          </td>
                          <td className="small">
                            {r.kind === 'CHANGE' ? (
                              <>
                                <strong>{ENTITY[r.entity ?? ''] ?? r.entity}</strong>
                                {r.entityId && <span className="muted font-monospace"> · {r.entityId.slice(0, 8)}</span>}
                                {r.summary && <span className="muted"> · {r.summary}</span>}
                              </>
                            ) : r.kind === 'REQUEST' ? (
                              <span className="font-monospace">{r.action}</span>
                            ) : (
                              'Đăng nhập hệ thống'
                            )}
                          </td>
                          <td className="text-end">{expandable && <i className={`bi bi-chevron-${open === r.id ? 'up' : 'down'} text-body-secondary`} />}</td>
                        </tr>
                        {open === r.id && (
                          <tr>
                            <td colSpan={5} className="bg-body-tertiary">
                              <Detail row={r} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
        {data && data.total > data.pageSize && (
          <div className="card-body border-top d-flex justify-content-between align-items-center">
            <span className="small muted">
              {data.total.toLocaleString('vi-VN')} dòng · trang {data.page}/{pages}
            </span>
            <div className="btn-group btn-group-sm">
              <button className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Trước</button>
              <button className="btn btn-outline-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau ›</button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
