import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, errorMessage } from '../api/client';

// ================= Toast =================
type ToastKind = 'success' | 'error';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}
const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-container position-fixed bottom-0 end-0 p-3" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast show align-items-center border-0 text-bg-${t.kind === 'error' ? 'danger' : 'success'}`}>
            <div className="toast-body">{t.text}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ================= Layout bits =================
export function PageHeader(props: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
      <div>
        <h1 className="h3 mb-1">{props.title}</h1>
        {props.subtitle && <div className="text-body-secondary">{props.subtitle}</div>}
      </div>
      {props.actions && <div className="toolbar">{props.actions}</div>}
    </div>
  );
}

export function Card(props: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <div className="card shadow-sm mb-3">
      {(props.title || props.actions) && (
        <div className="card-header bg-body d-flex flex-wrap justify-content-between align-items-center gap-2 py-3">
          {typeof props.title === 'string' ? <h2 className="h6 mb-0">{props.title}</h2> : props.title}
          {props.actions && <div className="toolbar">{props.actions}</div>}
        </div>
      )}
      {props.flush ? props.children : <div className="card-body">{props.children}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone?: 'green' | 'red' | 'yellow' | 'blue'; children: ReactNode }) {
  const map = { green: 'success', red: 'danger', yellow: 'warning', blue: 'primary' } as const;
  return <span className={`badge rounded-pill text-bg-${tone ? map[tone] : 'secondary'}`}>{children}</span>;
}

export function Loading() {
  return (
    <div className="text-center text-body-secondary py-4">
      <span className="spinner-border spinner-border-sm me-2" /> Đang tải…
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="alert alert-danger">{error}</div> : null;
}

export function Tabs<T extends string>(props: {
  tabs: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <ul className="nav nav-tabs mb-3 flex-nowrap overflow-x-auto overflow-y-hidden" role="tablist">
      {props.tabs.map((t) => (
        <li key={t.key} className="nav-item">
          <button
            role="tab"
            aria-selected={props.active === t.key}
            className={`nav-link text-nowrap${props.active === t.key ? ' active' : ''}`}
            onClick={() => props.onChange(t.key)}
          >
            {t.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ================= Modal =================
export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <>
      <div className="modal-backdrop fade show" />
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
      >
        <div className="modal-dialog modal-lg modal-dialog-scrollable" style={props.width ? { maxWidth: props.width } : undefined}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5">{props.title}</h2>
              <button type="button" className="btn-close" onClick={props.onClose} aria-label="Đóng" />
            </div>
            <div className="modal-body">{props.children}</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ================= Table =================
export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>(props: {
  rows: T[] | null;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  empty?: string;
  loading?: boolean;
}) {
  if (props.loading && !props.rows) return <Loading />;
  if (!props.rows || props.rows.length === 0) {
    return <div className="text-center text-body-secondary py-4">{props.empty ?? 'Chưa có dữ liệu'}</div>;
  }
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            {props.columns.map((c, i) => (
              <th key={i} className={c.className}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={props.rowKey(r)}>
              {props.columns.map((c, i) => (
                <td key={i} className={c.className}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ================= Form tự dựng từ cấu hình =================
export type FieldType = 'text' | 'email' | 'number' | 'date' | 'datetime' | 'select' | 'checkbox' | 'textarea' | 'password';

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  full?: boolean;
  /** Gửi null thay vì bỏ qua khi để trống (dùng cho form sửa). */
  nullable?: boolean;
}

type Values = Record<string, string | boolean>;

function initialValues(fields: FieldDef[], initial?: object): Values {
  const src = initial as Record<string, unknown> | undefined;
  const v: Values = {};
  for (const f of fields) {
    const raw = src?.[f.name];
    if (f.type === 'checkbox') v[f.name] = Boolean(raw);
    else if (raw === null || raw === undefined) v[f.name] = '';
    else if (f.type === 'date') v[f.name] = String(raw).slice(0, 10);
    else if (f.type === 'datetime') v[f.name] = toLocalDateTime(String(raw));
    else v[f.name] = String(raw);
  }
  return v;
}

function toLocalDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Chuyển giá trị form sang body JSON: bỏ ô trống, đổi số, đổi giờ sang ISO. */
export function toBody(fields: FieldDef[], values: Values): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === 'checkbox') {
      body[f.name] = v;
      continue;
    }
    if (v === '' || v === undefined) {
      if (f.nullable) body[f.name] = null;
      continue;
    }
    if (f.type === 'number') body[f.name] = Number(v);
    else if (f.type === 'datetime') body[f.name] = new Date(String(v)).toISOString();
    else body[f.name] = v;
  }
  return body;
}

export function FormFields(props: {
  fields: FieldDef[];
  values: Values;
  onChange: (name: string, value: string | boolean) => void;
}) {
  return (
    <div className="row g-3">
      {props.fields.map((f) => {
        const value = props.values[f.name];
        const common = {
          id: `f-${f.name}`,
          name: f.name,
          required: f.required,
          className: f.type === 'select' ? 'form-select' : 'form-control',
        };
        if (f.type === 'checkbox') {
          return (
            <div key={f.name} className={f.full ? 'col-12' : 'col-md-6'}>
              <div className="form-check mt-md-4">
                <input
                  id={`f-${f.name}`}
                  type="checkbox"
                  className="form-check-input"
                  checked={Boolean(value)}
                  onChange={(e) => props.onChange(f.name, e.target.checked)}
                />
                <label className="form-check-label" htmlFor={`f-${f.name}`}>
                  {f.label}
                </label>
              </div>
            </div>
          );
        }
        return (
          <div key={f.name} className={f.full || f.type === 'textarea' ? 'col-12' : 'col-md-6'}>
            <label className="form-label" htmlFor={`f-${f.name}`}>
              {f.label} {f.required && <span className="text-danger">*</span>}
            </label>
            {f.type === 'select' ? (
              <select {...common} value={String(value)} onChange={(e) => props.onChange(f.name, e.target.value)}>
                <option value="">{f.required ? '— Chọn —' : '— Không chọn —'}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea {...common} rows={3} value={String(value)} onChange={(e) => props.onChange(f.name, e.target.value)} />
            ) : (
              <input
                {...common}
                type={f.type === 'datetime' ? 'datetime-local' : (f.type ?? 'text')}
                step={f.type === 'number' ? 'any' : undefined}
                placeholder={f.placeholder}
                value={String(value)}
                onChange={(e) => props.onChange(f.name, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Modal chứa form: tự gửi request, hiện lỗi từ backend, báo thành công.
 */
export function FormModal(props: {
  title: string;
  fields: FieldDef[];
  initial?: object;
  method?: 'post' | 'patch' | 'put';
  path: string;
  /** Thêm/sửa body trước khi gửi. */
  transform?: (body: Record<string, unknown>) => Record<string, unknown>;
  submitLabel?: string;
  successMessage?: string;
  onClose: () => void;
  onSaved: (data: unknown) => void;
  children?: ReactNode;
}) {
  const [values, setValues] = useState<Values>(() => initialValues(props.fields, props.initial));
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setDetails(null);
    try {
      let body = toBody(props.fields, values);
      if (props.transform) body = props.transform(body);
      const res = await api.request<{ data: unknown }>({
        method: props.method ?? 'post',
        url: props.path,
        data: body,
      });
      toast(props.successMessage ?? 'Đã lưu');
      props.onSaved(res.data?.data);
    } catch (err) {
      setError(errorMessage(err));
      const d = (err as { response?: { data?: { error?: { details?: unknown } } } }).response?.data?.error?.details;
      if (d && typeof d === 'object') setDetails(d as Record<string, string[]>);
      setSaving(false);
    }
  }

  const labelOf = (name: string) => props.fields.find((f) => f.name === name)?.label ?? name;

  return (
    <Modal title={props.title} onClose={props.onClose}>
      <form onSubmit={submit}>
        {error && (
          <div className="alert alert-danger">
            {error}
            {details && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {Object.entries(details).map(([k, msgs]) => (
                  <li key={k}>
                    {labelOf(k)}: {Array.isArray(msgs) ? msgs.join(', ') : String(msgs)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {props.children}
        <FormFields fields={props.fields} values={values} onChange={(n, v) => setValues((s) => ({ ...s, [n]: v }))} />
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-secondary" onClick={props.onClose}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner-border spinner-border-sm me-1" />}
            {saving ? 'Đang lưu…' : (props.submitLabel ?? 'Lưu')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Nút thực hiện một thao tác API (có hỏi xác nhận nếu cần), báo kết quả.
 */
export function ActionButton(props: {
  label: ReactNode;
  confirm?: string;
  run: () => Promise<unknown>;
  onDone?: () => void;
  success?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function click() {
    if (props.confirm && !window.confirm(props.confirm)) return;
    setBusy(true);
    try {
      await props.run();
      if (props.success) toast(props.success);
      props.onDone?.();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className={props.className ?? 'btn btn-sm btn-outline-secondary'} onClick={click} disabled={busy || props.disabled}>
      {props.label}
    </button>
  );
}
