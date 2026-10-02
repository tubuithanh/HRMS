import { useState } from 'react';
import PayslipView from '../../components/PayslipView';
import { ActionButton, Card, DataTable, Loading, PageHeader } from '../../components/ui';
import { downloadFile, useFetch } from '../../lib/hooks';
import { date, money } from '../../lib/format';
import { PayrollResult } from '../../types/models';
import { SelfServiceError } from './MyProfilePage';

type Slip = Omit<PayrollResult, 'employment'> & {
  payPeriod: { code: string; dateStart: string; dateEnd: string; payDate: string | null };
};

export default function MyPayslipsPage() {
  const { data, error, loading } = useFetch<Slip[]>('/me/payslips');
  const [viewing, setViewing] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Phiếu lương" subtitle="Chỉ hiện các kỳ lương đã khoá" />
      <SelfServiceError error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <Card flush>
            <DataTable
              rows={data}
              rowKey={(s) => s.id}
              empty="Chưa có phiếu lương nào"
              columns={[
                { header: 'Kỳ', cell: (s) => <><strong>{s.payPeriod.code}</strong><div className="muted">{date(s.payPeriod.dateStart)} – {date(s.payPeriod.dateEnd)}</div></> },
                { header: 'Công', cell: (s) => (s.paidDays !== null ? `${Number(s.paidDays)}/${s.standardDays}` : '—'), className: 'num' },
                { header: 'Tổng thu nhập', cell: (s) => money(s.grossIncome), className: 'num' },
                { header: 'Bảo hiểm', cell: (s) => money(s.empInsurance), className: 'num' },
                { header: 'Thuế TNCN', cell: (s) => money(s.pitAmount), className: 'num' },
                { header: 'Khấu trừ khác', cell: (s) => money(s.otherDeductions), className: 'num' },
                { header: 'Thực nhận', cell: (s) => <strong>{money(s.netPay)}</strong>, className: 'num' },
                {
                  header: '',
                  className: 'actions',
                  cell: (s) => (
                    <span className="toolbar justify-content-end">
                      <button className="btn btn-sm btn-primary" onClick={() => setViewing(s.id)}>Xem</button>
                      <ActionButton label="PDF" run={() => downloadFile(`/me/payslips/${s.id}/pdf`, `phieu-luong-${s.payPeriod.code}.pdf`)} />
                    </span>
                  ),
                },
              ]}
            />
          </Card>
        )
      )}
      {data && <MyCertificates />}
      {viewing && <PayslipView path={`/me/payslips/${viewing}`} pdfPath={`/me/payslips/${viewing}/pdf`} onClose={() => setViewing(null)} />}
    </>
  );
}

interface MyCertificate {
  id: string;
  seq: number;
  symbol: string;
  fromMonth: number;
  toMonth: number;
  taxableIncome: string;
  taxWithheld: string;
}

/** Chứng từ khấu trừ thuế TNCN của chính mình (kế toán lập). */
function MyCertificates() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, loading } = useFetch<MyCertificate[]>(`/me/pit-certificates?year=${year}`, [year]);
  return (
    <Card
      title="Chứng từ khấu trừ thuế TNCN"
      flush
      actions={
        <select className="form-select form-select-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[0, 1, 2].map((k) => {
            const y = new Date().getFullYear() - k;
            return <option key={y} value={y}>Năm {y}</option>;
          })}
        </select>
      }
    >
      <DataTable
        rows={data}
        loading={loading}
        rowKey={(c) => c.id}
        empty="Chưa có chứng từ — liên hệ kế toán nếu bạn cần để tự quyết toán thuế"
        columns={[
          { header: 'Số', cell: (c) => `${c.symbol} · ${String(c.seq).padStart(7, '0')}` },
          { header: 'Kỳ', cell: (c) => `Tháng ${c.fromMonth} – ${c.toMonth}` },
          { header: 'Thu nhập chịu thuế', cell: (c) => money(c.taxableIncome), className: 'num' },
          { header: 'Thuế đã khấu trừ', cell: (c) => money(c.taxWithheld), className: 'num' },
          {
            header: '',
            className: 'actions',
            cell: (c) => <ActionButton label="PDF" run={() => downloadFile(`/me/pit-certificates/${c.id}/pdf`, `chung-tu-khau-tru-${year}.pdf`)} />,
          },
        ]}
      />
    </Card>
  );
}
