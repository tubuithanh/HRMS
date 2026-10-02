import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, Loading, Modal } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { labels } from '../../lib/format';

interface Member {
  employmentId: string;
  personId: string;
  codeEmp: string;
  fullName: string;
  gender: string | null;
  jobName: string | null;
  isKey: boolean;
  probation: boolean;
}
interface Unit {
  id: string;
  code: string;
  name: string;
  orgType: string;
  parentId: string | null;
  head: Member | null;
  members: Member[];
  positions: number;
  vacancies: number;
}
interface Node extends Unit {
  children: Node[];
  total: number;
  totalVacancies: number;
  depth: number;
}

const TYPE_TONE: Record<string, string> = { COMPANY: 'primary', BLOCK: 'info', DIVISION: 'info', DEPARTMENT: 'secondary', TEAM: 'light', SECTION: 'light' };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p[p.length - 1]?.[0] ?? '') + (p.length > 1 ? p[0][0] : '')).toUpperCase();
};

function Avatar({ m, size = 30 }: { m: Member; size?: number }) {
  return (
    <span className={`org-avatar ${m.gender === 'FEMALE' ? 'f' : 'm'}`} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(m.fullName)}
    </span>
  );
}

/** Dựng cây và cộng dồn số người, vị trí trống theo nhánh. */
function buildTree(units: Unit[]): Node[] {
  const ids = new Set(units.map((u) => u.id));
  const nodes = new Map<string, Node>(units.map((u) => [u.id, { ...u, children: [], total: 0, totalVacancies: 0, depth: 0 }]));
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    if (n.parentId && ids.has(n.parentId)) nodes.get(n.parentId)!.children.push(n);
    else roots.push(n);
  }
  const walk = (n: Node, depth: number) => {
    n.depth = depth;
    n.children.sort((a, b) => a.code.localeCompare(b.code));
    n.total = n.members.length;
    n.totalVacancies = n.vacancies;
    for (const c of n.children) {
      walk(c, depth + 1);
      n.total += c.total;
      n.totalVacancies += c.totalVacancies;
    }
  };
  roots.forEach((r) => walk(r, 0));
  return roots;
}

function UnitCard(props: { n: Node; open: boolean; hit: boolean; onToggle: () => void; onOpen: () => void }) {
  const { n } = props;
  const tone = TYPE_TONE[n.orgType] ?? 'secondary';
  return (
    <div className={`org-card ${props.hit ? 'hit' : ''}`}>
      <button type="button" className="org-card-body" onClick={props.onOpen} title="Xem nhân viên">
        <div className="d-flex align-items-center gap-1 mb-1">
          <span className={`badge text-bg-${tone} org-type`}>{labels.orgType[n.orgType as keyof typeof labels.orgType] ?? n.orgType}</span>
          <span className="org-code">{n.code}</span>
        </div>
        <div className="org-name">{n.name}</div>
        {n.head ? (
          <div className="org-head">
            <Avatar m={n.head} size={26} />
            <span className="text-truncate">
              <span className="d-block text-truncate">{n.head.fullName}</span>
              <span className="d-block text-truncate org-muted">{n.head.jobName}</span>
            </span>
          </div>
        ) : (
          <div className="org-head org-muted fst-italic">Chưa có người phụ trách</div>
        )}
        <div className="org-stats">
          <span title="Nhân viên trực tiếp / cả nhánh"><i className="bi bi-people" /> {n.members.length}{n.children.length > 0 && <span className="org-muted"> / {n.total}</span>}</span>
          {n.totalVacancies > 0 && <span className="text-warning-emphasis" title="Vị trí còn trống (cả nhánh)"><i className="bi bi-person-dash" /> {n.totalVacancies}</span>}
        </div>
      </button>
      {n.children.length > 0 && (
        <button type="button" className="org-toggle" onClick={props.onToggle} aria-expanded={props.open} aria-label={props.open ? 'Thu gọn' : 'Mở rộng'}>
          {props.open ? <i className="bi bi-dash" /> : <>{n.children.length}</>}
        </button>
      )}
    </div>
  );
}

function Branch(props: { nodes: Node[]; open: Set<string>; hits: Set<string>; toggle: (id: string) => void; select: (n: Node) => void }) {
  return (
    <ul>
      {props.nodes.map((n) => (
        <li key={n.id}>
          <UnitCard n={n} open={props.open.has(n.id)} hit={props.hits.has(n.id)} onToggle={() => props.toggle(n.id)} onOpen={() => props.select(n)} />
          {n.children.length > 0 && props.open.has(n.id) && <Branch {...props} nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}

function UnitDetail({ n, onClose }: { n: Node; onClose: () => void }) {
  return (
    <Modal title={n.name} onClose={onClose} width={640}>
      <div className="d-flex flex-wrap gap-3 small mb-3">
        <span>Mã: <strong>{n.code}</strong></span>
        <span>Trực tiếp: <strong>{n.members.length}</strong> người</span>
        {n.children.length > 0 && <span>Cả nhánh: <strong>{n.total}</strong> người</span>}
        <span>Vị trí: <strong>{n.positions}</strong>{n.vacancies > 0 && <span className="text-warning-emphasis"> ({n.vacancies} trống)</span>}</span>
      </div>
      {n.members.length === 0 ? (
        <div className="text-body-secondary small">Đơn vị chưa có nhân viên trực tiếp{n.children.length > 0 ? ' — nhân viên thuộc các đơn vị con.' : '.'}</div>
      ) : (
        <ul className="list-group">
          {n.members.map((m) => (
            <li key={m.employmentId} className="list-group-item d-flex align-items-center gap-2">
              <Avatar m={m} />
              <div className="flex-grow-1">
                <Link to={`/persons/${m.personId}`} onClick={onClose}>{m.fullName}</Link>
                {m.isKey && <span className="badge text-bg-primary ms-2">Phụ trách</span>}
                {m.probation && <span className="badge text-bg-warning ms-2">Thử việc</span>}
                <div className="small text-body-secondary">{m.codeEmp} · {m.jobName ?? '—'}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {n.children.length > 0 && (
        <div className="small text-body-secondary mt-3">
          Đơn vị con: {n.children.map((c) => `${c.name} (${c.total})`).join(' · ')}
        </div>
      )}
    </Modal>
  );
}

export default function OrgChart() {
  const { data, error, loading } = useFetch<{ units: Unit[] }>('/corehr/org/chart');
  const roots = useMemo(() => buildTree(data?.units ?? []), [data]);
  const all = useMemo(() => {
    const out: Node[] = [];
    const walk = (n: Node) => {
      out.push(n);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return out;
  }, [roots]);
  const parentOf = useMemo(() => new Map(all.map((n) => [n.id, n.parentId])), [all]);
  // Mặc định mở 2 tầng đầu
  const [open, setOpen] = useState<Set<string> | null>(null);
  const opened = open ?? new Set(all.filter((n) => n.depth < 1).map((n) => n.id));
  const [q, setQ] = useState('');
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<Node | null>(null);

  const hits = useMemo(() => {
    const t = norm(q.trim());
    if (t.length < 2) return new Set<string>();
    return new Set(all.filter((n) => norm(n.name).includes(t) || norm(n.code).includes(t) || n.members.some((m) => norm(m.fullName).includes(t) || norm(m.codeEmp).includes(t))).map((n) => n.id));
  }, [q, all]);

  const toggle = (id: string) => {
    const s = new Set(opened);
    s.has(id) ? s.delete(id) : s.add(id);
    setOpen(s);
  };
  // Tìm kiếm: mở mọi tổ tiên của đơn vị khớp
  const reveal = () => {
    const s = new Set(opened);
    for (const id of hits) {
      let p = parentOf.get(id);
      while (p) {
        s.add(p);
        p = parentOf.get(p) ?? null;
      }
    }
    setOpen(s);
  };

  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const total = roots.reduce((n, r) => n + r.total, 0);

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-body d-flex flex-wrap gap-2 align-items-center org-toolbar">
        <div className="input-group input-group-sm" style={{ maxWidth: 320 }}>
          <span className="input-group-text"><i className="bi bi-search" /></span>
          <input
            className="form-control"
            placeholder="Tìm đơn vị hoặc nhân viên…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && reveal()}
          />
          <button className="btn btn-outline-secondary" disabled={hits.size === 0} onClick={reveal}>Tìm</button>
        </div>
        {q.trim().length >= 2 && <span className="small text-body-secondary">{hits.size} đơn vị khớp</span>}
        <div className="ms-auto d-flex gap-1 align-items-center">
          <span className="small text-body-secondary me-2">{all.length} đơn vị · {total} người</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(new Set(all.map((n) => n.id)))}>Mở hết</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(new Set(roots.map((r) => r.id)))}>Thu gọn</button>
          <div className="btn-group btn-group-sm">
            <button className="btn btn-outline-secondary" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(1)))} aria-label="Thu nhỏ"><i className="bi bi-zoom-out" /></button>
            <button className="btn btn-outline-secondary" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button className="btn btn-outline-secondary" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))} aria-label="Phóng to"><i className="bi bi-zoom-in" /></button>
          </div>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => window.print()} aria-label="In"><i className="bi bi-printer" /></button>
        </div>
      </div>
      <div className="org-canvas">
        <div className="org-chart" style={{ zoom }}>
          <Branch nodes={roots} open={opened} hits={hits} toggle={toggle} select={setSelected} />
        </div>
      </div>
      <div className="card-footer bg-body small text-body-secondary">
        Bấm vào ô để xem nhân viên · số <i className="bi bi-people" /> = trực tiếp / cả nhánh · <i className="bi bi-person-dash" /> = vị trí còn trống · người phụ trách là người giữ vị trí chủ chốt.
      </div>
      {selected && <UnitDetail n={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
