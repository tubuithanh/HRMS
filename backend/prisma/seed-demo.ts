/**
 * DỮ LIỆU MẪU: Tập đoàn đa ngành ATECH (dữ liệu GIẢ, chỉ dùng để demo/test).
 *
 *   npm run seed:demo -- --reset
 *
 * --reset: XOÁ toàn bộ dữ liệu nghiệp vụ (nhân sự, tổ chức, lương, chấm công,
 * nghỉ phép, tuyển dụng, tài khoản trừ admin) rồi tạo lại. Giữ nguyên danh mục
 * (tham số pháp lý, biểu thuế, tỷ lệ BH, loại nghỉ, khoản lương) và tài khoản admin.
 * Chạy `npm run seed` trước để có danh mục.
 *
 * Số ngẫu nhiên có hạt giống cố định nên mỗi lần chạy cho cùng một bộ dữ liệu
 * (ngày tháng tính tương đối so với hôm nay).
 */

// Tắt log câu truy vấn của Prisma trước khi nạp cấu hình.
process.env.NODE_ENV = 'test';

type Gender = 'MALE' | 'FEMALE';

// ================= Số ngẫu nhiên có hạt giống =================
let seed = 20260929;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const round100k = (v: number) => Math.round(v / 100_000) * 100_000;

// ================= Ngày (00:00 UTC) =================
const DAY = 86_400_000;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const addMonths = (d: Date, n: number) => utc(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const now = new Date();
const TODAY = utc(now.getFullYear(), now.getMonth(), now.getDate());
const monthStart = (offset: number) => utc(TODAY.getUTCFullYear(), TODAY.getUTCMonth() + offset, 1);
const monthEnd = (offset: number) => utc(TODAY.getUTCFullYear(), TODAY.getUTCMonth() + offset + 1, 0);
/** Ngày làm việc ngẫu nhiên trong khoảng. */
function randomWorkday(from: Date, to: Date) {
  for (let i = 0; i < 50; i++) {
    const d = addDays(from, int(0, Math.max(Math.round((to.getTime() - from.getTime()) / DAY), 0)));
    if (!isWeekend(d)) return d;
  }
  return from;
}
/** Giờ địa phương trong ngày làm việc (máy chủ ở VN). */
const at = (d: Date, h: number, m: number) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);

// Ngày lễ: đọc từ bảng holiday (do `npm run seed` tạo) khi chạy.
let HOLIDAYS = new Set<string>();

// ================= Tên người Việt =================
const HO = ['Nguyễn', 'Nguyễn', 'Nguyễn', 'Trần', 'Trần', 'Lê', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Trịnh', 'Đinh'];
const DEM = { MALE: ['Văn', 'Đức', 'Minh', 'Quang', 'Hữu', 'Thành', 'Công', 'Anh', 'Tuấn', 'Xuân', 'Gia', 'Hoàng'], FEMALE: ['Thị', 'Thị', 'Ngọc', 'Thu', 'Thanh', 'Minh', 'Phương', 'Kim', 'Mai', 'Hồng', 'Bảo', 'Diệu'] };
const TEN = {
  MALE: ['Hùng', 'Dũng', 'Nam', 'Long', 'Tuấn', 'Hải', 'Phong', 'Quân', 'Khoa', 'Trung', 'Hiếu', 'Thắng', 'Tài', 'Sơn', 'Lâm', 'Đạt', 'Huy', 'Vinh', 'Bình', 'Cường', 'Kiên', 'Toàn', 'Khánh', 'Phúc', 'Thịnh', 'An'],
  FEMALE: ['Lan', 'Hương', 'Linh', 'Trang', 'Hà', 'Ngân', 'Mai', 'Thảo', 'Hạnh', 'Yến', 'Nhung', 'Vy', 'Anh', 'Uyên', 'Quỳnh', 'Hoa', 'Loan', 'Nga', 'Duyên', 'Tâm', 'Châu', 'My'],
};
const noAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const usedNames = new Set<string>();
function vnName(g: Gender) {
  for (;;) {
    const name = `${pick(HO)} ${pick(DEM[g])} ${pick(TEN[g])}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
}
const usedNumbers = new Set<string>();
function uniqueDigits(prefix: string, len: number) {
  for (;;) {
    let s = prefix;
    while (s.length < len) s += int(0, 9);
    if (!usedNumbers.has(s)) {
      usedNumbers.add(s);
      return s;
    }
  }
}

// ================= Chức danh =================
interface JobDef {
  name: string;
  family: string;
  salary: [number, number]; // triệu đồng
  probation: number; // ngày thử việc tối đa
  hazardous?: boolean;
  manager?: number; // phụ cấp trách nhiệm (đồng)
  phone?: boolean;
  fuel?: number;
  office?: boolean; // khối văn phòng: có email công ty, có thể làm từ xa
  age: [number, number];
  female?: number; // tỷ lệ nữ
}
const JOBS: Record<string, JobDef> = {
  TGD: { name: 'Tổng giám đốc', family: 'Quản lý', salary: [80, 80], probation: 180, manager: 10_000_000, phone: true, office: true, age: [45, 55], female: 0.2 },
  TL: { name: 'Trợ lý Tổng giám đốc', family: 'Hành chính', salary: [20, 24], probation: 60, office: true, age: [27, 35], female: 0.7 },
  GDK: { name: 'Giám đốc khối', family: 'Quản lý', salary: [45, 60], probation: 180, manager: 6_000_000, phone: true, office: true, age: [38, 52], female: 0.25 },
  GDNM: { name: 'Giám đốc nhà máy', family: 'Quản lý', salary: [40, 45], probation: 180, manager: 6_000_000, phone: true, office: true, age: [40, 52], female: 0.1 },
  TP: { name: 'Trưởng phòng', family: 'Quản lý', salary: [25, 35], probation: 60, manager: 3_000_000, phone: true, office: true, age: [32, 48], female: 0.4 },
  KTT: { name: 'Kế toán trưởng', family: 'Tài chính', salary: [30, 35], probation: 60, manager: 3_000_000, phone: true, office: true, age: [35, 48], female: 0.75 },
  QD: { name: 'Quản đốc xưởng', family: 'Sản xuất', salary: [20, 25], probation: 60, manager: 2_500_000, phone: true, age: [35, 50], female: 0.05 },
  CV: { name: 'Chuyên viên', family: 'Văn phòng', salary: [12, 18], probation: 60, office: true, age: [24, 40], female: 0.55 },
  NV: { name: 'Nhân viên', family: 'Văn phòng', salary: [8, 11], probation: 30, office: true, age: [22, 35], female: 0.55 },
  KT: { name: 'Kế toán viên', family: 'Tài chính', salary: [11, 15], probation: 60, office: true, age: [23, 38], female: 0.8 },
  LTV: { name: 'Lập trình viên', family: 'Công nghệ', salary: [18, 30], probation: 60, office: true, age: [23, 35], female: 0.2 },
  KS: { name: 'Kỹ sư', family: 'Kỹ thuật', salary: [16, 24], probation: 60, office: true, age: [24, 42], female: 0.2 },
  TT: { name: 'Tổ trưởng', family: 'Sản xuất', salary: [11, 13], probation: 30, manager: 1_000_000, age: [30, 48], female: 0.2 },
  CNKT: { name: 'Công nhân kỹ thuật', family: 'Sản xuất', salary: [9, 11], probation: 30, hazardous: true, age: [21, 45], female: 0.1 },
  CN: { name: 'Công nhân', family: 'Sản xuất', salary: [6.5, 8], probation: 6, age: [19, 45], female: 0.45 },
  QC: { name: 'Nhân viên QA/QC', family: 'Chất lượng', salary: [9, 12], probation: 30, age: [22, 38], female: 0.6 },
  KTV: { name: 'Kỹ thuật viên', family: 'Kỹ thuật', salary: [10, 14], probation: 30, age: [22, 40], female: 0.1 },
  TK: { name: 'Thủ kho', family: 'Kho vận', salary: [10, 12], probation: 30, age: [28, 45], female: 0.3 },
  NVKD: { name: 'Nhân viên kinh doanh', family: 'Kinh doanh', salary: [9, 14], probation: 30, fuel: 1_200_000, phone: true, office: true, age: [22, 35], female: 0.45 },
  CHT: { name: 'Cửa hàng trưởng', family: 'Bán lẻ', salary: [13, 16], probation: 30, manager: 1_000_000, age: [27, 40], female: 0.6 },
  NVBH: { name: 'Nhân viên bán hàng', family: 'Bán lẻ', salary: [7, 8.5], probation: 30, age: [19, 30], female: 0.75 },
  DT: { name: 'Đội trưởng vận tải', family: 'Kho vận', salary: [13, 15], probation: 30, manager: 1_000_000, age: [32, 48], female: 0 },
  TX: { name: 'Tài xế', family: 'Kho vận', salary: [9, 12], probation: 30, age: [25, 50], female: 0 },
  CSKH: { name: 'Nhân viên chăm sóc khách hàng', family: 'Dịch vụ', salary: [8, 10], probation: 30, office: true, age: [21, 32], female: 0.8 },
  GSCT: { name: 'Giám sát công trình', family: 'Xây dựng', salary: [15, 20], probation: 60, age: [27, 45], female: 0.05 },
};

// ================= Cơ cấu tổ chức =================
interface OrgDef {
  code: string;
  name: string;
  type: 'COMPANY' | 'BLOCK' | 'DIVISION' | 'DEPARTMENT' | 'TEAM';
  staff?: Array<[string, number]>;
  children?: OrgDef[];
}
const D = (code: string, name: string, staff: Array<[string, number]>, type: OrgDef['type'] = 'DEPARTMENT', children?: OrgDef[]): OrgDef => ({ code, name, type, staff, children });

const ORG: OrgDef = {
  code: 'ATECH-HO', name: 'Tập đoàn ATECH', type: 'COMPANY', staff: [['TGD', 1], ['TL', 1]],
  children: [
    D('VP', 'Khối Văn phòng', [], 'BLOCK', [
      D('HCNS', 'Phòng Hành chính – Nhân sự', [['TP', 1], ['CV', 3], ['NV', 2]]),
      D('TCKT', 'Phòng Tài chính – Kế toán', [['KTT', 1], ['KT', 4]]),
      D('CNTT', 'Phòng Công nghệ thông tin', [['TP', 1], ['LTV', 4], ['KTV', 1]]),
      D('PC', 'Phòng Pháp chế', [['TP', 1], ['CV', 1]]),
      D('MUA', 'Phòng Mua hàng', [['TP', 1], ['CV', 2]]),
    ]),
    D('SX', 'Khối Sản xuất', [['GDK', 1]], 'BLOCK', [
      D('NMBD', 'Nhà máy Bình Dương', [['GDNM', 1]], 'DIVISION', [
        D('KHSX', 'Phòng Kế hoạch sản xuất', [['TP', 1], ['CV', 2]]),
        D('XCK', 'Xưởng Cơ khí', [['QD', 1], ['TT', 2], ['CNKT', 6], ['CN', 8]]),
        D('XLR', 'Xưởng Lắp ráp', [['QD', 1], ['TT', 2], ['CN', 12]]),
        D('QAQC', 'Phòng QA/QC', [['TP', 1], ['QC', 4]]),
        D('BT', 'Tổ Bảo trì', [['TT', 1], ['KTV', 3]], 'TEAM'),
        D('KNM', 'Kho nhà máy', [['TK', 1], ['NV', 2]], 'TEAM'),
      ]),
      D('RD', 'Phòng Nghiên cứu & Phát triển', [['TP', 1], ['KS', 3]]),
    ]),
    D('TM', 'Khối Thương mại', [['GDK', 1]], 'BLOCK', [
      D('KDMB', 'Phòng Kinh doanh miền Bắc', [['TP', 1], ['NVKD', 5]]),
      D('KDMN', 'Phòng Kinh doanh miền Nam', [['TP', 1], ['NVKD', 6]]),
      D('XNK', 'Phòng Xuất nhập khẩu', [['TP', 1], ['CV', 2]]),
      D('MKT', 'Phòng Marketing', [['TP', 1], ['CV', 3]]),
      D('CHUOI', 'Chuỗi cửa hàng', [], 'DIVISION', [
        D('CH-Q1', 'Cửa hàng Quận 1', [['CHT', 1], ['NVBH', 4]], 'TEAM'),
        D('CH-CG', 'Cửa hàng Cầu Giấy', [['CHT', 1], ['NVBH', 3]], 'TEAM'),
      ]),
    ]),
    D('DV', 'Khối Dịch vụ – Logistics', [['GDK', 1]], 'BLOCK', [
      D('LOG', 'Trung tâm Logistics', [['TP', 1]], 'DIVISION', [
        D('VT', 'Đội Vận tải', [['DT', 1], ['TX', 6]], 'TEAM'),
        D('KTTR', 'Kho trung tâm', [['TK', 1], ['NV', 4]], 'TEAM'),
      ]),
      D('CSKH', 'Trung tâm Chăm sóc khách hàng', [['TP', 1], ['CSKH', 5]]),
      D('DVKT', 'Phòng Dịch vụ kỹ thuật', [['TP', 1], ['KTV', 4]]),
    ]),
    D('XD', 'Khối Xây dựng – Bất động sản', [['GDK', 1]], 'BLOCK', [
      D('QLDA', 'Ban Quản lý dự án', [['TP', 1], ['KS', 3]]),
      D('TC', 'Đội Thi công', [['GSCT', 2], ['CN', 6]]),
    ]),
  ],
};

// Nhân viên đã nghỉ việc trong 12 tháng qua: [phòng, chức danh]
const LEAVERS: Array<[string, string]> = [
  ['XLR', 'CN'], ['XLR', 'CN'], ['XCK', 'CN'], ['CH-Q1', 'NVBH'], ['CH-CG', 'NVBH'], ['KDMN', 'NVKD'],
  ['KDMB', 'NVKD'], ['CSKH', 'CSKH'], ['VT', 'TX'], ['TC', 'CN'], ['CNTT', 'LTV'], ['MKT', 'CV'],
];

// ================= Chương trình chính =================
async function main() {
  const { prisma } = await import('../src/config/prisma');
  const { payrollService } = await import('../src/modules/payroll/payroll.service');
  const { calcLeaveDays } = await import('../src/modules/leave/leave.logic');
  const { hashPassword } = await import('./../src/modules/auth/password');
  const { buildInstallmentSchedule } = await import('../src/modules/payroll/advance');
  const { multiplierOf, overtimeTypeOf } = await import('../src/modules/overtime/overtime.logic');
  const { loadManagerMap } = await import('../src/modules/approval/approval.service');
  HOLIDAYS = new Set((await prisma.holiday.findMany()).map((h) => iso(h.date)));

  const reset = process.argv.includes('--reset');
  const persons = await prisma.person.count();
  if (persons > 0 && !reset) {
    throw new Error(`Database đã có ${persons} hồ sơ nhân sự. Chạy lại với --reset để XOÁ dữ liệu nghiệp vụ và tạo dữ liệu mẫu.`);
  }

  const company = await prisma.company.findUnique({ where: { code: 'ATECH' } });
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  const elements = await prisma.payElement.findMany();
  const leaveTypes = await prisma.leaveType.findMany();
  if (!company || !admin || elements.length === 0 || leaveTypes.length === 0) {
    throw new Error('Thiếu danh mục. Hãy chạy `npm run seed` trước.');
  }
  const adminId = admin.id;
  const el = (code: string) => elements.find((e) => e.code === code)!;
  const lt = (code: string) => leaveTypes.find((t) => t.code === code)!;

  // ---------- Xoá dữ liệu nghiệp vụ ----------
  if (reset) {
    console.log('… Xoá dữ liệu nghiệp vụ cũ');
    await prisma.$transaction([
      prisma.pitCertificate.deleteMany(),
      prisma.notification.deleteMany(),
      prisma.performanceReview.deleteMany(),
      prisma.reviewCycle.deleteMany(),
      prisma.trainingParticipant.deleteMany(),
      prisma.trainingCourse.deleteMany(),
      prisma.rewardDiscipline.deleteMany(),
      prisma.payrollResult.deleteMany(),
      prisma.periodElement.deleteMany(),
      prisma.advanceSchedule.deleteMany(),
      prisma.advance.deleteMany(),
      prisma.payPeriod.deleteMany(),
      prisma.attendanceRecord.deleteMany(),
      prisma.shiftRoster.deleteMany(),
      prisma.shiftAssignment.deleteMany(),
      prisma.overtimeRequest.deleteMany(),
      prisma.leaveRequest.deleteMany(),
      prisma.employeeElement.deleteMany(),
      prisma.laborContract.deleteMany({ where: { parentId: { not: null } } }),
      prisma.laborContract.deleteMany(),
      prisma.employeeSalary.deleteMany(),
      prisma.employeeTaxProfile.deleteMany(),
      prisma.assignment.deleteMany(),
      prisma.jobApplication.deleteMany(),
      prisma.jobOpening.deleteMany(),
      prisma.user.deleteMany({ where: { username: { not: 'admin' } } }),
      prisma.user.update({ where: { username: 'admin' }, data: { personId: null } }),
      prisma.dependant.deleteMany(),
      prisma.relative.deleteMany(),
      prisma.personEducation.deleteMany(),
      prisma.personCertificate.deleteMany(),
      prisma.personExperience.deleteMany(),
      prisma.personSkill.deleteMany(),
      prisma.personDocument.deleteMany(),
      prisma.workPermit.deleteMany(),
      prisma.residenceCard.deleteMany(),
      prisma.employment.deleteMany(),
      prisma.position.updateMany({ data: { parentPositionId: null } }),
      prisma.position.deleteMany(),
      prisma.job.deleteMany(),
      prisma.orgStructure.updateMany({ data: { parentId: null } }),
      prisma.orgStructure.deleteMany(),
      prisma.person.deleteMany(),
    ]);
  }

  await prisma.company.update({
    where: { id: company.id },
    data: { name: 'Công ty Cổ phần Tập đoàn ATECH', taxCode: '0312345678', address: 'Số 1 Đường Demo, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh' },
  });

  // ---------- Chức danh ----------
  console.log('… Chức danh, tổ chức');
  const jobIds: Record<string, string> = {};
  for (const [code, j] of Object.entries(JOBS)) {
    const job = await prisma.job.create({
      data: { code, name: j.name, jobFamily: j.family, isHazardous: !!j.hazardous, maxProbationDays: j.probation },
    });
    jobIds[code] = job.id;
  }

  // ---------- Tổ chức ----------
  const FOUNDED = utc(2015, 2, 1);
  const orgIds: Record<string, string> = {};
  const orgNames: Record<string, string> = {};
  const slots: Array<{ org: string; job: string }> = [];
  async function createOrg(o: OrgDef, parentId: string | null, parentPath: string) {
    const path = `${parentPath}${o.code}/`;
    const row = await prisma.orgStructure.create({
      data: { companyId: company!.id, code: o.code, name: o.name, orgType: o.type, parentId, isRoot: parentId === null, path, effectiveDate: FOUNDED },
    });
    orgIds[o.code] = row.id;
    orgNames[o.code] = o.name;
    for (const [job, n] of o.staff ?? []) for (let i = 0; i < n; i++) slots.push({ org: o.code, job });
    for (const c of o.children ?? []) await createOrg(c, row.id, path);
  }
  await createOrg(ORG, null, '/');

  // ---------- Nhân sự ----------
  console.log(`… ${slots.length + LEAVERS.length} nhân viên (hồ sơ, hợp đồng, lương, phụ cấp)`);
  interface Emp {
    id: string;
    personId: string;
    code: string;
    fullName: string;
    job: string;
    org: string;
    hire: Date;
    terminate: Date | null;
    office: boolean;
    base: number;
  }
  const emps: Emp[] = [];
  let seq = 0;
  let contractSeq = 0;
  let positionSeq = 0;

  // 6 người vào làm trong 2 tháng gần đây (đang thử việc), chọn từ các vị trí cấp thấp
  const recentSlots = new Set<number>();
  const juniorIdx = slots.map((s, i) => (['CN', 'NV', 'NVBH', 'NVKD', 'CSKH', 'LTV', 'KT', 'QC'].includes(s.job) ? i : -1)).filter((i) => i >= 0);
  while (recentSlots.size < 7) recentSlots.add(pick(juniorIdx));

  // 3 chuyên gia nước ngoài
  const foreigners = new Map<number, { name: string; nat: string; gender: Gender }>();
  const fx = [
    { name: 'Kim Min-jun', nat: 'Hàn Quốc', gender: 'MALE' as Gender, match: (s: { job: string }) => s.job === 'GDNM' },
    { name: 'Tanaka Hiroshi', nat: 'Nhật Bản', gender: 'MALE' as Gender, match: (s: { org: string; job: string }) => s.org === 'RD' && s.job === 'KS' },
    { name: 'Chen Wei', nat: 'Trung Quốc', gender: 'FEMALE' as Gender, match: (s: { org: string; job: string }) => s.org === 'QAQC' && s.job === 'QC' },
  ];
  for (const f of fx) {
    const i = slots.findIndex((s, k) => f.match(s) && !foreigners.has(k));
    if (i >= 0) foreigners.set(i, f);
  }

  const all = [...slots.map((s, i) => ({ ...s, i, leaver: false })), ...LEAVERS.map(([org, job], k) => ({ org, job, i: -1 - k, leaver: true }))];

  for (const slot of all) {
    const j = JOBS[slot.job];
    const f = foreigners.get(slot.i);
    const gender: Gender = f ? f.gender : chance(j.female ?? 0.5) ? 'FEMALE' : 'MALE';
    const fullName = f ? f.name : vnName(gender);

    // Ngày vào làm: quản lý vào sớm hơn; nhóm "mới" vào trong 2 tháng gần đây.
    let hire: Date;
    if (recentSlots.has(slot.i)) hire = randomWorkday(addDays(TODAY, -55), addDays(TODAY, -5));
    else if (slot.leaver) hire = randomWorkday(utc(2022, 0, 1), addMonths(TODAY, -14));
    else {
      const senior = ['TGD', 'GDK', 'GDNM', 'KTT', 'TP', 'QD'].includes(slot.job);
      const yearsAgo = senior ? 2 + rand() * 9 : Math.pow(rand(), 1.4) * 9 + 0.3;
      hire = randomWorkday(addDays(TODAY, -Math.round(yearsAgo * 365) - 10), addDays(TODAY, -Math.round(yearsAgo * 365)));
      if (hire < FOUNDED) hire = randomWorkday(FOUNDED, addDays(FOUNDED, 60));
    }
    const terminate = slot.leaver ? randomWorkday(addMonths(TODAY, -11), addDays(TODAY, -3)) : null;

    const age = int(j.age[0], j.age[1]);
    const dob = utc(TODAY.getUTCFullYear() - age, int(0, 11), int(1, 28));
    const yy = String(dob.getUTCFullYear() % 100).padStart(2, '0');
    const centuryGender = (dob.getUTCFullYear() >= 2000 ? 2 : 0) + (gender === 'FEMALE' ? 1 : 0);
    const province = pick(['001', '079', '074', '075', '031', '048', '036', '038', '040', '052']);
    seq++;
    const code = `NV${String(seq).padStart(4, '0')}`;
    const emailName = noAccent(fullName).toLowerCase().split(' ');
    const email = j.office ? `${emailName[emailName.length - 1]}.${emailName.slice(0, -1).map((p) => p[0]).join('')}${seq}@atech.demo` : null;

    const person = await prisma.person.create({
      data: {
        personCode: `P${String(seq).padStart(5, '0')}`,
        fullName,
        firstName: fullName.split(' ').slice(-1)[0],
        lastName: fullName.split(' ')[0],
        gender,
        dateOfBirth: dob,
        idNo: f ? null : uniqueDigits(`${province}${centuryGender}${yy}`, 12),
        idDateOfIssue: f ? null : addDays(dob, 365 * 18 + int(0, 900)),
        idPlaceOfIssue: f ? null : 'Cục Cảnh sát QLHC về TTXH',
        personalTaxCode: uniqueDigits('8', 10),
        socialInsNo: uniqueDigits(pick(['79', '01', '74']), 10),
        nationality: f ? f.nat : 'Việt Nam',
        isForeigner: !!f,
        email,
        phone: uniqueDigits(pick(['090', '091', '093', '097', '098', '086', '035', '038']), 10),
        // Tài khoản nhận lương (giả); ~4% chưa khai để thấy cảnh báo ở file chuyển lương.
        ...(chance(0.96)
          ? (() => {
              const bank = pick(['VCB', 'VCB', 'TCB', 'BIDV', 'ACB', 'MB', 'VTB']);
              return { bankName: bank, bankAccountNo: uniqueDigits(bank === 'VCB' ? '10' : '19', bank === 'VCB' ? 13 : 12), bankBranch: pick(['Bình Dương', 'TP.HCM', 'Thủ Đức', 'Dĩ An']) };
            })()
          : {}),
      },
    });

    // Lương: làm tròn 100k; tăng lương 1/1 năm nay nếu vào trước đó.
    const base = round100k((j.salary[0] + rand() * (j.salary[1] - j.salary[0])) * 1_000_000);
    const inProbation = !slot.leaver && recentSlots.has(slot.i) && j.probation > 6;
    const probationEnd = inProbation ? addDays(hire, j.probation - 1) : null;
    const status = slot.leaver ? 'TERMINATED' : inProbation && probationEnd! >= TODAY ? 'PROBATION' : 'ACTIVE';

    const emp = await prisma.employment.create({
      data: {
        personId: person.id,
        companyId: company.id,
        codeEmp: code,
        codeAttendance: code.slice(2),
        employmentType: 'EMPLOYEE',
        dateHire: hire,
        dateSeniority: hire,
        probationEndDate: inProbation ? probationEnd : null,
        dateTerminate: terminate,
        status,
      },
    });

    // Vị trí
    positionSeq++;
    const position = await prisma.position.create({
      data: {
        code: `${slot.org}-${slot.job}-${String(positionSeq).padStart(3, '0')}`,
        jobId: jobIds[slot.job],
        orgStructureId: orgIds[slot.org],
        isKeyPosition: !!j.manager && j.manager >= 3_000_000,
        status: slot.leaver ? 'VACANT' : 'FILLED',
        effectiveDate: FOUNDED,
      },
    });
    await prisma.assignment.create({
      data: {
        employmentId: emp.id,
        positionId: position.id,
        orgStructureId: orgIds[slot.org],
        actionType: 'HIRE',
        effectiveDate: hire,
        endDate: terminate,
      },
    });

    // Lương theo ngày hiệu lực
    const raiseDate = utc(TODAY.getUTCFullYear(), 0, 1);
    if (hire < addDays(raiseDate, -180)) {
      await prisma.employeeSalary.create({ data: { employmentId: emp.id, baseAmount: String(round100k(base * 0.9)), effectiveDate: hire, endDate: addDays(raiseDate, -1), sourceType: 'MANUAL' } });
      await prisma.employeeSalary.create({ data: { employmentId: emp.id, baseAmount: String(base), effectiveDate: raiseDate, sourceType: 'MANUAL' } });
    } else {
      await prisma.employeeSalary.create({ data: { employmentId: emp.id, baseAmount: String(base), effectiveDate: hire, sourceType: 'MANUAL' } });
    }
    await prisma.employeeTaxProfile.create({ data: { employmentId: emp.id, taxMethod: 'PROGRESSIVE', effectiveDate: hire } });

    // Phụ cấp cố định
    const recurring: Array<[string, number]> = [['AN_CA', 730_000]];
    if (j.manager) recurring.push(['TRACH_NHIEM', j.manager]);
    if (j.phone) recurring.push(['DIEN_THOAI', 500_000]);
    if (j.fuel) recurring.push(['XANG_XE', j.fuel]);
    for (const [codeEl, amount] of recurring) {
      await prisma.employeeElement.create({ data: { employmentId: emp.id, payElementId: el(codeEl).id, amount: String(amount), effectiveDate: hire, endDate: terminate } });
    }

    // Hợp đồng lao động: thử việc → xác định thời hạn 12 tháng → 24 tháng → không xác định thời hạn.
    const contract = async (type: 'PROBATION' | 'FIXED_TERM' | 'INDEFINITE', start: Date, end: Date | null) => {
      contractSeq++;
      const prefix = type === 'PROBATION' ? 'HĐTV' : 'HĐLĐ';
      await prisma.laborContract.create({
        data: {
          employmentId: emp.id,
          contractNo: `${prefix}-${start.getUTCFullYear()}/${String(contractSeq).padStart(4, '0')}`,
          contractType: type,
          signDate: addDays(start, -int(0, 3)),
          startDate: start,
          endDate: end,
          salaryAmount: String(base),
          jobTitle: j.name,
          terminatedDate: terminate && (!end || terminate < end) && terminate >= start ? terminate : null,
          terminateReason: terminate && (!end || terminate < end) && terminate >= start ? pick(['Người lao động xin nghỉ việc', 'Chuyển công tác', 'Lý do gia đình']) : null,
        },
      });
    };
    const lastDay = terminate ?? TODAY;
    let cursor = hire;
    if (j.probation > 6 && (inProbation || chance(0.6))) {
      const pEnd = addDays(hire, j.probation - 1);
      await contract('PROBATION', hire, pEnd);
      cursor = addDays(pEnd, 1);
    }
    if (cursor <= lastDay || status === 'PROBATION') {
      if (status !== 'PROBATION') {
        const end1 = addDays(addMonths(cursor, 12), -1);
        await contract('FIXED_TERM', cursor, end1);
        cursor = addDays(end1, 1);
        // Một số HĐ vừa hết hạn trong 45 ngày qua mà chưa ký tiếp (để cảnh báo)
        if (cursor <= lastDay && !(end1 > addDays(TODAY, -45) && chance(0.5) && !terminate)) {
          const end2 = addDays(addMonths(cursor, 24), -1);
          await contract('FIXED_TERM', cursor, end2);
          cursor = addDays(end2, 1);
          if (cursor <= lastDay) await contract('INDEFINITE', cursor, null);
        }
      }
    }

    // Người phụ thuộc, người thân, học vấn
    if (age >= 28 && chance(0.45)) {
      for (let k = 0; k < int(1, 2); k++) {
        const childGender: Gender = chance(0.5) ? 'MALE' : 'FEMALE';
        const cdob = utc(TODAY.getUTCFullYear() - int(1, Math.min(age - 24, 17)), int(0, 11), int(1, 28));
        await prisma.dependant.create({
          data: {
            personId: person.id,
            dependantName: `${fullName.split(' ')[0]} ${pick(DEM[childGender])} ${pick(TEN[childGender])}`,
            relationship: 'Con',
            dateOfBirth: cdob,
            deductionFromMonth: cdob > hire ? utc(cdob.getUTCFullYear(), cdob.getUTCMonth(), 1) : utc(hire.getUTCFullYear(), hire.getUTCMonth(), 1),
          },
        });
      }
    }
    const spouse = age >= 27 && chance(0.6);
    await prisma.relative.create({
      data: {
        personId: person.id,
        relativeName: spouse ? vnName(gender === 'MALE' ? 'FEMALE' : 'MALE') : `${fullName.split(' ')[0]} ${pick(DEM.MALE)} ${pick(TEN.MALE)}`,
        relationship: spouse ? (gender === 'MALE' ? 'Vợ' : 'Chồng') : 'Cha',
        phone: uniqueDigits('09', 10),
        isEmergencyContact: true,
      },
    });
    if (j.office || ['KS', 'GSCT', 'QC', 'KTV'].includes(slot.job)) {
      await prisma.personEducation.create({
        data: {
          personId: person.id,
          schoolName: pick(['Đại học Bách khoa TP.HCM', 'Đại học Kinh tế TP.HCM', 'Đại học Bách khoa Hà Nội', 'Đại học Kinh tế Quốc dân', 'Đại học Ngoại thương', 'Đại học Công nghiệp TP.HCM', 'Cao đẳng Kỹ thuật Cao Thắng']),
          major: pick(['Quản trị kinh doanh', 'Kế toán', 'Công nghệ thông tin', 'Kỹ thuật cơ khí', 'Kinh doanh quốc tế', 'Luật', 'Marketing', 'Kỹ thuật xây dựng']),
          qualification: ['CN', 'NVBH'].includes(slot.job) ? 'Trung cấp' : pick(['Đại học', 'Đại học', 'Cao đẳng', 'Thạc sĩ']),
          graduationYear: dob.getUTCFullYear() + 22,
          isHighest: true,
        },
      });
    }
    if (f) {
      const expiring = f.name.startsWith('Kim');
      await prisma.workPermit.create({
        data: {
          personId: person.id,
          permitNo: `GP-${uniqueDigits('', 6)}`,
          permitType: 'EXTEND',
          positionName: j.name,
          issueDate: addMonths(TODAY, expiring ? -23 : -8),
          expiryDate: expiring ? addDays(TODAY, 40) : addMonths(TODAY, 16),
          issuedBy: 'Sở Lao động – Thương binh và Xã hội tỉnh Bình Dương',
          status: 'ISSUED',
        },
      });
      await prisma.residenceCard.create({
        data: { personId: person.id, cardType: 'TRC', cardNo: `TRC${uniqueDigits('', 7)}`, issueDate: addMonths(TODAY, -10), expiryDate: expiring ? addDays(TODAY, 50) : addMonths(TODAY, 14) },
      });
    }

    emps.push({ id: emp.id, personId: person.id, code, fullName, job: slot.job, org: slot.org, hire, terminate, office: !!j.office, base });
  }

  const employedOn = (e: Emp, d: Date) => e.hire <= d && (!e.terminate || e.terminate >= d);

  // ---------- Nghỉ phép ----------
  console.log('… Nghỉ phép');
  const HISTORY_START = monthStart(-3);
  const busy = new Map<string, Set<string>>(); // employmentId -> các ngày đã có đơn
  const leaveRows: Array<{ employmentId: string; leaveTypeId: string; fromDate: Date; toDate: Date; isHalfDay: boolean; days: string; reason: string; status: 'APPROVED' | 'PENDING' | 'REJECTED'; reviewedById: string | null; reviewedAt: Date | null; isPaid: boolean }> = [];
  function addLeave(e: Emp, type: string, from: Date, nDays: number, status: 'APPROVED' | 'PENDING' | 'REJECTED', reason: string, half = false) {
    let to = from;
    let count = 1;
    while (count < nDays) {
      to = addDays(to, 1);
      if (!isWeekend(to) && !HOLIDAYS.has(iso(to))) count++;
    }
    if (HOLIDAYS.has(iso(from))) return;
    if (!employedOn(e, from) || !employedOn(e, to)) return;
    if (from.getUTCFullYear() !== to.getUTCFullYear()) return;
    const set = busy.get(e.id) ?? new Set<string>();
    for (let d = from; d <= to; d = addDays(d, 1)) if (set.has(iso(d))) return;
    for (let d = from; d <= to; d = addDays(d, 1)) set.add(iso(d));
    busy.set(e.id, set);
    const t = lt(type);
    leaveRows.push({
      employmentId: e.id,
      leaveTypeId: t.id,
      fromDate: from,
      toDate: to,
      isHalfDay: half,
      days: calcLeaveDays(from, to, half, HOLIDAYS).toString(),
      reason,
      status,
      reviewedById: status === 'PENDING' ? null : adminId,
      reviewedAt: status === 'PENDING' ? null : addDays(from, -2),
      isPaid: t.isPaid,
    });
  }
  const active = emps.filter((e) => !e.terminate);
  for (const e of emps) {
    const from = e.hire > HISTORY_START ? e.hire : HISTORY_START;
    const until = e.terminate ?? addDays(TODAY, -1);
    if (from >= until) continue;
    if (chance(0.55)) addLeave(e, 'PN', randomWorkday(from, until), int(1, 3), 'APPROVED', pick(['Việc gia đình', 'Du lịch', 'Về quê', 'Nghỉ ngơi', 'Đưa con đi khám']));
    if (chance(0.25)) addLeave(e, 'PN', randomWorkday(from, until), 1, 'APPROVED', 'Việc cá nhân', chance(0.4));
    if (chance(0.12)) addLeave(e, 'OM', randomWorkday(from, until), int(1, 3), 'APPROVED', pick(['Sốt', 'Cảm cúm', 'Đau dạ dày']));
    if (chance(0.05)) addLeave(e, 'KL', randomWorkday(from, until), int(1, 2), 'APPROVED', 'Việc riêng dài ngày');
    if (chance(0.03)) addLeave(e, 'VR', randomWorkday(from, until), 3, 'APPROVED', 'Kết hôn');
    if (chance(0.03)) addLeave(e, 'PN', randomWorkday(from, until), 2, 'REJECTED', 'Du lịch');
  }
  // Nghỉ hôm nay
  for (const e of active.filter(() => chance(0.04))) if (!isWeekend(TODAY)) addLeave(e, pick(['PN', 'PN', 'OM']), TODAY, int(1, 2), 'APPROVED', 'Việc gia đình');
  // Đơn chờ duyệt của phòng Kinh doanh miền Nam (để tài khoản quanly.demo có đơn để duyệt)
  for (const e of active.filter((x) => x.org === 'KDMN' && x.job === 'NVKD').slice(0, 3)) {
    addLeave(e, 'PN', randomWorkday(addDays(TODAY, 3), addDays(TODAY, 20)), int(1, 2), 'PENDING', 'Việc gia đình');
  }
  // Đơn chờ duyệt trong 2 tuần tới
  for (const e of active.filter(() => chance(0.06))) addLeave(e, 'PN', randomWorkday(addDays(TODAY, 2), addDays(TODAY, 16)), int(1, 3), 'PENDING', pick(['Du lịch cùng gia đình', 'Về quê', 'Việc cá nhân']));
  await prisma.leaveRequest.createMany({ data: leaveRows.map(({ isPaid, ...r }) => r) });

  // ---------- Chấm công ----------
  console.log('… Chấm công 3 tháng gần nhất');
  const onLeave = (e: Emp, d: Date) =>
    leaveRows.some((l) => l.employmentId === e.id && l.status === 'APPROVED' && l.fromDate <= d && l.toDate >= d && !l.isHalfDay);
  const onLeaveDay = onLeave;
  const attendance: Array<{ employmentId: string; workDate: Date; checkIn: Date | null; checkOut: Date | null; status: 'PRESENT' | 'LATE' | 'REMOTE' | 'ABSENT' | 'HOLIDAY'; source: string; note?: string }> = [];
  for (let d = HISTORY_START; d <= TODAY; d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    const holiday = HOLIDAYS.has(iso(d));
    const isToday = d.getTime() === TODAY.getTime();
    for (const e of emps) {
      if (!employedOn(e, d)) continue;
      if (holiday) {
        attendance.push({ employmentId: e.id, workDate: d, checkIn: null, checkOut: null, status: 'HOLIDAY', source: 'MANUAL', note: 'Nghỉ lễ' });
        continue;
      }
      if (onLeave(e, d)) continue;
      if (isToday && chance(0.12)) continue; // chưa chấm công
      const r = rand();
      if (!e.office && r < 0.015) {
        attendance.push({ employmentId: e.id, workDate: d, checkIn: null, checkOut: null, status: 'ABSENT', source: 'MANUAL', note: 'Vắng không phép' });
        continue;
      }
      const remote = e.office && r > 0.96;
      const late = !remote && r < 0.08;
      // Đúng giờ: 7:30 – 8:29; muộn: 8:31 – 8:59 (giờ hành chính 8:30).
      const inTime = late ? at(d, 8, int(31, 59)) : at(d, 7, 30 + int(0, 59));
      attendance.push({
        employmentId: e.id,
        workDate: d,
        checkIn: inTime,
        checkOut: isToday ? null : chance(0.03) ? at(d, 16, int(45, 80)) : at(d, 17, int(30, 75)),
        status: remote ? 'REMOTE' : late ? 'LATE' : 'PRESENT',
        source: chance(0.9) ? 'SELF' : 'MANUAL',
      });
    }
  }
  for (let i = 0; i < attendance.length; i += 1000) {
    await prisma.attendanceRecord.createMany({ data: attendance.slice(i, i + 1000) });
  }

  // ---------- Làm thêm giờ (công nhân, kỹ thuật, vận tải) ----------
  console.log('… Làm thêm giờ');
  const otRows: Array<{ employmentId: string; workDate: Date; hours: string; otType: 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY'; isNight: boolean; multiplier: string; reason: string; status: 'APPROVED' | 'PENDING'; reviewedById: string | null; reviewedAt: Date | null }> = [];
  const otWorkers = emps.filter((e) => ['CN', 'CNKT', 'TT', 'KTV', 'TX', 'QD', 'QC'].includes(e.job));
  for (let m = -3; m <= 0; m++) {
    const from = monthStart(m);
    const to = m === 0 ? addDays(TODAY, 10) : monthEnd(m);
    for (const e of otWorkers) {
      if (!chance(0.45)) continue;
      let used = 0;
      const days = new Set<string>();
      for (let k = 0; k < int(2, 7); k++) {
        const saturday = chance(0.25);
        let day = randomWorkday(from, to);
        if (saturday) day = addDays(day, 6 - day.getUTCDay()); // thứ 7 cùng tuần
        if (day > to || days.has(iso(day)) || !employedOn(e, day) || onLeaveDay(e, day)) continue;
        const type = overtimeTypeOf(day, HOLIDAYS);
        const hours = type === 'WEEKDAY' ? pick([2, 2, 3, 4]) : pick([4, 8]);
        if (used + hours > 40) break;
        const night = type === 'WEEKDAY' && chance(0.1);
        used += hours;
        days.add(iso(day));
        const pending = day > addDays(TODAY, -3);
        otRows.push({
          employmentId: e.id,
          workDate: day,
          hours: String(hours),
          otType: type,
          isNight: night,
          multiplier: multiplierOf(type, night).toString(),
          reason: pick(['Hoàn thành đơn hàng gấp', 'Bảo trì dây chuyền', 'Kiểm kê kho', 'Giao hàng cuối tuần', 'Xử lý sự cố máy']),
          status: pending ? 'PENDING' : 'APPROVED',
          reviewedById: pending ? null : adminId,
          reviewedAt: pending ? null : addDays(day, -1),
        });
      }
    }
  }
  await prisma.overtimeRequest.createMany({ data: otRows });

  // ---------- Người duyệt cho đơn đang chờ (duyệt 2 bước) ----------
  // Có quản lý trực tiếp → chờ quản lý; khoảng 40% đã qua bước quản lý, đang chờ nhân sự.
  const managers = await loadManagerMap();
  for (const [model, rows] of [
    ['leave', await prisma.leaveRequest.findMany({ where: { status: { in: ['PENDING', 'APPROVED', 'REJECTED'] } }, select: { id: true, employmentId: true, status: true } })],
    ['overtime', await prisma.overtimeRequest.findMany({ where: { status: { in: ['PENDING', 'APPROVED', 'REJECTED'] } }, select: { id: true, employmentId: true, status: true } })],
  ] as const) {
    for (const r of rows) {
      const manager = managers.get(r.employmentId) ?? null;
      if (!manager) continue;
      const passedManager = r.status !== 'PENDING' || chance(0.4);
      const data = {
        approverEmploymentId: manager,
        approvalStage: (passedManager ? 'HR' : 'MANAGER') as 'HR' | 'MANAGER',
        managerReviewedAt: passedManager ? addDays(TODAY, -int(1, 5)) : null,
      };
      if (model === 'leave') await prisma.leaveRequest.update({ where: { id: r.id }, data });
      else await prisma.overtimeRequest.update({ where: { id: r.id }, data });
    }
  }

  // ---------- Tạm ứng ----------
  console.log('… Tạm ứng, kỳ lương');
  for (const e of active.filter((x) => ['CN', 'CNKT', 'TX', 'NVBH', 'NV'].includes(x.job)).filter(() => chance(0.08))) {
    const amount = pick([3_000_000, 4_500_000, 6_000_000]);
    const installments = 3;
    const adv = await prisma.advance.create({
      data: { employmentId: e.id, requestDate: addDays(monthStart(-3), int(3, 10)), amount: String(amount), reason: pick(['Sửa nhà', 'Đóng học phí cho con', 'Chi phí y tế']), installments, status: 'APPROVED' },
    });
    for (const item of buildInstallmentSchedule(amount, installments)) {
      await prisma.advanceSchedule.create({ data: { advanceId: adv.id, index: item.index, amount: item.amount.toFixed() } });
    }
  }

  // ---------- Kỳ lương: từ tháng 1 năm nay (ít nhất 3 tháng trước) đã khoá + tháng này (đã tính) ----------
  // Đủ các tháng trong năm để báo cáo quyết toán thuế, D02 có số liệu thật. Tháng chưa có
  // dữ liệu chấm công được tính đủ công.
  const firstOffset = Math.min(-3, -TODAY.getUTCMonth());
  for (let offset = firstOffset; offset <= 0; offset++) {
    const start = monthStart(offset);
    const code = iso(start).slice(0, 7);
    const period = await prisma.payPeriod.create({
      data: { code, dateStart: start, dateEnd: monthEnd(offset), payDate: addDays(monthEnd(offset), 5), status: 'OPEN' },
    });
    // Thưởng doanh số cho kinh doanh / bán hàng, phạt đi muộn, thưởng dự án.
    for (const e of emps.filter((x) => employedOn(x, monthEnd(offset)) || (x.terminate && x.terminate >= start))) {
      if (['NVKD', 'CHT', 'NVBH'].includes(e.job) && chance(0.7)) {
        await prisma.periodElement.create({ data: { payPeriodId: period.id, employmentId: e.id, payElementId: el('THUONG').id, amount: String(round100k(int(5, 50) * 100_000)), note: 'Thưởng doanh số' } });
      }
      if (['KS', 'LTV'].includes(e.job) && chance(0.15)) {
        await prisma.periodElement.create({ data: { payPeriodId: period.id, employmentId: e.id, payElementId: el('THUONG').id, amount: '2000000', note: 'Thưởng hoàn thành dự án' } });
      }
      if (chance(0.01) && el('BOI_THUONG')) {
        await prisma.periodElement.create({ data: { payPeriodId: period.id, employmentId: e.id, payElementId: el('BOI_THUONG').id, amount: '300000', note: 'Bồi thường làm hỏng dụng cụ (biên bản)' } });
      }
    }
    const run = await payrollService.run({ payPeriodId: period.id, region: 1 });
    if (offset < 0) await payrollService.lockPeriod(period.id);
    console.log(`   kỳ ${code}: tính ${run.success}/${run.total}${run.errorCount ? `, lỗi ${run.errorCount}` : ''}${offset < 0 ? ' · đã khoá' : ''}`);
  }

  // ---------- Tuyển dụng ----------
  console.log('… Tuyển dụng');
  const opening = (code: string, title: string, org: string, quantity: number, status: 'DRAFT' | 'OPEN' | 'CLOSED', openDays: number, description: string) =>
    prisma.jobOpening.create({
      data: { code, title, orgStructureId: orgIds[org], quantity, status, openDate: addDays(TODAY, -openDays), closeDate: status === 'CLOSED' ? addDays(TODAY, -5) : addDays(TODAY, 25), description },
    });
  const apps = async (openingId: string, stages: Array<[string, number]>) => {
    for (const [stage, n] of stages) {
      for (let k = 0; k < n; k++) {
        const g: Gender = chance(0.5) ? 'MALE' : 'FEMALE';
        const name = vnName(g);
        await prisma.jobApplication.create({
          data: {
            jobOpeningId: openingId,
            fullName: name,
            email: `${noAccent(name).toLowerCase().replace(/ /g, '.')}@mail.demo`,
            phone: uniqueDigits('09', 10),
            source: pick(['TopCV', 'VietnamWorks', 'Giới thiệu nội bộ', 'Website công ty', 'Facebook', 'LinkedIn']),
            stage: stage as never,
            rating: stage === 'APPLIED' ? null : int(2, 5),
            interviewAt: stage === 'INTERVIEW' ? at(addDays(TODAY, int(1, 7)), pick([9, 10, 14, 15]), pick([0, 30])) : null,
            note: stage === 'REJECTED' ? 'Chưa phù hợp yêu cầu' : null,
          },
        });
      }
    }
  };
  const o1 = await opening('TD-2026-01', 'Công nhân lắp ráp', 'XLR', 10, 'OPEN', 20, 'Lắp ráp linh kiện theo dây chuyền. Làm ca, có phụ cấp ăn ca, xe đưa đón.');
  await apps(o1.id, [['APPLIED', 9], ['SCREENING', 5], ['INTERVIEW', 4], ['OFFER', 2], ['REJECTED', 3]]);
  const o2 = await opening('TD-2026-02', 'Nhân viên kinh doanh miền Nam', 'KDMN', 3, 'OPEN', 15, 'Phát triển đại lý khu vực TP.HCM và miền Tây. Lương cứng + thưởng doanh số.');
  await apps(o2.id, [['APPLIED', 6], ['SCREENING', 3], ['INTERVIEW', 2], ['REJECTED', 2]]);
  const o3 = await opening('TD-2026-03', 'Lập trình viên Backend (Node.js)', 'CNTT', 2, 'OPEN', 30, 'Phát triển hệ thống nội bộ: HRM, ERP. Yêu cầu TypeScript, PostgreSQL.');
  await apps(o3.id, [['APPLIED', 4], ['SCREENING', 3], ['INTERVIEW', 3], ['OFFER', 1], ['REJECTED', 4]]);
  const o4 = await opening('TD-2026-04', 'Kế toán tổng hợp', 'TCKT', 1, 'CLOSED', 70, 'Kế toán tổng hợp, lập báo cáo thuế.');
  await apps(o4.id, [['REJECTED', 5]]);
  const hiredKt = emps.find((e) => e.job === 'KT' && e.hire > addDays(TODAY, -60)) ?? emps.find((e) => e.job === 'KT')!;
  await prisma.jobApplication.create({
    data: { jobOpeningId: o4.id, fullName: hiredKt.fullName, source: 'TopCV', stage: 'HIRED', rating: 5, hiredPersonId: hiredKt.personId },
  });
  const o5 = await opening('TD-2026-05', 'Kỹ sư QA/QC', 'QAQC', 1, 'DRAFT', 0, 'Kiểm soát chất lượng đầu vào, ISO 9001.');
  void o5;
  const o6 = await opening('TD-2026-06', 'Tài xế xe tải hạng C', 'VT', 2, 'OPEN', 10, 'Giao hàng tuyến Bình Dương – TP.HCM.');
  await apps(o6.id, [['APPLIED', 3], ['INTERVIEW', 1]]);

  // ---------- Tài khoản demo ----------
  console.log('… Tài khoản demo');
  const pw = await hashPassword('Demo@12345');
  const findEmp = (org: string, job: string) => emps.find((e) => e.org === org && e.job === job && !e.terminate)!;
  const accounts: Array<[string, 'HR' | 'ACCOUNTANT' | 'EMPLOYEE', Emp]> = [
    ['hr.demo', 'HR', findEmp('HCNS', 'TP')],
    ['ketoan.demo', 'ACCOUNTANT', findEmp('TCKT', 'KTT')],
    ['nhanvien.demo', 'EMPLOYEE', findEmp('XLR', 'CN')],
    ['kinhdoanh.demo', 'EMPLOYEE', findEmp('KDMN', 'NVKD')],
    // Quản lý trực tiếp của kinhdoanh.demo: duyệt đơn bước 1
    ['quanly.demo', 'EMPLOYEE', findEmp('KDMN', 'TP')],
  ];
  for (const [username, role, e] of accounts) {
    await prisma.user.create({ data: { username, passwordHash: pw, role, personId: e.personId } });
  }

  // ---------- Ca làm việc ----------
  console.log('… Ca làm việc');
  const shiftByCode = Object.fromEntries((await prisma.shift.findMany()).map((x) => [x.code, x.id]));
  if (shiftByCode.HC && shiftByCode.CA1) {
    const factory = active.filter((e) => ['CN', 'CNKT', 'TT'].includes(e.job));
    const officeIds = active.filter((e) => !factory.includes(e)).map((e) => e.id);
    await prisma.shiftAssignment.createMany({
      data: [
        ...officeIds.map((employmentId) => ({ employmentId, shiftId: shiftByCode.HC, effectiveDate: HISTORY_START })),
        ...factory.map((e) => ({ employmentId: e.id, shiftId: shiftByCode.CA1, effectiveDate: monthStart(0) })),
      ],
    });
    // Xoay ca tháng này và tháng sau: mỗi ca 1 tuần, công nhân chia 3 tổ lệch nhau; chủ nhật nghỉ.
    const pattern = [shiftByCode.CA1, shiftByCode.CA2, shiftByCode.CA3];
    const rosterRows: Array<{ employmentId: string; workDate: Date; shiftId: string | null }> = [];
    // Đổi ca vào thứ 2: đếm tuần từ thứ 2 đầu tiên ≤ ngày 1 của tháng.
    const firstMonday = addDays(monthStart(0), -((monthStart(0).getUTCDay() + 6) % 7));
    for (let d = monthStart(0); d < monthStart(2); d = addDays(d, 1)) {
      const week = Math.floor((d.getTime() - firstMonday.getTime()) / (7 * 86_400_000));
      factory.forEach((e, i) => {
        rosterRows.push({ employmentId: e.id, workDate: d, shiftId: d.getUTCDay() === 0 ? null : pattern[(week + (i % 3)) % 3] });
      });
    }
    for (let i = 0; i < rosterRows.length; i += 1000) await prisma.shiftRoster.createMany({ data: rosterRows.slice(i, i + 1000) });

    // Giờ vào / ra của công nhân trong tháng này theo đúng ca xoay; tính giờ công (muộn, sớm, giờ đêm) cho mọi bản ghi.
    console.log('… Giờ công theo ca');
    const { shiftService } = await import('../src/modules/shift/shift.service');
    const { computeAttendanceTimes, shiftWindow } = await import('../src/modules/shift/shift.logic');
    const records = await prisma.attendanceRecord.findMany({ where: { checkIn: { not: null } }, select: { id: true, employmentId: true, workDate: true, checkIn: true, checkOut: true, status: true } });
    const resolve = await shiftService.resolver([...new Set(records.map((r) => r.employmentId))], HISTORY_START, TODAY);
    const factoryIds = new Set(factory.map((e) => e.id));
    const rows: string[] = [];
    for (const r of records) {
      const sh = resolve(r.employmentId, r.workDate);
      let { checkIn, checkOut } = r;
      if (factoryIds.has(r.employmentId) && r.workDate >= monthStart(0) && sh.id) {
        const w = shiftWindow(r.workDate, sh);
        const late = r.status === 'LATE';
        checkIn = new Date(w.start.getTime() + (late ? int(6, 25) : -int(3, 20)) * 60_000);
        checkOut = r.checkOut ? new Date(w.end.getTime() + (chance(0.06) ? -int(10, 40) : int(0, 15)) * 60_000) : null;
        if (checkOut && checkOut > new Date()) checkOut = null;
      }
      const t = computeAttendanceTimes(checkIn, checkOut, r.workDate, sh);
      const ts = (d: Date | null) => (d ? `'${d.toISOString()}'::timestamp` : 'NULL::timestamp');
      rows.push(`('${r.id}'::uuid, ${ts(checkIn)}, ${ts(checkOut)}, ${sh.id ? `'${sh.id}'::uuid` : 'NULL::uuid'}, ${t.lateMinutes}, ${t.earlyMinutes}, ${t.workedMinutes ?? 'NULL'}, ${t.nightMinutes}, '${t.lateMinutes > 0 ? 'LATE' : r.status === 'LATE' ? 'PRESENT' : r.status}')`);
    }
    for (let i = 0; i < rows.length; i += 1000) {
      await prisma.$executeRawUnsafe(`
        UPDATE attendance_record a SET "checkIn" = v.ci, "checkOut" = v.co, "shiftId" = v.sid, "lateMinutes" = v.l::int, "earlyMinutes" = v.e::int,
          "workedMinutes" = v.w::int, "nightMinutes" = v.n::int, status = v.st::"AttendanceStatus"
        FROM (VALUES ${rows.slice(i, i + 1000).join(',')}) AS v(id, ci, co, sid, l, e, w, n, st)
        WHERE a.id = v.id`);
    }
    // Tính lại kỳ lương tháng này để có phụ cấp làm đêm.
    const current = await prisma.payPeriod.findFirst({ where: { dateStart: monthStart(0) } });
    if (current && current.status !== 'LOCKED') await payrollService.run({ payPeriodId: current.id, region: 1 });
  }

  // ---------- Khen thưởng – kỷ luật, đào tạo, đánh giá ----------
  console.log('… Khen thưởng, đào tạo, đánh giá');
  {
    const { rewardService } = await import('../src/modules/people/reward.service');
    const { trainingService } = await import('../src/modules/people/training.service');
    const { reviewService } = await import('../src/modules/people/review.service');
    const { ratingOf, weightedScore } = await import('../src/modules/people/people.logic');
    const hrUser = await prisma.user.findUnique({ where: { username: 'hr.demo' } });
    const sales = active.filter((e) => ['NVKD', 'CHT', 'NVBH'].includes(e.job));
    const workers = active.filter((e) => ['CN', 'CNKT', 'TT'].includes(e.job));
    const ymd = (d: Date) => iso(d);

    // Khen thưởng: thưởng doanh số quý 3 (tiền, vào kỳ lương tháng này), giấy khen tổ sản xuất.
    await rewardService.create(
      { employmentIds: sales.slice(0, 5).map((e) => e.id), kind: 'REWARD', form: 'CASH', decisionNo: `${TODAY.getUTCFullYear()}/QĐ-KT-01`, decisionDate: TODAY, effectiveDate: TODAY, reason: 'Vượt chỉ tiêu doanh số quý 3', amount: 3_000_000 },
      hrUser?.id,
    );
    await rewardService.create(
      { employmentIds: workers.slice(0, 8).map((e) => e.id), kind: 'REWARD', form: 'CERTIFICATE', decisionNo: `${TODAY.getUTCFullYear()}/QĐ-KT-02`, decisionDate: monthStart(-2), effectiveDate: monthStart(-2), reason: 'Tổ sản xuất an toàn, không sự cố 6 tháng' },
      hrUser?.id,
    );
    // Kỷ luật: khiển trách (còn hiệu lực) và kéo dài nâng lương (đã hết hiệu lực).
    await rewardService.create(
      { employmentIds: [workers[10].id], kind: 'DISCIPLINE', form: 'REPRIMAND', decisionNo: `${TODAY.getUTCFullYear()}/QĐ-KL-01`, decisionDate: monthStart(-1), effectiveDate: monthStart(-1), reason: 'Đi muộn nhiều lần trong tháng, đã nhắc nhở bằng văn bản', amount: 0 },
      hrUser?.id,
    );
    await rewardService.create(
      { employmentIds: [workers[11].id], kind: 'DISCIPLINE', form: 'EXTEND_RAISE', decisionNo: `${TODAY.getUTCFullYear() - 1}/QĐ-KL-03`, decisionDate: utc(TODAY.getUTCFullYear() - 1, 1, 10), effectiveDate: utc(TODAY.getUTCFullYear() - 1, 1, 10), reason: 'Vi phạm quy trình an toàn lao động gây hỏng thiết bị', amount: 1_500_000 },
      hrUser?.id,
    );

    // Đào tạo
    const safety = await trainingService.create({ code: 'ATLĐ-26', name: 'Huấn luyện an toàn lao động nhóm 3', provider: 'Trung tâm Huấn luyện ATVSLĐ Bình Dương', location: 'Nhà máy', startDate: monthStart(-4), endDate: addDays(monthStart(-4), 2), costPerPerson: 450_000, commitmentMonths: 0, status: 'DONE' });
    await trainingService.addParticipants(safety.id, workers.slice(0, 20).map((e) => e.id));
    const pm = await trainingService.create({ code: 'PMP-26', name: 'Quản lý dự án chuyên nghiệp (PMP)', provider: 'PMI Việt Nam', location: 'TP.HCM', startDate: monthStart(-6), endDate: addDays(monthStart(-5), 20), costPerPerson: 36_000_000, commitmentMonths: 24, status: 'DONE', description: 'Cam kết làm việc 24 tháng sau khoá học; nghỉ trước hạn bồi hoàn theo tỷ lệ thời gian còn lại.' });
    const pmPeople = active.filter((e) => ['KS', 'LTV', 'TP'].includes(e.job)).slice(0, 4);
    await trainingService.addParticipants(pm.id, pmPeople.map((e) => e.id));
    const excel = await trainingService.create({ code: 'EXCEL-26', name: 'Excel nâng cao cho văn phòng', provider: 'Nội bộ', location: 'Phòng họp tầng 3', startDate: addDays(TODAY, 10), endDate: addDays(TODAY, 11), costPerPerson: 0, commitmentMonths: 0, status: 'PLANNED' });
    await trainingService.addParticipants(excel.id, active.filter((e) => e.office).slice(0, 12).map((e) => e.id));
    const parts = await prisma.trainingParticipant.findMany({ where: { courseId: { in: [safety.id, pm.id] } } });
    for (const [i, p] of parts.entries()) {
      const passed = i % 9 !== 0;
      await prisma.trainingParticipant.update({
        where: { id: p.id },
        data: { result: passed ? 'PASSED' : 'FAILED', score: String(passed ? int(70, 98) : int(40, 60)), certificateNo: passed ? `CC-${String(1000 + i)}` : null, certificateExpiry: passed && p.courseId === safety.id ? addDays(monthStart(-4), 730) : null },
      });
    }

    // Đánh giá: kỳ 6 tháng đầu năm (đã xong), kỳ quý 3 (đang làm, đủ các trạng thái).
    const goalsSales = [
      { title: 'Doanh số so với chỉ tiêu', weight: 50 },
      { title: 'Khách hàng mới', weight: 20 },
      { title: 'Chăm sóc khách hàng, công nợ', weight: 20 },
      { title: 'Tuân thủ nội quy', weight: 10 },
    ];
    const y = TODAY.getUTCFullYear();
    for (const [name, from, to, due, finish] of [
      [`Đánh giá 6 tháng đầu năm ${y}`, utc(y, 0, 1), utc(y, 5, 30), utc(y, 6, 15), 1],
      [`Đánh giá quý 3/${y}`, utc(y, 6, 1), utc(y, 8, 30), addDays(TODAY, 14), 0.45],
    ] as Array<[string, Date, Date, Date, number]>) {
      const cycle = await reviewService.createCycle({ name, fromDate: from, toDate: to, dueDate: due, goalTemplate: goalsSales });
      const reviews = await prisma.performanceReview.findMany({ where: { cycleId: cycle.id } });
      for (const [i, r] of reviews.entries()) {
        const stage = finish === 1 ? 2 : rand() < finish ? 2 : rand() < 0.5 ? 1 : 0; // 0 SELF, 1 MANAGER, 2 DONE
        if (stage === 0) continue;
        const base = 2.5 + rand() * 2.5;
        const goals = goalsSales.map((g) => ({
          ...g,
          selfScore: Math.min(5, Math.max(1, Math.round((base + rand() - 0.3) * 2) / 2)),
          managerScore: stage === 2 ? Math.min(5, Math.max(1, Math.round((base + rand() - 0.6) * 2) / 2)) : null,
          comment: null,
        }));
        const self = weightedScore(goals, 'selfScore');
        const fin = stage === 2 ? weightedScore(goals, 'managerScore') : null;
        await prisma.performanceReview.update({
          where: { id: r.id },
          data: {
            goals,
            selfScore: self === null ? null : String(self),
            selfComment: i % 4 === 0 ? 'Hoàn thành tốt mục tiêu chính, cần cải thiện công nợ.' : null,
            status: stage === 2 ? 'DONE' : 'MANAGER',
            submittedAt: addDays(due, -int(3, 10)),
            ...(fin !== null ? { finalScore: String(fin), rating: ratingOf(fin), completedAt: addDays(due, -int(0, 2)), managerComment: 'Đồng ý với kết quả tự đánh giá.' } : {}),
          },
        });
      }
      if (finish === 1) await prisma.reviewCycle.update({ where: { id: cycle.id }, data: { status: 'CLOSED' } });
    }
    void ymd;
    // Tài khoản demo tạo sau khi khoá kỳ → gửi lại thông báo phiếu lương kỳ gần nhất.
    const { events } = await import('../src/modules/notification/events');
    const lastLocked = await prisma.payPeriod.findFirst({ where: { status: 'LOCKED' }, orderBy: { dateEnd: 'desc' } });
    if (lastLocked) await events.payrollLocked(lastLocked.id, lastLocked.code);
  }

  // ---------- Tổng kết ----------
  const [nPerson, nAtt, nLeave, nResult, nContract] = await Promise.all([
    prisma.person.count(),
    prisma.attendanceRecord.count(),
    prisma.leaveRequest.count(),
    prisma.payrollResult.count(),
    prisma.laborContract.count(),
  ]);
  console.log(`\n✅ Dữ liệu mẫu: ${Object.keys(orgIds).length} đơn vị, ${Object.keys(JOBS).length} chức danh, ${nPerson} nhân sự (${active.length} đang làm, ${emps.length - active.length} đã nghỉ),`);
  console.log(`   ${nContract} hợp đồng, ${nLeave} đơn nghỉ, ${otRows.length} đơn làm thêm giờ, ${nAtt} bản ghi chấm công, ${nResult} dòng bảng lương, 6 tin tuyển dụng.`);
  console.log('\n   Tài khoản demo (mật khẩu Demo@12345):');
  for (const [u, role, e] of accounts) console.log(`   - ${u.padEnd(15)} ${role.padEnd(10)} ${e.fullName} · ${orgNames[e.org]}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
