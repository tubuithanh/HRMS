import { useMemo, useState } from 'react';
import { useFetch } from '../lib/hooks';

interface Emp {
  id: string;
  codeEmp: string;
  status: string;
  person: { fullName: string };
  assignments?: Array<{ orgStructure: { name: string }; position: { job: { name: string } | null } }>;
}

/** Chọn nhiều nhân viên đang làm việc: tìm theo tên / mã, lọc theo phòng ban, chọn tất cả kết quả lọc. */
export default function EmployeePicker(props: { value: string[]; onChange: (ids: string[]) => void; height?: number }) {
  const { data, loading } = useFetch<Emp[]>('/corehr/employments');
  const [q, setQ] = useState('');
  const [org, setOrg] = useState('');
  const active = useMemo(() => (data ?? []).filter((e) => e.status !== 'TERMINATED'), [data]);
  const orgs = useMemo(() => [...new Set(active.map((e) => e.assignments?.[0]?.orgStructure.name).filter(Boolean))].sort() as string[], [active]);
  const term = q.trim().toLowerCase();
  const shown = active.filter(
    (e) => (!org || e.assignments?.[0]?.orgStructure.name === org) && (!term || e.person.fullName.toLowerCase().includes(term) || e.codeEmp.toLowerCase().includes(term)),
  );
  const sel = new Set(props.value);
  const allShown = shown.length > 0 && shown.every((e) => sel.has(e.id));
  const toggleAll = () => {
    const next = new Set(sel);
    for (const e of shown) allShown ? next.delete(e.id) : next.add(e.id);
    props.onChange([...next]);
  };
  const toggle = (id: string) => {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    props.onChange([...next]);
  };
  return (
    <div className="border rounded">
      <div className="d-flex gap-2 p-2 border-bottom bg-body-tertiary">
        <input className="form-control form-control-sm" placeholder="Tìm tên hoặc mã NV…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="form-select form-select-sm" style={{ maxWidth: 220 }} value={org} onChange={(e) => setOrg(e.target.value)}>
          <option value="">Mọi đơn vị</option>
          {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div className="d-flex justify-content-between align-items-center px-2 py-1 small border-bottom">
        <label className="form-check mb-0">
          <input type="checkbox" className="form-check-input" checked={allShown} onChange={toggleAll} disabled={shown.length === 0} />
          <span className="form-check-label">Chọn tất cả ({shown.length})</span>
        </label>
        <span className="text-body-secondary">Đã chọn <strong>{sel.size}</strong></span>
      </div>
      <div style={{ maxHeight: props.height ?? 260, overflowY: 'auto' }}>
        {loading && <div className="p-2 small text-body-secondary">Đang tải…</div>}
        {shown.map((e) => (
          <label key={e.id} className="d-flex gap-2 align-items-center px-2 py-1 border-bottom small" style={{ cursor: 'pointer' }}>
            <input type="checkbox" className="form-check-input mt-0" checked={sel.has(e.id)} onChange={() => toggle(e.id)} />
            <span className="text-body-secondary" style={{ width: 60 }}>{e.codeEmp}</span>
            <span className="flex-grow-1">{e.person.fullName}</span>
            <span className="text-body-tertiary text-truncate" style={{ maxWidth: 200 }}>{e.assignments?.[0]?.orgStructure.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
