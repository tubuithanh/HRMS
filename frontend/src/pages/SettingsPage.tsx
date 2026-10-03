import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { Card, ErrorBox, FieldDef, FormFields, Loading, PageHeader, Tabs, toBody, useToast } from '../components/ui';
import { useFetch } from '../lib/hooks';
import MailSettingsCard from './MailSettingsCard';
import { dateTime, money } from '../lib/format';

interface SettingsData {
  settings: {
    attendance: {
      workStart: string;
      workEnd: string;
      lateGraceMinutes: number;
      nightAllowancePercent: number;
      deductLateEarly: boolean;
      overtimeSuggestMinutes: number;
    };
    checkin: {
      mode: string;
      lat: number | null;
      lng: number | null;
      radiusMeters: number;
      allowedIps: string;
    };
    payroll: {
      defaultRegion: number;
      payDay: number;
      hoursPerDay: number;
      deductionCapPercent: number;
      noInsuranceDays: number;
      flat10Threshold: number;
    };
    overtime: Record<string, number>;
    benefits: { recoveryMaxDays: number };
    reminders: Record<string, number>;
    laborRules: Record<string, number>;
    approval: { twoStep: boolean };
    security: {
      maxFailedLogins: number;
      lockMinutes: number;
      sessionHours: number;
      resetTokenMinutes: number;
    };
  };
  company: { name: string; taxCode: string | null; address: string | null };
  legal: {
    personalDeduction: string;
    dependantDeduction: string;
    baseSalary: string;
    minWageRegion: Record<string, string>;
    pitBrackets: Array<{ from: string; to: string | null; rate: string }>;
    insurance: Array<{
      type: string;
      employeeRate: string;
      companyRate: string;
      cap: string;
    }>;
  };
  mail: {
    configured: boolean;
    mode: 'gmail-smtp' | 'gmail-api' | 'smtp' | 'log';
    host: string | null;
    from: string;
    appUrl: string;
  };
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
      const details = (
        err as {
          response?: {
            data?: { error?: { details?: Record<string, string[]> } };
          };
        }
      ).response?.data?.error?.details;
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

type TabKey = 'general' | 'attendance' | 'payroll' | 'labor' | 'notify';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'general', label: 'Chung & bảo mật' },
  { key: 'attendance', label: 'Chấm công & làm thêm' },
  { key: 'payroll', label: 'Lương & bảo hiểm' },
  { key: 'labor', label: 'Quy tắc luật lao động' },
  { key: 'notify', label: 'Email & nhắc việc' },
];

export default function SettingsPage() {
  const { data, error, loading, reload } = useFetch<SettingsData>('/settings');
  const [tab, setTab] = useState<TabKey>(() => {
    try {
      const t = localStorage.getItem('settingsTab') as TabKey | null;
      if (new URLSearchParams(window.location.search).has('gmail')) return 'notify';
      if (t && TABS.some((x) => x.key === t)) return t;
    } catch {
      /* ignore */
    }
    // Quay về từ Google (kết nối Gmail) → mở tab Email.
    return new URLSearchParams(window.location.search).has('gmail') ? 'notify' : 'general';
  });

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} />;
  const s = data.settings;
  const saveGroup = (group: string) => (body: Record<string, unknown>) => api.put('/settings', { [group]: body });

  return (
    <>
      <PageHeader title="Cấu hình hệ thống" subtitle="Thay đổi có hiệu lực ngay (tối đa sau 15 giây) và được ghi vào nhật ký thao tác." />
      <Tabs
        tabs={TABS}
        active={tab}
        onChange={(t) => {
          setTab(t);
          try {
            localStorage.setItem('settingsTab', t);
          } catch {
            /* ignore */
          }
        }}
      />
      {tab === 'general' && (
        <div className="row g-3">
          <div className="col-xl-6">
            <Section
              title="Thông tin công ty"
              icon="bi-building"
              description="In trên phiếu lương và báo cáo."
              fields={[
                {
                  name: 'name',
                  label: 'Tên công ty',
                  required: true,
                  full: true,
                },
                { name: 'taxCode', label: 'Mã số thuế', nullable: true },
                {
                  name: 'address',
                  label: 'Địa chỉ',
                  nullable: true,
                  full: true,
                },
              ]}
              initial={data.company}
              save={(body) => api.put('/settings/company', body)}
              onSaved={reload}
            />
          </div>
          <div className="col-xl-6">
            <Section
              title="Quy trình duyệt"
              icon="bi-diagram-2"
              description="Bật: đơn nghỉ phép và làm thêm giờ qua quản lý trực tiếp duyệt trước, rồi tới nhân sự. Tắt: đơn đi thẳng tới nhân sự. Chỉ áp dụng cho đơn tạo mới."
              fields={[
                {
                  name: 'twoStep',
                  label: 'Duyệt 2 cấp (quản lý trực tiếp → nhân sự)',
                  type: 'checkbox',
                  full: true,
                },
              ]}
              initial={s.approval}
              save={saveGroup('approval')}
              onSaved={reload}
            />
            <Section
              title="Bảo mật đăng nhập"
              icon="bi-shield-lock"
              description="Thời hạn phiên áp dụng cho lần đăng nhập tiếp theo."
              fields={[
                {
                  name: 'maxFailedLogins',
                  label: 'Số lần nhập sai trước khi khoá',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'lockMinutes',
                  label: 'Thời gian khoá (phút)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'sessionHours',
                  label: 'Thời hạn phiên đăng nhập (giờ)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'resetTokenMinutes',
                  label: 'Hiệu lực link đặt lại mật khẩu (phút)',
                  type: 'number',
                  required: true,
                },
              ]}
              initial={s.security}
              save={saveGroup('security')}
              onSaved={reload}
            />
          </div>
        </div>
      )}
      {tab === 'attendance' && (
        <div className="row g-3">
          <div className="col-xl-6">
            <Section
              title="Chấm công"
              icon="bi-clock"
              description="Giờ hành chính áp cho người không có ca. Người có ca: đi muộn / về sớm theo giờ ca."
              fields={[
                {
                  name: 'workStart',
                  label: 'Giờ vào làm (HH:mm)',
                  required: true,
                  placeholder: '08:30',
                },
                {
                  name: 'workEnd',
                  label: 'Giờ tan ca (HH:mm)',
                  required: true,
                  placeholder: '17:30',
                },
                {
                  name: 'lateGraceMinutes',
                  label: 'Số phút cho phép đi muộn',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'nightAllowancePercent',
                  label: 'Phụ cấp làm đêm (% lương giờ; luật hiện hành tối thiểu 30)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'overtimeSuggestMinutes',
                  label: 'Gợi ý làm thêm giờ khi ở lại sau ca từ (phút)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'deductLateEarly',
                  label: 'Trừ lương theo số phút đi muộn / về sớm',
                  type: 'checkbox',
                  full: true,
                },
              ]}
              initial={s.attendance}
              save={saveGroup('attendance')}
              onSaved={reload}
            />
            <Section
              title="Giới hạn vị trí chấm công"
              icon="bi-geo-alt"
              description={
                <>
                  Áp cho nhân viên tự chấm công. GPS: trong bán kính quanh văn phòng (lấy toạ độ trên Google Maps: chuột phải vào vị trí → bấm dòng toạ độ để
                  sao chép). IP: chỉ khi dùng mạng công ty — nhập IP hoặc dải mạng, vd <code>203.113.10.0/24</code>.
                  {data.clientIp && (
                    <>
                      {' '}
                      IP bạn đang dùng: <code>{data.clientIp}</code>.
                    </>
                  )}
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
                {
                  name: 'radiusMeters',
                  label: 'Bán kính cho phép (mét)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'lat',
                  label: 'Vĩ độ văn phòng',
                  type: 'number',
                  nullable: true,
                },
                {
                  name: 'lng',
                  label: 'Kinh độ văn phòng',
                  type: 'number',
                  nullable: true,
                },
                {
                  name: 'allowedIps',
                  label: 'IP / dải mạng cho phép (mỗi dòng một mục)',
                  type: 'textarea',
                  full: true,
                },
              ]}
              initial={s.checkin}
              save={(body) =>
                api.put('/settings', {
                  checkin: {
                    ...body,
                    lat: body.lat ?? null,
                    lng: body.lng ?? null,
                    allowedIps: body.allowedIps ?? '',
                  },
                })
              }
              onSaved={reload}
            />
          </div>
          <div className="col-xl-6">
            <Section
              title="Làm thêm giờ"
              icon="bi-moon-stars"
              description="Số trong ngoặc là mức của luật hiện hành (Điều 98, 107 BLLĐ 2019) — khi luật đổi, sửa theo mức mới. Áp dụng cho đơn tạo mới."
              fields={[
                {
                  name: 'weekday',
                  label: 'Hệ số ngày thường (1,5)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'weekdayNight',
                  label: 'Hệ số ngày thường — ban đêm (2,1)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'weekend',
                  label: 'Hệ số ngày nghỉ tuần (2)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'weekendNight',
                  label: 'Hệ số ngày nghỉ tuần — ban đêm (2,7)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'holiday',
                  label: 'Hệ số ngày lễ, Tết (3)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'holidayNight',
                  label: 'Hệ số ngày lễ — ban đêm (3,9)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'weekdayMaxHours',
                  label: 'Tối đa giờ / ngày thường (4)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'restDayMaxHours',
                  label: 'Tối đa giờ / ngày nghỉ, lễ (12)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'monthlyLimitHours',
                  label: 'Tối đa giờ / tháng (40)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'registerWindowDays',
                  label: 'Cho đăng ký trước / sau hôm nay (ngày)',
                  type: 'number',
                  required: true,
                },
              ]}
              initial={s.overtime}
              save={saveGroup('overtime')}
              onSaved={reload}
            />
          </div>
        </div>
      )}
      {tab === 'payroll' && (
        <div className="row g-3">
          <div className="col-xl-6">
            <Section
              title="Tính lương"
              icon="bi-cash-coin"
              fields={[
                {
                  name: 'defaultRegion',
                  label: 'Vùng lương tối thiểu mặc định',
                  type: 'select',
                  required: true,
                  options: [1, 2, 3, 4].map((r) => ({
                    value: String(r),
                    label: `Vùng ${r} — ${money(data.legal.minWageRegion[r])}đ`,
                  })),
                },
                {
                  name: 'payDay',
                  label: 'Ngày trả lương (ngày của tháng sau)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'hoursPerDay',
                  label: 'Giờ làm việc bình thường / ngày (luật hiện hành tối đa 8)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'deductionCapPercent',
                  label: 'Trần khấu trừ tạm ứng, bồi thường (% lương thực trả; luật hiện hành 30)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'noInsuranceDays',
                  label: 'Không đóng BH khi nghỉ không lương từ (ngày/tháng)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'flat10Threshold',
                  label: 'Khấu trừ thuế 10% khi mức trả từ (đồng)',
                  type: 'number',
                  required: true,
                },
              ]}
              initial={s.payroll}
              save={(body) =>
                api.put('/settings', {
                  payroll: {
                    ...body,
                    defaultRegion: Number(body.defaultRegion),
                  },
                })
              }
              onSaved={reload}
            />
          </div>
          <div className="col-xl-6">
            <Card
              title={
                <h2 className="h6 mb-0">
                  <i className="bi bi-bank me-2 text-primary" />
                  Tham số pháp lý đang áp dụng
                </h2>
              }
            >
              <table className="table table-sm small mb-2">
                <tbody>
                  <tr>
                    <td>Giảm trừ bản thân / người phụ thuộc</td>
                    <td className="num">
                      {money(data.legal.personalDeduction)} / {money(data.legal.dependantDeduction)}
                    </td>
                  </tr>
                  <tr>
                    <td>Lương cơ sở</td>
                    <td className="num">{money(data.legal.baseSalary)}</td>
                  </tr>
                  <tr>
                    <td>Lương tối thiểu vùng 1–4</td>
                    <td className="num">
                      {Object.values(data.legal.minWageRegion)
                        .map((v) => money(v))
                        .join(' · ')}
                    </td>
                  </tr>
                  <tr>
                    <td>Bảo hiểm NLĐ đóng</td>
                    <td className="num">{data.legal.insurance.map((r) => pct(r.employeeRate)).join(' + ')}</td>
                  </tr>
                </tbody>
              </table>
              <Link to="/settings/legal" className="btn btn-sm btn-outline-primary">
                Xem lịch sử và cập nhật khi luật thay đổi →
              </Link>
            </Card>
            <Section
              title="Chế độ BHXH"
              icon="bi-heart-pulse"
              fields={[
                {
                  name: 'recoveryMaxDays',
                  label: 'Số ngày dưỡng sức tối đa một lần (luật hiện hành 10)',
                  type: 'number',
                  required: true,
                },
              ]}
              initial={s.benefits}
              save={saveGroup('benefits')}
              onSaved={reload}
            />
          </div>
        </div>
      )}
      {tab === 'labor' && (
        <div className="row g-3">
          <div className="col-12">
            <Section
              title="Quy tắc luật lao động & BHXH"
              icon="bi-journal-bookmark"
              description={
                <>
                  Các con số trong công thức theo Bộ luật Lao động 2019, Luật BHXH 2024, NĐ 145/2020 (số trong ngoặc = luật hiện hành). Khi luật thay đổi, sửa
                  tại đây — không cần sửa mã nguồn. Mức tiền (giảm trừ, lương cơ sở, lương tối thiểu vùng, biểu thuế, tỷ lệ BH) cập nhật ở{' '}
                  <Link to="/settings/legal">Tham số pháp lý</Link> theo ngày hiệu lực.
                </>
              }
              fields={[
                {
                  name: 'maxFixedTermMonths',
                  label: 'HĐ xác định thời hạn tối đa (tháng) (36)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'maxFixedTermContracts',
                  label: 'Số lần ký HĐ xác định thời hạn tối đa (2)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'maxProbationDays',
                  label: 'Thử việc tối đa (ngày) (180)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'seniorityStepYears',
                  label: 'Phép thâm niên: cứ đủ (năm) (5)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'seniorityBonusDays',
                  label: '… được cộng thêm (ngày phép) (1)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'severanceMinMonths',
                  label: 'Trợ cấp thôi việc: làm việc từ đủ (tháng) (12)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'resignMonthFactor',
                  label: 'Thôi việc: tháng lương / năm (0,5)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'redundancyMonthFactor',
                  label: 'Mất việc: tháng lương / năm (1)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'redundancyMinMonths',
                  label: 'Mất việc: tối thiểu (tháng lương) (2)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'halfYearMaxMonths',
                  label: 'Tháng lẻ đến (tháng) tính ½ năm, trên tính 1 năm (6)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'sickRatePercent',
                  label: 'Ốm đau: mức hưởng (% lương đóng BHXH) (75)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'sickDaysUnder15',
                  label: 'Ốm đau: ngày/năm khi đóng dưới 15 năm (30)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'sickDays15To30',
                  label: 'Ốm đau: ngày/năm khi đóng 15 – dưới 30 năm (40)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'sickDays30Plus',
                  label: 'Ốm đau: ngày/năm khi đóng từ 30 năm (60)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'hazardousExtraDays',
                  label: 'Ốm đau: cộng thêm cho nghề nặng nhọc, độc hại (10)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'childSickUnder3',
                  label: 'Chăm con ốm: con dưới 3 tuổi (ngày/năm) (20)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'childSick3To7',
                  label: 'Chăm con ốm: con 3 – dưới 7 tuổi (ngày/năm) (15)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'workingDayDivisor',
                  label: 'Mức hưởng 1 ngày làm việc = mức tháng ÷ (24)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'calendarDayDivisor',
                  label: 'Mức hưởng 1 ngày lịch = mức tháng ÷ (30)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'maternityRatePercent',
                  label: 'Thai sản: mức hưởng (% bình quân 6 tháng) (100)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'birthMonths',
                  label: 'Sinh con: số tháng nghỉ (6)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'extraMonthsPerChild',
                  label: 'Sinh đôi trở lên: thêm tháng / con (1)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'lumpSumBaseSalaryTimes',
                  label: 'Trợ cấp một lần: lần lương cơ sở / con (2)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'checkupMaxDays',
                  label: 'Khám thai: tối đa ngày / lần (2)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'paternityDays',
                  label: 'Nam khi vợ sinh: thường (ngày) (5)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'paternitySurgeryDays',
                  label: 'Nam khi vợ sinh: phẫu thuật / dưới 32 tuần (7)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'paternityTwinsDays',
                  label: 'Nam khi vợ sinh: sinh đôi (10)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'paternityTwinsSurgeryDays',
                  label: 'Nam khi vợ sinh: sinh đôi phẫu thuật (14)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'paternityExtraPerChild',
                  label: 'Nam khi vợ sinh: từ sinh ba thêm ngày / con (3)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'paternityWithinDays',
                  label: 'Nam khi vợ sinh: nghỉ trong (ngày kể từ ngày sinh) (60)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'miscarriageUnder5Weeks',
                  label: 'Sảy thai dưới 5 tuần (ngày) (10)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'miscarriage5To13Weeks',
                  label: 'Sảy thai 5 – dưới 13 tuần (20)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'miscarriage13To22Weeks',
                  label: 'Sảy thai 13 – dưới 22 tuần (40)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'miscarriage22PlusWeeks',
                  label: 'Sảy thai từ 22 tuần (50)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'recoveryRatePercent',
                  label: 'Dưỡng sức: % lương cơ sở / ngày (30)',
                  type: 'number',
                  required: true,
                },
              ]}
              initial={s.laborRules}
              save={saveGroup('laborRules')}
              onSaved={reload}
            />
          </div>
        </div>
      )}
      {tab === 'notify' && (
        <div className="row g-3">
          <div className="col-xl-6">
            <MailSettingsCard />
          </div>
          <div className="col-xl-6">
            <Section
              title="Thời điểm nhắc việc"
              icon="bi-bell"
              description="Giờ chạy nhắc việc mỗi ngày và số ngày báo trước cho từng loại hạn."
              fields={[
                {
                  name: 'runAfterHour',
                  label: 'Chạy sau (giờ trong ngày, 0–23)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'contractDays',
                  label: 'Hợp đồng sắp hết hạn trong (ngày)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'probationDays',
                  label: 'Sắp hết thử việc trong (ngày)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'certificateDays',
                  label: 'Chứng chỉ sắp hết hạn trong (ngày)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'permitDays',
                  label: 'Giấy phép lao động / thẻ tạm trú hết hạn trong (ngày)',
                  type: 'number',
                  required: true,
                },
                {
                  name: 'reviewDays',
                  label: 'Phiếu đánh giá sắp hết hạn trong (ngày)',
                  type: 'number',
                  required: true,
                },
              ]}
              initial={s.reminders}
              save={saveGroup('reminders')}
              onSaved={reload}
            />
            <DailyJobsCard runAfterHour={s.reminders.runAfterHour} />
          </div>
        </div>
      )}
    </>
  );
}

interface JobsInfo {
  state: {
    lastDailyRun?: string;
    lastSummary?: {
      created: number;
      users: number;
      emails: number;
      ranAt: string;
    };
  } | null;
  cronEnabled: boolean;
}

/** Nhắc việc hằng ngày: lần chạy gần nhất, chạy ngay, hướng dẫn gọi từ dịch vụ lịch bên ngoài. */
function DailyJobsCard({ runAfterHour }: { runAfterHour: number }) {
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
    <Card
      title={
        <h2 className="h6 mb-0">
          <i className="bi bi-alarm me-2 text-primary" />
          Nhắc việc hằng ngày
        </h2>
      }
    >
      <p className="small text-body-secondary mt-0">
        Mỗi ngày sau {runAfterHour}:00: hợp đồng / thử việc / chứng chỉ / giấy phép lao động sắp hết hạn, sinh nhật, việc tiếp nhận – nghỉ việc đến hạn, phiếu
        đánh giá sắp hết hạn. Mỗi mục chỉ nhắc một lần; người có email nhận thêm email tổng hợp (khi đã cấu hình SMTP).
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
      <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={run}>
        {busy ? 'Đang chạy…' : 'Chạy ngay'}
      </button>
      <p className="small text-body-secondary mb-0 mt-3">
        Render gói miễn phí ngủ khi không có người dùng nên lịch trong server có thể lỡ giờ (hệ thống tự chạy bù khi có người mở ứng dụng). Để chạy đúng mỗi
        sáng: tạo lịch trên <code>cron-job.org</code> gọi <code>POST {apiBase}/cron/daily</code> lúc 7:05 với header{' '}
        <code>X-Cron-Secret: &lt;CRON_SECRET&gt;</code>.
      </p>
    </Card>
  );
}
