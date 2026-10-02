import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { Card, ErrorBox, FieldDef, FormFields, Loading, PageHeader, toBody, useToast } from '../components/ui';
import { useFetch } from '../lib/hooks';
import { dateTime, money } from '../lib/format';

interface SettingsData {
  settings: {
    attendance: { workStart: string; workEnd: string; lateGraceMinutes: number; nightAllowancePercent: number; deductLateEarly: boolean; overtimeSuggestMinutes: number };
    checkin: { mode: string; lat: number | null; lng: number | null; radiusMeters: number; allowedIps: string };
    payroll: { defaultRegion: number; payDay: number };
    approval: { twoStep: boolean };
    security: { maxFailedLogins: number; lockMinutes: number; sessionHours: number; resetTokenMinutes: number };
  };
  company: { name: string; taxCode: string | null; address: string | null };
  legal: {
    personalDeduction: string;
    dependantDeduction: string;
    baseSalary: string;
    minWageRegion: Record<string, string>;
    pitBrackets: Array<{ from: string; to: string | null; rate: string }>;
    insurance: Array<{ type: string; employeeRate: string; companyRate: string; cap: string }>;
  };
  mail: { configured: boolean; host: string | null; from: string; appUrl: string };
  clientIp: string | null;
}

type Values = Record<string, string | boolean>;

const toValues = (obj: object): Values =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'boolean' ? v : v === null ? '' : String(v)]));

/** Một khung cấu hình: form + nút lưu riêng. */
function Section(props: {
  title: string;
  icon: string;
  description?: ReactNode;
  fields: FieldDef[];
  initial: object;
  save: (body: Record<string, unknown>) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Values>(() => toValues(props.initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => setValues(toValues(props.initial)), [props.initial]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await props.save(toBody(props.fields, values));
      toast(`Đã lưu: ${props.title}`);
      props.onSaved();
    } catch (err) {
      const details = (err as { response?: { data?: { error?: { details?: Record<string, string[]> } } } }).response?.data?.error?.details;
      setError(details ? Object.values(details).flat().join(' · ') : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={
        <h2 className="h6 mb-0">
          <i className={`bi ${props.icon} me-2 text-primary`} />
          {props.title}
        </h2>
      }
    >
      <form onSubmit={submit}>
        {props.description && <p className="small text-body-secondary mt-0">{props.description}</p>}
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <FormFields fields={props.fields} values={values} onChange={(n, v) => setValues((s) => ({ ...s, [n]: v }))} />
        <div className="d-flex justify-content-end mt-3">
          <button className="btn btn-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </form>
    </Card>
  );
}

const pct = (r: string) => `${(Number(r) * 100).toLocaleString('vi-VN')}%`;

export default function SettingsPage() {
  const { data, error, loading, reload } = useFetch<SettingsData>('/settings');
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const s = data.settings;
  const saveGroup = (group: string) => (body: Record<string, unknown>) => api.put('/settings', { [group]: body });

  async function testEmail(e: FormEvent) {
    e.preventDefault();
    setTestMsg(null);
    try {
      const res = await api.post('/settings/test-email', { to: testTo });
      setTestMsg(res.data.data.configured ? `Đã gửi email thử tới ${testTo}. Hãy kiểm tra hộp thư.` : 'Chưa cấu hình SMTP: nội dung email đã được in ra log của server.');
    } catch (err) {
      setTestMsg(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Cấu hình hệ thống" subtitle="Thay đổi có hiệu lực ngay (tối đa sau 15 giây) và được ghi vào nhật ký thao tác." />
      <div className="row g-3">
        <div className="col-xl-6">
          <Section
            title="Thông tin công ty"
            icon="bi-building"
            description="In trên phiếu lương và báo cáo."
            fields={[
              { name: 'name', label: 'Tên công ty', required: true, full: true },
              { name: 'taxCode', label: 'Mã số thuế', nullable: true },
              { name: 'address', label: 'Địa chỉ', nullable: true, full: true },
            ]}
            initial={data.company}
            save={(body) => api.put('/settings/company', body)}
            onSaved={reload}
          />
          <Section
            title="Chấm công"
            icon="bi-clock"
            description="Giờ hành chính áp cho người không có ca. Người có ca: đi muộn / về sớm theo giờ ca."
            fields={[
              { name: 'workStart', label: 'Giờ vào làm (HH:mm)', required: true, placeholder: '08:30' },
              { name: 'workEnd', label: 'Giờ tan ca (HH:mm)', required: true, placeholder: '17:30' },
              { name: 'lateGraceMinutes', label: 'Số phút cho phép đi muộn', type: 'number', required: true },
              { name: 'nightAllowancePercent', label: 'Phụ cấp làm đêm (% lương giờ, tối thiểu 30)', type: 'number', required: true },
              { name: 'overtimeSuggestMinutes', label: 'Gợi ý làm thêm giờ khi ở lại sau ca từ (phút)', type: 'number', required: true },
              { name: 'deductLateEarly', label: 'Trừ lương theo số phút đi muộn / về sớm', type: 'checkbox', full: true },
            ]}
            initial={s.attendance}
            save={saveGroup('attendance')}
            onSaved={reload}
          />
          <Section
            title="Tính lương"
            icon="bi-cash-coin"
            fields={[
              {
                name: 'defaultRegion',
                label: 'Vùng lương tối thiểu mặc định',
                type: 'select',
                required: true,
                options: [1, 2, 3, 4].map((r) => ({ value: String(r), label: `Vùng ${r} — ${money(data.legal.minWageRegion[r])}đ` })),
              },
              { name: 'payDay', label: 'Ngày trả lương (ngày của tháng sau)', type: 'number', required: true },
            ]}
            initial={s.payroll}
            save={(body) => api.put('/settings', { payroll: { defaultRegion: Number(body.defaultRegion), payDay: body.payDay } })}
            onSaved={reload}
          />
          <Section
            title="Quy trình duyệt"
            icon="bi-diagram-2"
            description="Bật: đơn nghỉ phép và làm thêm giờ qua quản lý trực tiếp duyệt trước, rồi tới nhân sự. Tắt: đơn đi thẳng tới nhân sự. Chỉ áp dụng cho đơn tạo mới."
            fields={[{ name: 'twoStep', label: 'Duyệt 2 cấp (quản lý trực tiếp → nhân sự)', type: 'checkbox', full: true }]}
            initial={s.approval}
            save={saveGroup('approval')}
            onSaved={reload}
          />
        </div>

        <div className="col-xl-6">
          <Section
            title="Giới hạn vị trí chấm công"
            icon="bi-geo-alt"
            description={
              <>
                Áp cho nhân viên tự chấm công. GPS: trong bán kính quanh văn phòng (lấy toạ độ trên Google Maps: chuột phải vào vị trí → bấm dòng toạ độ để sao chép).
                IP: chỉ khi dùng mạng công ty — nhập IP hoặc dải mạng, vd <code>203.113.10.0/24</code>.
                {data.clientIp && <> IP bạn đang dùng: <code>{data.clientIp}</code>.</>}
              </>
            }
            fields={[
              {
                name: 'mode',
                label: 'Chế độ',
                type: 'select',
                required: true,
                options: [
                  { value: 'OFF', label: 'Không giới hạn' },
                  { value: 'GPS', label: 'Theo vị trí GPS' },
                  { value: 'IP', label: 'Theo mạng công ty (IP)' },
                  { value: 'GPS_OR_IP', label: 'GPS hoặc mạng công ty' },
                ],
              },
              { name: 'radiusMeters', label: 'Bán kính cho phép (mét)', type: 'number', required: true },
              { name: 'lat', label: 'Vĩ độ văn phòng', type: 'number', nullable: true },
              { name: 'lng', label: 'Kinh độ văn phòng', type: 'number', nullable: true },
              { name: 'allowedIps', label: 'IP / dải mạng cho phép (mỗi dòng một mục)', type: 'textarea', full: true },
            ]}
            initial={s.checkin}
            save={(body) => api.put('/settings', { checkin: { ...body, lat: body.lat ?? null, lng: body.lng ?? null, allowedIps: body.allowedIps ?? '' } })}
            onSaved={reload}
          />
          <Section
            title="Bảo mật đăng nhập"
            icon="bi-shield-lock"
            description="Thời hạn phiên áp dụng cho lần đăng nhập tiếp theo."
            fields={[
              { name: 'maxFailedLogins', label: 'Số lần nhập sai trước khi khoá', type: 'number', required: true },
              { name: 'lockMinutes', label: 'Thời gian khoá (phút)', type: 'number', required: true },
              { name: 'sessionHours', label: 'Thời hạn phiên đăng nhập (giờ)', type: 'number', required: true },
              { name: 'resetTokenMinutes', label: 'Hiệu lực link đặt lại mật khẩu (phút)', type: 'number', required: true },
            ]}
            initial={s.security}
            save={saveGroup('security')}
            onSaved={reload}
          />

          <DailyJobsCard />
          <Card title={<h2 className="h6 mb-0"><i className="bi bi-envelope me-2 text-primary" />Gửi email</h2>}>
            <dl className="kv small mb-3">
              <dt>Trạng thái</dt>
              <dd>{data.mail.configured ? <span className="text-success">Đã cấu hình SMTP ({data.mail.host})</span> : <span className="text-warning-emphasis">Chưa cấu hình — email được in ra log server</span>}</dd>
              <dt>Người gửi</dt>
              <dd>{data.mail.from}</dd>
              <dt>Địa chỉ web</dt>
              <dd>{data.mail.appUrl}</dd>
            </dl>
            <form className="d-flex gap-2" onSubmit={testEmail}>
              <input type="email" className="form-control" placeholder="email nhận thử" value={testTo} onChange={(e) => setTestTo(e.target.value)} required />
              <button className="btn btn-outline-primary text-nowrap">Gửi thử</button>
            </form>
            {testMsg && <div className="small mt-2">{testMsg}</div>}
            <p className="small text-body-secondary mb-0 mt-2">
              Máy chủ email cấu hình trong <code>backend/.env</code> (<code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>...) để mật khẩu email không lưu trong database.
            </p>
          </Card>

          <Card title={<h2 className="h6 mb-0"><i className="bi bi-bank me-2 text-primary" />Tham số pháp lý đang áp dụng</h2>}>
            <table className="table table-sm small mb-2">
              <tbody>
                <tr><td>Giảm trừ bản thân / người phụ thuộc</td><td className="num">{money(data.legal.personalDeduction)} / {money(data.legal.dependantDeduction)}</td></tr>
                <tr><td>Lương cơ sở</td><td className="num">{money(data.legal.baseSalary)}</td></tr>
                <tr><td>Lương tối thiểu vùng 1–4</td><td className="num">{Object.values(data.legal.minWageRegion).map((v) => money(v)).join(' · ')}</td></tr>
                <tr><td>Bảo hiểm NLĐ đóng</td><td className="num">{data.legal.insurance.map((r) => pct(r.employeeRate)).join(' + ')}</td></tr>
              </tbody>
            </table>
            <Link to="/settings/legal" className="btn btn-sm btn-outline-primary">Xem lịch sử và cập nhật khi luật thay đổi →</Link>
          </Card>
        </div>
      </div>
    </>
  );
}

interface JobsInfo {
  state: { lastDailyRun?: string; lastSummary?: { created: number; users: number; emails: number; ranAt: string } } | null;
  cronEnabled: boolean;
}

/** Nhắc việc hằng ngày: lần chạy gần nhất, chạy ngay, hướng dẫn gọi từ dịch vụ lịch bên ngoài. */
function DailyJobsCard() {
  const { data, reload } = useFetch<JobsInfo>('/settings/jobs');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const last = data?.state?.lastSummary;
  async function run() {
    setBusy(true);
    try {
      const r = await api.post('/settings/jobs/daily');
      toast(`Đã chạy: ${r.data.data.created} thông báo mới cho ${r.data.data.users} người`);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api') as string;
  return (
    <Card title={<h2 className="h6 mb-0"><i className="bi bi-alarm me-2 text-primary" />Nhắc việc hằng ngày</h2>}>
      <p className="small text-body-secondary mt-0">
        Mỗi ngày sau 7:00: hợp đồng / thử việc / chứng chỉ / giấy phép lao động sắp hết hạn, sinh nhật, việc tiếp nhận – nghỉ việc đến hạn,
        phiếu đánh giá sắp hết hạn. Mỗi mục chỉ nhắc một lần; người có email nhận thêm email tổng hợp (khi đã cấu hình SMTP).
      </p>
      <dl className="kv small mb-3">
        <dt>Lần chạy gần nhất</dt>
        <dd>{last ? `${dateTime(last.ranAt)} · ${last.created} thông báo mới cho ${last.users} người · ${last.emails} email` : 'Chưa chạy'}</dd>
        <dt>Gọi từ bên ngoài</dt>
        <dd>
          {data?.cronEnabled ? (
            <span className="text-success">Đã bật (CRON_SECRET)</span>
          ) : (
            <span className="text-warning-emphasis">Chưa bật — đặt CRON_SECRET trong biến môi trường backend</span>
          )}
        </dd>
      </dl>
      <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={run}>{busy ? 'Đang chạy…' : 'Chạy ngay'}</button>
      <p className="small text-body-secondary mb-0 mt-3">
        Render gói miễn phí ngủ khi không có người dùng nên lịch trong server có thể lỡ giờ (hệ thống tự chạy bù khi có người mở ứng dụng).
        Để chạy đúng mỗi sáng: tạo lịch trên <code>cron-job.org</code> gọi <code>POST {apiBase}/cron/daily</code> lúc 7:05 với header{' '}
        <code>X-Cron-Secret: &lt;CRON_SECRET&gt;</code>.
      </p>
    </Card>
  );
}
