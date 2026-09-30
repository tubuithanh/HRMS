import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataTable, ErrorBox, Loading } from '../../components/ui';
import { ChartCard, ColumnChart, compact, fmtNumber, fmtPercent, HBarChart, LineChart, Sparkline } from '../../components/charts';
import { useFetch } from '../../lib/hooks';
import { date, dateTime, labels, money } from '../../lib/format';
import { AttendanceStatus, LaborContract, LeaveRequest } from '../../types/models';
import { ContractWarning } from '../persons/EmploymentExtras';
import { leaveRange } from '../leave/LeaveAdminPage';

// ----- Dữ liệu từ API -----

interface Summary {
  activeEmployees: number;
  probationEmployees: number;
  newHiresThisMonth: number;
  pendingLeaves: number;
  pendingOvertime: number;
  onLeaveToday: number;
  onLeaveTodayList: Array<LeaveRequest & { leaveType: { name: string } }>;
  openOpenings: number;
  activeApplications: number;
  expiringDocuments: number;
  expiringContracts: number;
  attendanceToday: Partial<Record<AttendanceStatus, number>>;
  headcountByOrg: Array<{ name: string; count: number }>;
  genders: Record<string, number>;
  probationEnding: Array<{ id: string; codeEmp: string; probationEndDate: string; person: { id: string; fullName: string } }>;
  pendingLeaveList: LeaveRequest[];
  upcomingInterviews: Array<{ id: string; fullName: string; interviewAt: string; jobOpening: { id: string; title: string } }>;
}

interface Trends {
  months: number;
  headcount: Array<{ month: string; headcount: number; hires: number; terminations: number }>;
  turnoverYtd: number | null;
  avgTenureYears: number | null;
  payroll: Array<{ code: string; status: string; employees: number; gross: string; net: string; companyInsurance: string; pit: string }>;
  attendance: Array<{ date: string; staff: number; worked: number; late: number; onLeave: number; rate: number | null }>;
  leaveDays: Array<{ label: string; days: number }>;
  tenure: Array<{ label: string; count: number }>;
  age: Array<{ label: string; count: number }>;
}

const monthLabel = (m: string) => `T${Number(m.slice(5))}/${m.slice(2, 4)}`;
const dayLabel = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const vnd = (v: number) => `${money(v)}đ`;

// ----- KPI -----

function Delta({ value, suffix = '', compareTo }: { value: number | null; suffix?: string; compareTo: string }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-body-secondary small">Chưa có dữ liệu {compareTo}</span>;
  const icon = value > 0 ? 'bi-arrow-up-right' : value < 0 ? 'bi-arrow-down-right' : 'bi-dash';
  return (
    <span className="kpi-delta text-body-secondary">
      <i className={`bi ${icon}`} /> {value > 0 ? '+' : ''}
      {fmtNumber(value)}
      {suffix} <span className="fw-normal">{compareTo}</span>
    </span>
  );
}

function Kpi(props: { label: string; value: ReactNode; delta?: ReactNode; hint?: ReactNode; trend?: number[]; icon: string }) {
  return (
    <div className="col-12 col-sm-6 col-xl">
      <div className="card shadow-sm h-100">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="small text-body-secondary">{props.label}</span>
            <i className={`bi ${props.icon} text-body-secondary`} />
          </div>
          <div className="kpi-value">{props.value}</div>
          <div className="mt-1" style={{ minHeight: 20 }}>{props.delta}</div>
          {props.hint && <div className="small text-body-secondary">{props.hint}</div>}
          {props.trend && props.trend.length > 1 && (
            <div className="mt-2">
              <Sparkline values={props.trend} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TodoPill(props: { icon: string; label: string; count: number; to?: string; hint?: string }) {
  const attention = props.count > 0;
  const body = (
    <>
      <i className={`bi ${props.icon} fs-5 ${attention ? 'text-warning-emphasis' : 'text-success'}`} />
      <div style={{ minWidth: 0 }}>
        <div className="small fw-semibold text-truncate">{props.label}</div>
        {props.hint && <div className="small text-body-secondary text-truncate">{props.hint}</div>}
      </div>
      <span className="count">{props.count}</span>
    </>
  );
  return (
    <div className="col-12 col-sm-6 col-lg">
      {props.to ? <Link to={props.to} className="todo-pill">{body}</Link> : <div className="todo-pill">{body}</div>}
    </div>
  );
}

function SimpleList<T>(props: { rows: T[]; empty: string; render: (r: T) => ReactNode; rowKey: (r: T) => string }) {
  if (props.rows.length === 0) return <div className="muted small">{props.empty}</div>;
  return (
    <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
      {props.rows.map((r) => (
        <li key={props.rowKey(r)}>{props.render(r)}</li>
      ))}
    </ul>
  );
}

// ----- Trang -----

export default function StaffDashboard() {
  const [months, setMonths] = useState(12);
  const summary = useFetch<Summary>('/dashboard');
  const trends = useFetch<Trends>(`/dashboard/trends?months=${months}`);
  const contracts = useFetch<LaborContract[]>('/corehr/contracts/expiring?days=30');

  const d = summary.data;
  const t = trends.data;
  if ((summary.loading && !d) || (trends.loading && !t)) return <Loading />;
  if (!d || !t) return <ErrorBox error={summary.error ?? trends.error} />;

  // KPI tính từ chuỗi xu hướng
  const hc = t.headcount;
  const hcDelta = hc.length >= 2 ? hc[hc.length - 1].headcount - hc[hc.length - 2].headcount : null;
  const cost = t.payroll.map((p) => Number(p.gross) + Number(p.companyInsurance));
  const lastCost = cost.length ? cost[cost.length - 1] : null;
  const costDelta = cost.length >= 2 && cost[cost.length - 2] > 0 ? ((cost[cost.length - 1] - cost[cost.length - 2]) / cost[cost.length - 2]) * 100 : null;
  const rates = t.attendance.map((a) => a.rate).filter((r): r is number => r !== null);
  const todayRate = t.attendance[t.attendance.length - 1]?.rate ?? null;
  const thisYear = String(new Date().getFullYear());
  const leftYtd = hc.filter((m) => m.month.startsWith(thisYear)).reduce((s, m) => s + m.terminations, 0);
  const genderText = Object.entries(d.genders)
    .map(([g, n]) => `${labels.gender[g as keyof typeof labels.gender] ?? 'Chưa rõ'} ${n}`)
    .join(' · ');

  return (
    <>
      {/* Bộ lọc: một hàng phía trên, áp dụng cho mọi biểu đồ xu hướng */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span className="small text-body-secondary">Xu hướng:</span>
        <div className="btn-group btn-group-sm" role="group" aria-label="Khoảng thời gian">
          {[6, 12, 24].map((m) => (
            <button key={m} className={`btn ${months === m ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setMonths(m)}>
              {m} tháng
            </button>
          ))}
        </div>
        {trends.loading && <span className="spinner-border spinner-border-sm text-secondary" />}
      </div>

      {/* KPI chính */}
      <div className="row g-3 mb-3">
        <Kpi
          label="Quân số"
          icon="bi-people"
          value={d.activeEmployees}
          delta={<Delta value={hcDelta} compareTo="so với tháng trước" />}
          hint={genderText || undefined}
          trend={hc.map((m) => m.headcount)}
        />
        <Kpi
          label="Chi phí nhân sự kỳ gần nhất"
          icon="bi-cash-stack"
          value={lastCost !== null ? compact(lastCost) : '—'}
          delta={<Delta value={costDelta !== null ? Math.round(costDelta * 10) / 10 : null} suffix="%" compareTo="so với kỳ trước" />}
          hint={t.payroll.length ? `Kỳ ${t.payroll[t.payroll.length - 1].code} · gross + BH công ty` : undefined}
          trend={cost}
        />
        <Kpi
          label="Tỷ lệ đi làm hôm nay"
          icon="bi-person-check"
          value={todayRate !== null ? fmtPercent(todayRate) : '—'}
          hint={`${d.onLeaveToday} nghỉ phép · ${d.attendanceToday.LATE ?? 0} đi muộn`}
          trend={rates}
        />
        <Kpi
          label="Tỷ lệ nghỉ việc từ đầu năm"
          icon="bi-box-arrow-right"
          value={t.turnoverYtd !== null ? fmtPercent(t.turnoverYtd) : '—'}
          hint={`${leftYtd} người nghỉ · ${d.newHiresThisMonth} vào làm tháng này`}
        />
        <Kpi
          label="Thâm niên bình quân"
          icon="bi-award"
          value={t.avgTenureYears !== null ? `${fmtNumber(t.avgTenureYears)} năm` : '—'}
          hint={`${d.probationEmployees} đang thử việc`}
        />
      </div>

      {/* Việc cần xử lý */}
      <h2 className="h6 text-body-secondary text-uppercase small fw-semibold mb-2">Việc cần xử lý</h2>
      <div className="row g-2 mb-4">
        <TodoPill icon="bi-hourglass-split" label="Đơn nghỉ chờ duyệt" count={d.pendingLeaves} to="/leave" />
        <TodoPill icon="bi-moon-stars" label="Làm thêm chờ duyệt" count={d.pendingOvertime} to="/overtime" />
        <TodoPill icon="bi-file-earmark-text" label="Hợp đồng hết hạn" hint="trong 30 ngày" count={d.expiringContracts} />
        <TodoPill icon="bi-alarm" label="Hết thử việc" hint="trong 30 ngày" count={d.probationEnding.length} />
        <TodoPill icon="bi-passport" label="Giấy tờ hết hạn" hint="GPLĐ, thẻ tạm trú · 60 ngày" count={d.expiringDocuments} />
        <TodoPill icon="bi-person-plus" label="Hồ sơ ứng tuyển" hint={`${d.openOpenings} tin đang mở`} count={d.activeApplications} to="/recruitment" />
      </div>

      {/* Biểu đồ — giữ khung cũ, làm mờ khi đang tải lại */}
      <div style={{ opacity: trends.loading ? 0.5 : 1, transition: 'opacity .15s' }}>
        <div className="row g-3 mb-3">
          <div className="col-xl-8">
            <ChartCard
              title="Quân số theo tháng"
              subtitle={`Số nhân viên cuối mỗi tháng · ${months} tháng gần nhất`}
              table={{ columns: ['Tháng', 'Quân số', 'Tuyển mới', 'Nghỉ việc'], rows: hc.map((m) => [monthLabel(m.month), m.headcount, m.hires, m.terminations]) }}
            >
              <LineChart labels={hc.map((m) => monthLabel(m.month))} series={[{ key: 'headcount', label: 'Quân số' }]} data={hc.map((m) => ({ headcount: m.headcount }))} endLabel height={240} />
            </ChartCard>
          </div>
          <div className="col-xl-4">
            <ChartCard
              title="Nhân sự theo khối"
              subtitle="Theo vị trí chính đang giữ · chi tiết ở trang Tổ chức"
              table={{ columns: ['Khối', 'Số người'], rows: d.headcountByOrg.map((r) => [r.name, r.count]) }}
            >
              <HBarChart rows={d.headcountByOrg.map((r) => ({ label: r.name, value: r.count }))} unit="người" />
            </ChartCard>
          </div>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-lg-6">
            <ChartCard
              title="Tuyển mới và nghỉ việc"
              subtitle="Số người theo tháng"
              series={[
                { key: 'hires', label: 'Tuyển mới' },
                { key: 'terminations', label: 'Nghỉ việc' },
              ]}
              table={{ columns: ['Tháng', 'Tuyển mới', 'Nghỉ việc'], rows: hc.map((m) => [monthLabel(m.month), m.hires, m.terminations]) }}
            >
              <ColumnChart
                labels={hc.map((m) => monthLabel(m.month))}
                series={[
                  { key: 'hires', label: 'Tuyển mới' },
                  { key: 'terminations', label: 'Nghỉ việc' },
                ]}
                data={hc.map((m) => ({ hires: m.hires, terminations: m.terminations }))}
              />
            </ChartCard>
          </div>
          <div className="col-lg-6">
            <ChartCard
              title="Chi phí nhân sự theo kỳ lương"
              subtitle="Tổng thu nhập (gross) và BH công ty đóng"
              series={[
                { key: 'gross', label: 'Gross' },
                { key: 'companyInsurance', label: 'BH công ty' },
              ]}
              table={{
                columns: ['Kỳ', 'Nhân viên', 'Gross', 'BH công ty', 'Thực nhận', 'Thuế TNCN'],
                rows: t.payroll.map((p) => [p.code, p.employees, money(p.gross), money(p.companyInsurance), money(p.net), money(p.pit)]),
              }}
            >
              {t.payroll.length === 0 ? (
                <div className="empty">Chưa có kỳ lương nào được tính</div>
              ) : (
                <ColumnChart
                  stacked
                  labels={t.payroll.map((p) => p.code)}
                  series={[
                    { key: 'gross', label: 'Gross' },
                    { key: 'companyInsurance', label: 'BH công ty' },
                  ]}
                  data={t.payroll.map((p) => ({ gross: Number(p.gross), companyInsurance: Number(p.companyInsurance) }))}
                  format={compact}
                  tipFormat={vnd}
                />
              )}
            </ChartCard>
          </div>
        </div>

        <div className="row g-3 mb-4">
          <div className="col-lg-6">
            <ChartCard
              title="Tỷ lệ đi làm"
              subtitle="Đã chấm công / (quân số − nghỉ phép) · 14 ngày làm việc gần nhất"
              table={{
                columns: ['Ngày', 'Tỷ lệ', 'Đã chấm', 'Đi muộn', 'Nghỉ phép', 'Quân số'],
                rows: t.attendance.map((a) => [dayLabel(a.date), a.rate === null ? '—' : fmtPercent(a.rate), a.worked, a.late, a.onLeave, a.staff]),
              }}
            >
              <LineChart
                labels={t.attendance.map((a) => dayLabel(a.date))}
                series={[{ key: 'rate', label: 'Tỷ lệ đi làm' }]}
                data={t.attendance.map((a) => ({ rate: a.rate }))}
                format={(v) => `${v}%`}
                tipFormat={fmtPercent}
                yMax={100}
                endLabel
              />
            </ChartCard>
          </div>
          <div className="col-sm-6 col-lg-3">
            <ChartCard title="Thâm niên" subtitle="Nhân viên đang làm" table={{ columns: ['Nhóm', 'Số người'], rows: t.tenure.map((r) => [r.label, r.count]) }}>
              <HBarChart rows={t.tenure.map((r) => ({ label: r.label, value: r.count }))} unit="người" />
            </ChartCard>
          </div>
          <div className="col-sm-6 col-lg-3">
            <ChartCard title="Độ tuổi" subtitle="Nhân viên đang làm" table={{ columns: ['Nhóm', 'Số người'], rows: t.age.map((r) => [r.label, r.count]) }}>
              <HBarChart rows={t.age.map((r) => ({ label: r.label, value: r.count }))} unit="người" />
            </ChartCard>
          </div>
        </div>
      </div>

      {/* Tác nghiệp */}
      <h2 className="h6 text-body-secondary text-uppercase small fw-semibold mb-2">Tác nghiệp</h2>
      <div className="row g-3">
        <div className="col-xl-6">
          <Card title={`Đơn nghỉ chờ duyệt (${d.pendingLeaves})`} actions={<Link to="/leave" className="btn btn-sm btn-outline-secondary">Duyệt</Link>} flush>
            <DataTable
              rows={d.pendingLeaveList}
              rowKey={(r) => r.id}
              empty="Không có đơn nào chờ duyệt"
              columns={[
                { header: 'Nhân viên', cell: (r) => r.employment?.person.fullName },
                { header: 'Loại', cell: (r) => r.leaveType.name },
                { header: 'Thời gian', cell: (r) => leaveRange(r), className: 'nowrap' },
                { header: 'Ngày', cell: (r) => r.days, className: 'num' },
              ]}
            />
          </Card>
        </div>
        <div className="col-xl-6">
          <Card title="Hợp đồng sắp / đã hết hạn" flush>
            <DataTable
              rows={contracts.data ?? []}
              rowKey={(c) => c.id}
              empty="Không có hợp đồng nào cần xử lý"
              columns={[
                { header: 'Nhân viên', cell: (c) => <Link to={`/persons/${c.employment?.person.id}`}>{c.employment?.person.fullName}</Link> },
                { header: 'Số HĐ', cell: (c) => c.contractNo },
                { header: 'Loại', cell: (c) => labels.contractType[c.contractType] },
                { header: 'Hết hạn', cell: (c) => date(c.endDate), className: 'nowrap' },
                { header: '', cell: (c) => <ContractWarning c={c} /> },
              ]}
            />
          </Card>
        </div>
        <div className="col-md-6 col-xl-3">
          <Card title={`Nghỉ hôm nay (${d.onLeaveToday})`}>
            <SimpleList
              rows={d.onLeaveTodayList}
              rowKey={(l) => l.id}
              empty="Không ai nghỉ hôm nay"
              render={(l) => (
                <>
                  <div>{l.employment?.person.fullName}</div>
                  <div className="small text-body-secondary">{l.leaveType.name} · đến {date(l.toDate)}</div>
                </>
              )}
            />
          </Card>
        </div>
        <div className="col-md-6 col-xl-3">
          <Card title="Sắp hết thử việc">
            <SimpleList
              rows={d.probationEnding}
              rowKey={(e) => e.id}
              empty="Không có ai trong 30 ngày tới"
              render={(e) => (
                <div className="d-flex justify-content-between gap-2">
                  <Link to={`/persons/${e.person.id}`}>{e.person.fullName}</Link>
                  <span className="small text-body-secondary">{date(e.probationEndDate)}</span>
                </div>
              )}
            />
          </Card>
        </div>
        <div className="col-md-6 col-xl-3">
          <Card title="Lịch phỏng vấn">
            <SimpleList
              rows={d.upcomingInterviews}
              rowKey={(i) => i.id}
              empty="Không có lịch phỏng vấn"
              render={(i) => (
                <>
                  <div className="fw-semibold">{i.fullName}</div>
                  <div className="small text-body-secondary">
                    {dateTime(i.interviewAt)} · <Link to={`/recruitment/${i.jobOpening.id}`}>{i.jobOpening.title}</Link>
                  </div>
                </>
              )}
            />
          </Card>
        </div>
        <div className="col-md-6 col-xl-3">
          <Card title={`Ngày nghỉ theo loại · ${thisYear}`}>
            <HBarChart rows={t.leaveDays.map((l) => ({ label: l.label, value: l.days }))} unit="ngày" />
          </Card>
        </div>
      </div>
    </>
  );
}
