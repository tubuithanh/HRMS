import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { Card, DataTable, ErrorBox, PageHeader, useToast } from '../../components/ui';
import { downloadFile } from '../../lib/hooks';
import { date, time } from '../../lib/format';

interface Item {
  employmentId: string;
  codeEmp: string;
  fullName: string;
  workDate: string;
  shift: string;
  checkIn: string;
  checkOut: string | null;
  punches: number;
  lateMinutes: number;
  earlyMinutes: number;
  workedMinutes: number | null;
  nightMinutes: number;
  warning: string | null;
  action: 'CREATE' | 'UPDATE' | 'SKIP';
  skipReason: string | null;
}
interface Result {
  committed: boolean;
  written: number;
  summary: { rows: number; punches: number; employees: number; days: number; create: number; update: number; skip: number; missingOut: number; late: number; errorCount: number };
  errors: Array<{ row: number; message: string }>;
  items: Item[];
}

const hm = (m: number | null) => (m == null ? '' : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);
const ACTION: Record<Item['action'], [string, string]> = {
  CREATE: ['Thêm', 'text-bg-success'],
  UPDATE: ['Cập nhật', 'text-bg-info'],
  SKIP: ['Bỏ qua', 'text-bg-secondary'],
};

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Không đọc được file'));
    r.readAsDataURL(file);
  });
}

/** Nhập dữ liệu máy chấm công: chọn file → kiểm tra (xem trước) → nhập. */
export default function MachineImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'ISSUE'>('ALL');
  const toast = useToast();

  async function run(commit: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const content = b64 ?? (await toBase64(file));
      setB64(content);
      const r = await api.post<{ data: Result }>('/attendance/punches', { file: content, commit });
      setResult(r.data.data);
      if (commit) toast(`Đã ghi ${r.data.data.written} ngày công`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const s = result?.summary;
  const rows = (result?.items ?? []).filter((i) => filter === 'ALL' || i.warning || i.action === 'SKIP' || i.lateMinutes || i.earlyMinutes);

  return (
    <>
      <PageHeader
        title="Nhập dữ liệu máy chấm công"
        subtitle="Excel (.xlsx) hoặc CSV xuất từ máy vân tay / khuôn mặt — mỗi dòng một lần quẹt: mã chấm công + thời gian"
        actions={
          <button className="btn btn-outline-secondary" onClick={() => downloadFile('/attendance/punches/template', 'mau-may-cham-cong.csv')}>
            <i className="bi bi-download me-1" />File mẫu
          </button>
        }
      />
      <Card>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <input
            type="file"
            className="form-control"
            style={{ maxWidth: 420 }}
            accept=".xlsx,.csv,.txt"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setB64(null);
              setResult(null);
              setError(null);
            }}
          />
          <button className="btn btn-outline-primary" disabled={!file || busy} onClick={() => run(false)}>
            {busy && !result ? 'Đang kiểm tra…' : '1. Kiểm tra'}
          </button>
          <button
            className="btn btn-primary"
            disabled={!result || result.committed || busy || (s?.errorCount ?? 0) > 0}
            onClick={() => window.confirm(`Ghi ${(s?.create ?? 0) + (s?.update ?? 0)} ngày công vào bảng công?`) && run(true)}
          >
            2. Nhập vào bảng công
          </button>
        </div>
        <ul className="small text-body-secondary mt-3 mb-0">
          <li>Cột cần có: <strong>Mã chấm công</strong> (mã trên máy, khai trong hợp đồng lao động; không có thì dùng mã nhân viên) và <strong>Thời gian</strong> — hoặc hai cột <strong>Ngày</strong> + <strong>Giờ</strong>.</li>
          <li>Ghép theo ca của từng người: lần quẹt sớm nhất là giờ vào, muộn nhất là giờ ra; ca đêm quẹt ra rạng sáng được tính cho ngày hôm trước; quẹt trùng trong 2 phút bị bỏ.</li>
          <li>Ngày nhân sự đã nhập / sửa tay được giữ nguyên. Chỉ nhập khi file không còn lỗi.</li>
        </ul>
      </Card>
      <ErrorBox error={error} />
      {result && s && (
        <>
          {result.committed && <div className="alert alert-success">Đã nhập {result.written} ngày công vào bảng công.</div>}
          <div className="row g-2 mb-3">
            {([
              ['Lần quẹt', s.punches],
              ['Nhân viên', s.employees],
              ['Ngày công', s.days],
              ['Thêm mới / cập nhật', `${s.create} / ${s.update}`],
              ['Bỏ qua', s.skip],
              ['Thiếu giờ ra', s.missingOut],
              ['Đi muộn', s.late],
              ['Lỗi', s.errorCount],
            ] as Array<[string, string | number]>).map(([k, v]) => (
              <div key={k} className="col-6 col-md-3 col-xl">
                <div className={`card card-body py-2 ${k === 'Lỗi' && s.errorCount ? 'border-danger' : ''}`}>
                  <div className="small text-body-secondary">{k}</div>
                  <div className={`fs-5 fw-semibold ${k === 'Lỗi' && s.errorCount ? 'text-danger' : ''}`}>{v}</div>
                </div>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <Card title={`Lỗi cần sửa (${s.errorCount})`} flush>
              <DataTable
                rows={result.errors}
                rowKey={(e) => `${e.row}-${e.message}`}
                columns={[
                  { header: 'Dòng', cell: (e) => e.row, className: 'num' },
                  { header: 'Lỗi', cell: (e) => e.message },
                ]}
              />
            </Card>
          )}
          <Card
            flush
            title="Xem trước"
            actions={
              <select className="form-select form-select-sm" value={filter} onChange={(e) => setFilter(e.target.value as 'ALL' | 'ISSUE')}>
                <option value="ALL">Tất cả ({result.items.length})</option>
                <option value="ISSUE">Chỉ dòng cần chú ý</option>
              </select>
            }
          >
            <DataTable
              rows={rows}
              rowKey={(i) => `${i.employmentId}-${i.workDate}`}
              empty="Không có dòng nào"
              columns={[
                { header: 'Nhân viên', cell: (i) => <>{i.fullName}<div className="small text-body-secondary">{i.codeEmp}</div></> },
                { header: 'Ngày công', cell: (i) => date(i.workDate), className: 'nowrap' },
                { header: 'Ca', cell: (i) => i.shift },
                { header: 'Vào', cell: (i) => time(i.checkIn) },
                { header: 'Ra', cell: (i) => (i.checkOut ? `${time(i.checkOut)}${i.checkOut.slice(0, 10) !== i.checkIn.slice(0, 10) ? ' (+1)' : ''}` : <span className="text-danger">—</span>) },
                { header: 'Muộn', cell: (i) => (i.lateMinutes ? `${i.lateMinutes}′` : ''), className: 'num' },
                { header: 'Sớm', cell: (i) => (i.earlyMinutes ? `${i.earlyMinutes}′` : ''), className: 'num' },
                { header: 'Giờ làm', cell: (i) => hm(i.workedMinutes) },
                { header: 'Giờ đêm', cell: (i) => (i.nightMinutes ? hm(i.nightMinutes) : '') },
                {
                  header: '',
                  cell: (i) => (
                    <>
                      <span className={`badge ${ACTION[i.action][1]}`}>{ACTION[i.action][0]}</span>
                      {(i.skipReason || i.warning) && <div className="small text-warning-emphasis">{i.skipReason ?? i.warning}</div>}
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
}
