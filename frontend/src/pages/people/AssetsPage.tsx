import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanWrite } from '../../auth';
import { Card, DataTable, ErrorBox, FieldDef, FormModal, Modal, PageHeader } from '../../components/ui';
import { useFetch } from '../../lib/hooks';
import { date, money, options, todayISO } from '../../lib/format';
import { Employment } from '../../types/models';

export const CATEGORIES: Record<string, string> = { LAPTOP: 'Máy tính', PHONE: 'Điện thoại', UNIFORM: 'Đồng phục / BHLĐ', CARD: 'Thẻ ra vào', TOOL: 'Dụng cụ', OTHER: 'Khác' };
const STATUS: Record<string, [string, string]> = {
  IN_STOCK: ['Trong kho', 'text-bg-success'],
  ASSIGNED: ['Đang cấp', 'text-bg-primary'],
  REPAIR: ['Đang sửa', 'text-bg-warning'],
  LOST: ['Mất', 'text-bg-danger'],
  DISPOSED: ['Thanh lý', 'text-bg-secondary'],
};

interface Holder {
  id: string;
  assignedAt: string;
  returnedAt: string | null;
  conditionOut: string | null;
  conditionIn: string | null;
  employment: { id: string; codeEmp: string; person: { id: string; fullName: string } };
}
interface Asset {
  id: string;
  code: string;
  name: string;
  category: string;
  serialNo: string | null;
  purchaseDate: string | null;
  cost: string | null;
  status: string;
  note: string | null;
  assignments: Holder[];
}

/** Tài sản một người đang giữ / đã trả — dùng ở hồ sơ nhân sự và hồ sơ của tôi. */
export interface AssetHolding {
  id: string;
  assignedAt: string;
  returnedAt: string | null;
  conditionOut: string | null;
  asset: { id: string; code: string; name: string; category: string; serialNo: string | null; cost: string | null };
}
export function HoldingsTable({ rows, loading }: { rows: AssetHolding[] | null; loading?: boolean }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      rowKey={(r) => r.id}
      empty="Không có tài sản"
      columns={[
        { header: 'Mã', cell: (r) => r.asset.code },
        { header: 'Tài sản', cell: (r) => <>{r.asset.name}<div className="small text-body-secondary">{CATEGORIES[r.asset.category]}{r.asset.serialNo ? ` · ${r.asset.serialNo}` : ''}</div></> },
        { header: 'Ngày cấp', cell: (r) => date(r.assignedAt) },
        { header: 'Trạng thái', cell: (r) => (r.returnedAt ? <span className="text-body-secondary">Đã trả {date(r.returnedAt)}</span> : <span className="badge text-bg-primary">Đang giữ</span>) },
      ]}
    />
  );
}

const assetFields = (edit: boolean): FieldDef[] => [
  ...(edit ? [] : [{ name: 'code', label: 'Mã tài sản', required: true } as FieldDef]),
  { name: 'name', label: 'Tên tài sản', required: true },
  { name: 'category', label: 'Loại', type: 'select', required: true, options: options(CATEGORIES) },
  { name: 'serialNo', label: 'Số serial', nullable: true },
  { name: 'purchaseDate', label: 'Ngày mua', type: 'date', nullable: true },
  { name: 'cost', label: 'Nguyên giá (VND)', type: 'number', nullable: true },
  ...(edit ? [{ name: 'status', label: 'Trạng thái', type: 'select', options: [{ value: 'IN_STOCK', label: 'Trong kho' }, { value: 'REPAIR', label: 'Đang sửa' }, { value: 'LOST', label: 'Mất' }, { value: 'DISPOSED', label: 'Thanh lý' }] } as FieldDef] : []),
  { name: 'note', label: 'Ghi chú', nullable: true, full: true },
];

function History({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useFetch<Asset>(`/assets/${id}`);
  return (
    <Modal title={data ? `${data.code} · ${data.name}` : 'Lịch sử cấp phát'} onClose={onClose} width={700}>
      <DataTable
        rows={data?.assignments ?? null}
        rowKey={(a) => a.id}
        empty="Chưa cấp cho ai"
        columns={[
          { header: 'Nhân viên', cell: (a) => <Link to={`/persons/${a.employment.person.id}`}>{a.employment.person.fullName}</Link> },
          { header: 'Cấp', cell: (a) => `${date(a.assignedAt)}${a.conditionOut ? ` · ${a.conditionOut}` : ''}` },
          { header: 'Thu hồi', cell: (a) => (a.returnedAt ? `${date(a.returnedAt)}${a.conditionIn ? ` · ${a.conditionIn}` : ''}` : <span className="badge text-bg-primary">Đang giữ</span>) },
        ]}
      />
    </Modal>
  );
}

export default function AssetsPage() {
  const canWrite = useCanWrite('corehr');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'edit' | 'assign' | 'history'; a: Asset } | { kind: 'return'; a: Asset; h: Holder } | null>(null);
  const params = new URLSearchParams({ ...(status ? { status } : {}), ...(category ? { category } : {}), ...(q ? { q } : {}) }).toString();
  const list = useFetch<Asset[]>(`/assets?${params}`, [params]);
  const emps = useFetch<Employment[]>(canWrite ? '/corehr/employments' : null);
  const rows = list.data ?? [];
  const close = () => setDialog(null);
  const saved = () => { setDialog(null); list.reload(); };

  return (
    <>
      <PageHeader title="Tài sản cấp phát" actions={canWrite && <button className="btn btn-primary" onClick={() => setDialog({ kind: 'new' })}>+ Tài sản</button>} />
      <div className="row g-2 mb-3">
        {Object.entries(STATUS).map(([k, [l, cls]]) => (
          <div key={k} className="col-6 col-md">
            <button className={`card card-body py-2 w-100 text-start ${status === k ? 'border-primary' : ''}`} onClick={() => setStatus(status === k ? '' : k)}>
              <span className={`badge ${cls} align-self-start`}>{l}</span>
              <span className="fs-5 fw-semibold">{status && status !== k ? '—' : rows.filter((a) => a.status === k).length}</span>
            </button>
          </div>
        ))}
      </div>
      <Card
        flush
        actions={
          <div className="d-flex gap-2">
            <input className="form-control form-control-sm" placeholder="Tìm mã, tên, serial…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="form-select form-select-sm w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Mọi loại</option>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        }
        title={`${rows.length} tài sản`}
      >
        <ErrorBox error={list.error} />
        <DataTable
          rows={list.data}
          loading={list.loading}
          rowKey={(a) => a.id}
          empty="Không có tài sản"
          columns={[
            { header: 'Mã', cell: (a) => <button className="btn btn-link p-0" onClick={() => setDialog({ kind: 'history', a })}>{a.code}</button> },
            { header: 'Tài sản', cell: (a) => <>{a.name}<div className="small text-body-secondary">{CATEGORIES[a.category]}{a.serialNo ? ` · ${a.serialNo}` : ''}</div></> },
            { header: 'Nguyên giá', cell: (a) => (a.cost ? money(a.cost) : '—'), className: 'num' },
            { header: 'Trạng thái', cell: (a) => <span className={`badge ${STATUS[a.status]?.[1]}`}>{STATUS[a.status]?.[0] ?? a.status}</span> },
            {
              header: 'Đang giữ',
              cell: (a) => {
                const h = a.assignments[0];
                return h ? <><Link to={`/persons/${h.employment.person.id}`}>{h.employment.person.fullName}</Link><div className="small text-body-secondary">từ {date(h.assignedAt)}</div></> : '—';
              },
            },
            {
              header: '',
              className: 'actions',
              cell: (a) =>
                canWrite && (
                  <div className="d-flex gap-1 justify-content-end">
                    {a.status === 'IN_STOCK' && <button className="btn btn-sm btn-primary" onClick={() => setDialog({ kind: 'assign', a })}>Cấp</button>}
                    {a.assignments[0] && <button className="btn btn-sm btn-outline-primary" onClick={() => setDialog({ kind: 'return', a, h: a.assignments[0] })}>Thu hồi</button>}
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ kind: 'edit', a })}>Sửa</button>
                  </div>
                ),
            },
          ]}
        />
      </Card>

      {dialog?.kind === 'new' && <FormModal title="Thêm tài sản" fields={assetFields(false)} initial={{ category: 'LAPTOP' }} path="/assets" onClose={close} onSaved={saved} />}
      {dialog?.kind === 'edit' && (
        <FormModal title={`Sửa ${dialog.a.code}`} fields={assetFields(true).filter((f) => f.name !== 'status' || dialog.a.status !== 'ASSIGNED')} initial={{ ...dialog.a, cost: dialog.a.cost ? Number(dialog.a.cost) : null }} method="patch" path={`/assets/${dialog.a.id}`} onClose={close} onSaved={saved} />
      )}
      {dialog?.kind === 'assign' && (
        <FormModal
          title={`Cấp ${dialog.a.code} · ${dialog.a.name}`}
          fields={[
            { name: 'employmentId', label: 'Nhân viên', type: 'select', required: true, options: (emps.data ?? []).filter((e) => e.status !== 'TERMINATED').map((e) => ({ value: e.id, label: `${e.codeEmp} · ${e.person?.fullName}` })) },
            { name: 'assignedAt', label: 'Ngày cấp', type: 'date', required: true },
            { name: 'conditionOut', label: 'Tình trạng khi cấp' },
            { name: 'note', label: 'Ghi chú', full: true },
          ]}
          initial={{ assignedAt: todayISO(), conditionOut: 'Tốt' }}
          path={`/assets/${dialog.a.id}/assign`}
          successMessage="Đã cấp — nhân viên nhận được thông báo"
          onClose={close}
          onSaved={saved}
        />
      )}
      {dialog?.kind === 'return' && (
        <FormModal
          title={`Thu hồi ${dialog.a.code} từ ${dialog.h.employment.person.fullName}`}
          fields={[
            { name: 'returnedAt', label: 'Ngày thu hồi', type: 'date', required: true },
            { name: 'status', label: 'Sau thu hồi', type: 'select', options: [{ value: 'IN_STOCK', label: 'Nhập kho' }, { value: 'REPAIR', label: 'Đem sửa' }, { value: 'LOST', label: 'Báo mất' }] },
            { name: 'conditionIn', label: 'Tình trạng khi nhận lại' },
            { name: 'note', label: 'Ghi chú', full: true },
          ]}
          initial={{ returnedAt: todayISO(), status: 'IN_STOCK' }}
          path={`/assets/assignments/${dialog.h.id}/return`}
          successMessage="Đã thu hồi"
          onClose={close}
          onSaved={saved}
        />
      )}
      {dialog?.kind === 'history' && <History id={dialog.a.id} onClose={close} />}
    </>
  );
}
