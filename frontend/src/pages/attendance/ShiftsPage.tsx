import { useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useCanWrite } from '../../auth';
import { Card, DataTable, ErrorBox, FieldDef, FormModal, Loading, Modal, PageHeader, Tabs, useToast } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { currentMonth, todayISO } from '../../lib/format';
import { OrgUnit } from '../../types/models';

interface Shift {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  color: string | null;
  isActive: boolean;
}

interface RosterData {
  days: string[];
  rows: Array<{
    employmentId: string;
    codeEmp: string;
    fullName: string;
    cells: Record<string, { shiftId: string | null; source: 'ROSTER' | 'DEFAULT' } | undefined>;
  }>;
}

const shiftFields: FieldDef[] = [
  { name: 'code', label: 'Mã ca', required: true },
  { name: 'name', label: 'Tên ca', required: true },
  { name: 'startTime', label: 'Giờ bắt đầu (HH:mm)', required: true, placeholder: '06:00' },
  { name: 'endTime', label: 'Giờ kết thúc (HH:mm)', required: true, placeholder: '14:00' },
  { name: 'breakMinutes', label: 'Nghỉ giữa ca (phút)', type: 'number' },
  { name: 'lateGraceMinutes', label: 'Cho phép đi muộn (phút)', type: 'number' },
  { name: 'color', label: 'Màu hiển thị', placeholder: '#2a78d6' },
  { name: 'isActive', label: 'Đang dùng', type: 'checkbox' },
];

const overnight = (s: Shift) => s.endTime <= s.startTime;
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function ShiftCatalog({ shifts, reload }: { shifts: Shift[] | null; reload: () => void }) {
  const canWrite = useCanWrite('attendance');
  const [editing, setEditing] = useState<Shift | 'new' | null>(null);
  return (
    <Card
      title="Danh mục ca"
      flush
      actions={canWrite && <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>+ Thêm ca</button>}
    >
      <DataTable
        rows={shifts}
        rowKey={(s) => s.id}
        columns={[
          { header: 'Mã', cell: (s) => <span className="badge" style={{ background: s.color ?? '#6c757d' }}>{s.code}</span> },
          { header: 'Tên ca', cell: (s) => s.name },
          { header: 'Giờ', cell: (s) => `${s.startTime} – ${s.endTime}${overnight(s) ? ' (qua đêm)' : ''}`, className: 'nowrap' },
          { header: 'Nghỉ giữa ca', cell: (s) => `${s.breakMinutes} phút` },
          { header: 'Cho phép muộn', cell: (s) => `${s.lateGraceMinutes} phút` },
          { header: 'Trạng thái', cell: (s) => (s.isActive ? 'Đang dùng' : <span className="text-body-secondary">Ngừng</span>) },
          {
            header: '',
            className: 'actions',
            cell: (s) => canWrite && <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(s)}>Sửa</button>,
          },
        ]}
      />
      {editing && (
        <FormModal
          title={editing === 'new' ? 'Thêm ca' : `Sửa ca ${editing.code}`}
          fields={editing === 'new' ? shiftFields : shiftFields.filter((f) => f.name !== 'code')}
          initial={editing === 'new' ? { breakMinutes: 60, lateGraceMinutes: 0, isActive: true } : editing}
          method={editing === 'new' ? 'post' : 'patch'}
          path={editing === 'new' ? '/shifts' : `/shifts/${editing.id}`}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        >
          <p className="muted" style={{ marginTop: 0 }}>Giờ kết thúc nhỏ hơn giờ bắt đầu là ca qua đêm (vd 22:00 → 06:00) — ngày công tính theo ngày bắt đầu ca.</p>
        </FormModal>
      )}
    </Card>
  );
}

/** Ô chọn ca cho một người một ngày. */
function CellEditor(props: { shifts: Shift[]; onPick: (shiftId: string | null | 'DEFAULT') => void; onClose: () => void; title: string }) {
  return (
    <Modal title={props.title} onClose={props.onClose} width={420}>
      <div className="d-grid gap-2">
        {props.shifts.map((s) => (
          <button key={s.id} className="btn btn-outline-secondary text-start" onClick={() => props.onPick(s.id)}>
            <span className="badge me-2" style={{ background: s.color ?? '#6c757d' }}>{s.code}</span>
            {s.name} · {s.startTime}–{s.endTime}
          </button>
        ))}
        <button className="btn btn-outline-secondary text-start" onClick={() => props.onPick(null)}>
          <span className="badge text-bg-light border me-2">OFF</span>Ngày nghỉ
        </button>
        <button className="btn btn-link text-start" onClick={() => props.onPick('DEFAULT')}>Bỏ xếp ca — dùng ca mặc định</button>
      </div>
    </Modal>
  );
}

function RotateModal(props: { shifts: Shift[]; employmentIds: string[]; month: string; onClose: () => void; onDone: () => void }) {
  const [y, m] = props.month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const [fromDate, setFrom] = useState(`${props.month}-01`);
  const [toDate, setTo] = useState(last);
  const [pattern, setPattern] = useState<Array<string | null>>(props.shifts.filter((s) => s.code !== 'HC').slice(0, 3).map((s) => s.id));
  const [daysPerStep, setDays] = useState(7);
  const [stagger, setStagger] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const code = (id: string | null) => (id ? props.shifts.find((s) => s.id === id)?.code ?? '?' : 'OFF');

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/shifts/rotate', { employmentIds: props.employmentIds, fromDate, toDate, pattern, daysPerStep, staggerSteps: stagger });
      toast(`Đã xếp ${r.data.data.count} ô lịch ca`);
      props.onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Xoay ca cho ${props.employmentIds.length} người`} onClose={props.onClose} width={620}>
      <ErrorBox error={error} />
      <div className="row g-2">
        <div className="col-6">
          <label className="form-label">Từ ngày</label>
          <input type="date" className="form-control" value={fromDate} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="col-6">
          <label className="form-label">Đến ngày (tối đa 93 ngày)</label>
          <input type="date" className="form-control" value={toDate} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="col-12">
          <label className="form-label">Chu kỳ ca (theo thứ tự)</label>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {pattern.map((id, i) => (
              <span key={i} className="badge text-bg-light border fs-6">
                {code(id)}
                <button type="button" className="btn-close ms-1" style={{ fontSize: 8 }} aria-label="Bỏ" onClick={() => setPattern(pattern.filter((_, k) => k !== i))} />
              </span>
            ))}
            <select className="form-select form-select-sm w-auto" value="" onChange={(e) => e.target.value && setPattern([...pattern, e.target.value === 'OFF' ? null : e.target.value])}>
              <option value="">+ thêm</option>
              {props.shifts.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              <option value="OFF">Nghỉ</option>
            </select>
          </div>
        </div>
        <div className="col-6">
          <label className="form-label">Số ngày mỗi ca</label>
          <input type="number" min={1} max={31} className="form-control" value={daysPerStep} onChange={(e) => setDays(Number(e.target.value))} />
        </div>
        <div className="col-6">
          <label className="form-label">Lệch giữa các người (bước)</label>
          <input type="number" min={0} max={14} className="form-control" value={stagger} onChange={(e) => setStagger(Number(e.target.value))} />
          <div className="form-text">1 = người kế tiếp bắt đầu ở ca kế tiếp (chia tổ). 0 = cả nhóm cùng ca.</div>
        </div>
      </div>
      <div className="alert alert-light border small mt-3 mb-0">
        Lịch cũ trong khoảng ngày sẽ bị ghi đè. Ví dụ chu kỳ <strong>{pattern.map(code).join(' → ')}</strong>, mỗi ca {daysPerStep} ngày.
      </div>
      <div className="d-flex justify-content-end gap-2 mt-3">
        <button className="btn btn-outline-secondary" onClick={props.onClose}>Huỷ</button>
        <button className="btn btn-primary" disabled={busy || pattern.length === 0} onClick={submit}>{busy ? 'Đang xếp…' : 'Xếp lịch'}</button>
      </div>
    </Modal>
  );
}

function AssignModal(props: { shifts: Shift[]; employmentIds: string[]; onClose: () => void; onDone: () => void }) {
  return (
    <FormModal
      title={`Gán ca mặc định cho ${props.employmentIds.length} người`}
      fields={[
        { name: 'shiftId', label: 'Ca', type: 'select', required: true, options: props.shifts.map((s) => ({ value: s.id, label: `${s.code} · ${s.name} (${s.startTime}–${s.endTime})` })) },
        { name: 'effectiveDate', label: 'Hiệu lực từ', type: 'date', required: true },
      ]}
      initial={{ effectiveDate: todayISO() }}
      path="/shifts/assign"
      transform={(b) => ({ ...b, employmentIds: props.employmentIds })}
      successMessage="Đã gán ca mặc định"
      onClose={props.onClose}
      onSaved={props.onDone}
    >
      <p className="muted" style={{ marginTop: 0 }}>Ca mặc định dùng cho mọi ngày không có lịch xếp ca riêng.</p>
    </FormModal>
  );
}

function RosterGrid({ shifts }: { shifts: Shift[] }) {
  const canWrite = useCanWrite('attendance');
  const [month, setMonth] = useState(currentMonth());
  const [orgId, setOrgId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editCell, setEditCell] = useState<{ employmentId: string; day: string; name: string } | null>(null);
  const [dialog, setDialog] = useState<'rotate' | 'assign' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const org = useFetch<OrgUnit[]>('/corehr/org');
  const roster = useFetch<RosterData>(`/shifts/roster?month=${month}${orgId ? `&orgId=${orgId}` : ''}`, [month, orgId]);
  const byId = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const rows = roster.data?.rows ?? [];

  async function pick(v: string | null | 'DEFAULT') {
    if (!editCell) return;
    setError(null);
    try {
      if (v === 'DEFAULT') await api.post('/shifts/roster/clear', { employmentIds: [editCell.employmentId], fromDate: editCell.day, toDate: editCell.day });
      else await api.put('/shifts/roster', { cells: [{ employmentId: editCell.employmentId, workDate: editCell.day, shiftId: v }] });
      setEditCell(null);
      roster.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.employmentId));
  const done = () => {
    setDialog(null);
    setSelected(new Set());
    roster.reload();
  };

  return (
    <Card
      title="Lịch ca"
      actions={
        <div className="d-flex gap-2 flex-wrap">
          <input type="month" className="form-control form-control-sm w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
          <select className="form-select form-select-sm w-auto" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">Tất cả đơn vị</option>
            {(org.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {canWrite && (
            <>
              <button className="btn btn-sm btn-outline-primary" disabled={selected.size === 0} onClick={() => setDialog('assign')}>Gán ca mặc định ({selected.size})</button>
              <button className="btn btn-sm btn-primary" disabled={selected.size === 0} onClick={() => setDialog('rotate')}>Xoay ca ({selected.size})</button>
            </>
          )}
        </div>
      }
    >
      <div className="d-flex flex-wrap gap-2 small mb-2 align-items-center">
        {shifts.map((s) => (
          <span key={s.id}><span className="badge" style={{ background: s.color ?? '#6c757d' }}>{s.code}</span> {s.startTime}–{s.endTime}</span>
        ))}
        <span><span className="badge text-bg-light border">OFF</span> nghỉ</span>
        <span className="text-body-secondary">· chữ nhạt = ca mặc định (thứ 2 – thứ 6), đậm = đã xếp lịch{canWrite ? ' · bấm ô để đổi' : ''}</span>
      </div>
      <ErrorBox error={error ?? roster.error} />
      {roster.loading && !roster.data && <Loading />}
      {roster.data && (
        <div className="table-responsive" style={{ maxHeight: '65vh' }}>
          <table className="table table-sm table-bordered align-middle mb-0 roster">
            <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                {canWrite && (
                  <th style={{ width: 28 }}>
                    <input type="checkbox" className="form-check-input" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.employmentId)))} />
                  </th>
                )}
                <th className="text-nowrap">Nhân viên</th>
                {roster.data.days.map((d) => {
                  const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
                  return (
                    <th key={d} className={`text-center px-1 ${wd === 0 ? 'text-danger' : ''}`} style={{ minWidth: 38, fontSize: 11 }}>
                      {d.slice(8)}<br />{WEEKDAY[wd]}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employmentId}>
                  {canWrite && (
                    <td><input type="checkbox" className="form-check-input" checked={selected.has(r.employmentId)} onChange={() => toggle(r.employmentId)} /></td>
                  )}
                  <td className="text-nowrap small">{r.codeEmp} · {r.fullName}</td>
                  {roster.data!.days.map((d) => {
                    const c = r.cells[d];
                    const s = c?.shiftId ? byId.get(c.shiftId) : undefined;
                    const label = c ? (s ? s.code : 'OFF') : '';
                    return (
                      <td
                        key={d}
                        className="text-center p-0"
                        style={{ cursor: canWrite ? 'pointer' : 'default', fontSize: 11 }}
                        onClick={() => canWrite && setEditCell({ employmentId: r.employmentId, day: d, name: r.fullName })}
                        title={s ? `${s.name} ${s.startTime}–${s.endTime}` : c ? 'Nghỉ' : 'Giờ hành chính (chưa có ca)'}
                      >
                        {label && (
                          <span
                            className={`badge ${s ? '' : 'text-bg-light border'}`}
                            style={{ background: s ? s.color ?? '#6c757d' : undefined, opacity: c?.source === 'DEFAULT' ? 0.45 : 1 }}
                          >
                            {label}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editCell && (
        <CellEditor
          title={`${editCell.name} · ${editCell.day.split('-').reverse().join('/')}`}
          shifts={shifts}
          onPick={pick}
          onClose={() => setEditCell(null)}
        />
      )}
      {dialog === 'rotate' && <RotateModal shifts={shifts} employmentIds={[...selected]} month={month} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'assign' && <AssignModal shifts={shifts} employmentIds={[...selected]} onClose={() => setDialog(null)} onDone={done} />}
    </Card>
  );
}

export default function ShiftsPage() {
  const [tab, setTab] = useState<'roster' | 'catalog'>('roster');
  const shifts = useFetch<Shift[]>('/shifts?all=true');
  const active = (shifts.data ?? []).filter((s) => s.isActive);
  return (
    <>
      <PageHeader title="Ca làm việc" />
      <Tabs tabs={[{ key: 'roster', label: 'Lịch ca' }, { key: 'catalog', label: 'Danh mục ca' }]} active={tab} onChange={setTab} />
      <ErrorBox error={shifts.error} />
      {tab === 'roster' && (shifts.data ? <RosterGrid shifts={active} /> : <Loading />)}
      {tab === 'catalog' && <ShiftCatalog shifts={shifts.data} reload={shifts.reload} />}
    </>
  );
}
