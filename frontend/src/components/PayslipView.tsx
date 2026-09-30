import { ActionButton, ErrorBox, Loading, Modal } from './ui';
import { downloadFile, useFetch } from '../lib/hooks';
import { money } from '../lib/format';

interface PayslipRow {
  label: string;
  amount: string;
  note?: string;
  bold?: boolean;
}

export interface PayslipDetail {
  companyName?: string;
  employeeName: string;
  employeeCode: string;
  periodCode: string;
  netPay: string;
  info?: Array<[string, string]>;
  sections?: Array<{ title: string; rows: PayslipRow[]; total?: { label: string; amount: string } }>;
  notes?: string[];
}

const amount = (a: string) => (a.startsWith('-') ? `−${money(a.slice(1))}` : money(a));

/**
 * Hộp thoại xem phiếu lương chi tiết.
 * path: API JSON (vd /me/payslips/:id), pdfPath: API tải PDF.
 */
export default function PayslipView(props: { path: string; pdfPath: string; onClose: () => void }) {
  const { data: p, error, loading } = useFetch<PayslipDetail>(props.path);

  return (
    <Modal title={p ? `Phiếu lương ${p.periodCode}` : 'Phiếu lương'} onClose={props.onClose} width={720}>
      <ErrorBox error={error} />
      {loading && !p && <Loading />}
      {p && (
        <>
          {p.companyName && <div className="small text-uppercase fw-semibold text-body-secondary mb-2">{p.companyName}</div>}
          <div className="row g-1 small mb-3">
            {(p.info ?? []).map(([k, v]) => (
              <div key={k} className="col-sm-6 d-flex gap-2">
                <span className="text-body-secondary" style={{ minWidth: 110 }}>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>

          {(p.sections ?? []).map((s) => (
            <div key={s.title} className="mb-3">
              <div className="fw-semibold text-primary small mb-1">{s.title}</div>
              <table className="table table-sm mb-0">
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={i}>
                      <td className={`ps-3 ${r.bold ? 'fw-semibold' : ''}`}>
                        {r.label}
                        {r.note && <div className="small text-body-secondary">{r.note}</div>}
                      </td>
                      <td className={`num ${r.bold ? 'fw-semibold' : ''}`}>{amount(r.amount)}</td>
                    </tr>
                  ))}
                  {s.total && (
                    <tr className="table-light">
                      <td className="fw-bold">{s.total.label}</td>
                      <td className="num fw-bold">{amount(s.total.amount)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}

          <div className="d-flex justify-content-between align-items-center rounded-3 px-3 py-2 bg-primary-subtle mb-2">
            <span className="fw-bold">THỰC LĨNH</span>
            <span className="fs-4 fw-bold text-primary-emphasis" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {money(p.netPay)} đ
            </span>
          </div>
          {(p.notes ?? []).map((n) => (
            <div key={n} className="small text-body-secondary">• {n}</div>
          ))}

          <div className="d-flex justify-content-end gap-2 mt-3">
            <button className="btn btn-outline-secondary" onClick={props.onClose}>Đóng</button>
            <ActionButton
              label={<><i className="bi bi-file-earmark-pdf me-1" />Tải PDF</>}
              className="btn btn-primary"
              run={() => downloadFile(props.pdfPath, `phieu-luong-${p.employeeCode}-${p.periodCode}.pdf`)}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
