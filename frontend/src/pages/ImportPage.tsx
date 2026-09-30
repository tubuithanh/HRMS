import { ChangeEvent, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useCanWrite } from '../auth';
import { ActionButton, Card, PageHeader, useToast } from '../components/ui';
import { downloadFile } from '../lib/hooks';

type ImportType = 'employees' | 'salaries' | 'attendance';

interface ImportResult {
  title: string;
  total: number;
  valid: number;
  errors: Array<{ row: number; messages: string[] }>;
  imported: number;
}

const TYPES: Array<{ key: ImportType; title: string; icon: string; desc: string }> = [
  { key: 'employees', title: 'Nhân viên mới', icon: 'bi-person-plus', desc: 'Hồ sơ, hợp đồng làm việc, phòng ban, chức danh, lương cơ bản' },
  { key: 'salaries', title: 'Điều chỉnh lương', icon: 'bi-cash-coin', desc: 'Mức lương mới theo ngày hiệu lực; mức cũ tự kết thúc' },
  { key: 'attendance', title: 'Chấm công', icon: 'bi-calendar-check', desc: 'Dữ liệu từ máy chấm công: ngày, trạng thái, giờ vào/ra' },
];

/** Đọc file thành base64 (bỏ tiền tố data:...). */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ImportPage() {
  const [type, setType] = useState<ImportType>('employees');
  const [fileName, setFileName] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canImport = useCanWrite('corehr');
  const toast = useToast();

  const reset = () => {
    setFileName(null);
    setBase64(null);
    setResult(null);
    setError(null);
  };

  async function send(commit: boolean, data = base64) {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ data: ImportResult }>(`/import/${type}`, { file: data, commit }, { timeout: 120_000 });
      setResult(res.data.data);
      if (commit && res.data.data.imported > 0) toast(`Đã nhập ${res.data.data.imported} dòng`);
    } catch (err) {
      setError(errorMessage(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setError('Chỉ nhận file .xlsx');
      return;
    }
    if (f.size > 7 * 1024 * 1024) {
      setError('File quá lớn (tối đa 7MB)');
      return;
    }
    setFileName(f.name);
    const data = await readBase64(f);
    setBase64(data);
    await send(false, data); // kiểm tra ngay khi chọn file
  }

  const current = TYPES.find((t) => t.key === type)!;

  return (
    <>
      <PageHeader
        title="Nhập / xuất Excel"
        subtitle="Tải file mẫu, điền dữ liệu, tải lên để kiểm tra. Chỉ khi không còn lỗi mới được nhập — và nhập tất cả hoặc không dòng nào."
        actions={
          <ActionButton
            label={<><i className="bi bi-download me-1" />Xuất danh sách nhân sự</>}
            className="btn btn-outline-secondary"
            run={() => downloadFile('/import/export/employees', 'danh-sach-nhan-su.xlsx')}
          />
        }
      />

      {!canImport ? (
        <div className="alert alert-info">Chỉ Nhân sự hoặc Quản trị được nhập dữ liệu. Bạn vẫn có thể xuất danh sách nhân sự.</div>
      ) : (
        <>
          <div className="row g-3 mb-3">
            {TYPES.map((t) => (
              <div key={t.key} className="col-md-4">
                <button
                  className={`card h-100 w-100 text-start shadow-sm ${type === t.key ? 'border-primary border-2' : ''}`}
                  style={{ background: 'var(--bs-body-bg)' }}
                  onClick={() => {
                    setType(t.key);
                    reset();
                  }}
                >
                  <div className="card-body">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <i className={`bi ${t.icon} fs-5 text-primary`} />
                      <strong>{t.title}</strong>
                    </div>
                    <div className="small text-body-secondary">{t.desc}</div>
                  </div>
                </button>
              </div>
            ))}
          </div>

          <Card title={`Nhập: ${current.title}`}>
            <ol className="mb-3">
              <li className="mb-2">
                <ActionButton
                  label={<><i className="bi bi-file-earmark-spreadsheet me-1" />Tải file mẫu</>}
                  className="btn btn-sm btn-outline-primary"
                  run={() => downloadFile(`/import/templates/${type}`, `mau-nhap-${type}.xlsx`)}
                />{' '}
                <span className="small text-body-secondary">— có sheet “Hướng dẫn”{type === 'employees' && ' và danh sách mã phòng ban, chức danh'}.</span>
              </li>
              <li className="mb-2">Điền dữ liệu vào sheet “Dữ liệu”, không đổi tên cột.</li>
              <li>
                <label className="btn btn-sm btn-primary mb-0">
                  <i className="bi bi-upload me-1" />
                  Chọn file để kiểm tra
                  <input type="file" accept=".xlsx" hidden onChange={onFile} />
                </label>{' '}
                {fileName && <span className="small">{fileName}</span>}
                {busy && <span className="spinner-border spinner-border-sm ms-2" />}
              </li>
            </ol>

            {error && <div className="alert alert-danger mb-0">{error}</div>}

            {result && (
              <>
                <div className="row g-2 text-center mb-3">
                  {[
                    ['Tổng số dòng', result.total, ''],
                    ['Hợp lệ', result.valid, 'text-success'],
                    ['Có lỗi', result.errors.length, result.errors.length ? 'text-danger' : ''],
                  ].map(([label, value, cls]) => (
                    <div key={label} className="col">
                      <div className="border rounded p-2">
                        <div className={`fs-4 fw-bold ${cls}`}>{value}</div>
                        <div className="small text-body-secondary">{label}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {result.imported > 0 ? (
                  <div className="alert alert-success d-flex justify-content-between align-items-center">
                    <span>
                      <i className="bi bi-check-circle me-2" />
                      Đã nhập thành công {result.imported} dòng.
                    </span>
                    <button className="btn btn-sm btn-outline-success" onClick={reset}>Nhập file khác</button>
                  </div>
                ) : result.errors.length > 0 ? (
                  <>
                    <div className="alert alert-warning">
                      <i className="bi bi-exclamation-triangle me-2" />
                      Sửa các lỗi dưới đây trong file rồi chọn lại file. Chưa có dòng nào được nhập.
                    </div>
                    <div className="table-responsive" style={{ maxHeight: 420 }}>
                      <table className="table table-sm align-top">
                        <thead className="table-light">
                          <tr>
                            <th style={{ width: 80 }}>Dòng</th>
                            <th>Lỗi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.errors.map((e) => (
                            <tr key={e.row}>
                              <td className="fw-semibold">{e.row}</td>
                              <td>
                                <ul className="mb-0 ps-3">
                                  {e.messages.map((m) => (
                                    <li key={m}>{m}</li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="alert alert-info d-flex flex-wrap justify-content-between align-items-center gap-2 mb-0">
                    <span>
                      <i className="bi bi-check2-all me-2" />
                      Tất cả {result.valid} dòng hợp lệ. Bấm “Nhập” để ghi vào hệ thống.
                    </span>
                    <button className="btn btn-primary" disabled={busy} onClick={() => send(true)}>
                      {busy ? 'Đang nhập…' : `Nhập ${result.valid} dòng`}
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
