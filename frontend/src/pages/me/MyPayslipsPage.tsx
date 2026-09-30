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
      {viewing && <PayslipView path={`/me/payslips/${viewing}`} pdfPath={`/me/payslips/${viewing}/pdf`} onClose={() => setViewing(null)} />}
    </>
  );
}
