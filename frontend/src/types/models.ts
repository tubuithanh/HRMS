/** Kiểu dữ liệu trả về từ backend (chỉ các trường giao diện dùng). */

export interface PersonRef {
  id: string;
  personCode: string;
  fullName: string;
}

export interface Person extends PersonRef {
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth: string | null;
  idNo: string | null;
  idExpiryDate: string | null;
  personalTaxCode: string | null;
  socialInsNo: string | null;
  nationality: string | null;
  isForeigner: boolean;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export interface Company {
  id: string;
  code: string;
  name: string;
}

export interface OrgUnit {
  id: string;
  companyId: string;
  code: string;
  name: string;
  orgType: string;
  parentId: string | null;
  path: string | null;
  isRoot: boolean;
  effectiveDate: string;
}

export interface Job {
  id: string;
  code: string;
  name: string;
  jobFamily: string | null;
  isHazardous: boolean;
  maxProbationDays: number | null;
}

export interface Position {
  id: string;
  code: string;
  status: string;
  isKeyPosition: boolean;
  effectiveDate: string;
  job: { id: string; code: string; name: string };
  orgStructure: { id: string; code: string; name: string };
}

export interface Assignment {
  id: string;
  effectiveDate: string;
  endDate: string | null;
  isPrimary: boolean;
  actionType: string;
  actionReason: string | null;
  position: { code: string; job?: { name: string } };
  orgStructure: { name: string };
}

export interface Salary {
  id: string;
  salaryType: string;
  baseAmount: string;
  insuranceSalary: string | null;
  effectiveDate: string;
  endDate: string | null;
}

export interface TaxProfile {
  id: string;
  taxResidentStatus: string;
  taxMethod: string;
  hasCommitment08: boolean;
  effectiveDate: string;
  endDate: string | null;
}

export interface Employment {
  id: string;
  personId: string;
  companyId: string;
  codeEmp: string;
  codeAttendance: string | null;
  employmentType: string;
  dateHire: string;
  probationEndDate: string | null;
  dateTerminate: string | null;
  status: string;
  person?: PersonRef;
  company?: { id: string; code: string; name: string };
  assignments?: Assignment[];
  salaries?: Salary[];
  taxProfiles?: TaxProfile[];
}

export interface PayPeriod {
  id: string;
  code: string;
  periodType: string;
  dateStart: string;
  dateEnd: string;
  payDate: string | null;
  status: string;
}

export interface PayrollResult {
  id: string;
  employmentId: string;
  grossIncome: string;
  taxableIncome: string;
  insuranceBase: string;
  empInsurance: string;
  companyInsurance: string;
  dependantCount: number;
  assessableIncome: string;
  pitAmount: string;
  standardDays: number | null;
  paidDays: string | null;
  otherDeductions: string;
  deferredDeduction: string;
  netPay: string;
  employment: { codeEmp: string; person: { fullName: string; personCode: string } };
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  daysPerYear: string | null;
  seniorityBonus: boolean;
  carryOverMaxDays: string | null;
  carryOverUntilMonth: number | null;
  isActive: boolean;
}

export interface LeaveRequest {
  id: string;
  employmentId: string;
  fromDate: string;
  toDate: string;
  isHalfDay: boolean;
  halfDayPart: 'MORNING' | 'AFTERNOON' | null;
  days: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  approvalStage: 'MANAGER' | 'HR';
  approverEmployment?: { id?: string; codeEmp?: string; person: { fullName: string } } | null;
  managerNote: string | null;
  managerReviewedAt: string | null;
  leaveType: { id: string; code: string; name: string; isPaid: boolean };
  employment?: { id: string; codeEmp: string; person: PersonRef };
  reviewedBy?: { username: string } | null;
}

export interface LeaveBalance {
  leaveType: { id: string; code: string; name: string; isPaid: boolean };
  year: number;
  entitled: string | null;
  carriedOver: string | null;
  carryExpiry: string | null;
  used: string;
  pending: string;
  remaining: string | null;
}

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'REMOTE' | 'ABSENT' | 'LEAVE' | 'HOLIDAY';

export interface AttendanceRecord {
  id: string;
  employmentId: string;
  workDate: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  note: string | null;
  source: string;
}

export interface TimesheetRow {
  employmentId: string;
  codeEmp: string;
  person: PersonRef;
  standardDays: number;
  present: number;
  late: number;
  remote: number;
  absent: number;
  holiday: number;
  paidLeave: number;
  unpaidLeave: number;
  paidDays: number;
  overtimeHours: number;
  days: Record<string, AttendanceStatus>;
}

export type Stage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';

export interface JobOpening {
  id: string;
  code: string;
  title: string;
  orgStructureId: string | null;
  orgStructure: { id: string; name: string } | null;
  quantity: number;
  description: string | null;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  openDate: string;
  closeDate: string | null;
  applicationCount: number;
  stageCounts: Partial<Record<Stage, number>>;
}

export interface JobApplication {
  id: string;
  jobOpeningId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  cvUrl: string | null;
  stage: Stage;
  interviewAt: string | null;
  rating: number | null;
  note: string | null;
  hiredPerson: PersonRef | null;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  username: string;
  role: 'ADMIN' | 'HR' | 'ACCOUNTANT' | 'EMPLOYEE';
  personId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  failedLoginCount: number;
  person: PersonRef | null;
}

export interface PayElement {
  id: string;
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  taxTreatment: 'TAXABLE' | 'PARTIAL_EXEMPT' | 'EXEMPT';
  taxExemptLimit: string | null;
  isInsuranceBase: boolean;
  isProrated: boolean;
  isActive: boolean;
}

export interface EmployeeElement {
  id: string;
  amount: string;
  effectiveDate: string;
  endDate: string | null;
  payElement: PayElement;
}

export interface PeriodElement {
  id: string;
  amount: string;
  note: string | null;
  payElement: PayElement;
  employment: { id: string; codeEmp: string; person: { fullName: string; personCode: string } };
}

export interface Advance {
  id: string;
  requestDate: string;
  amount: string;
  reason: string | null;
  installments: number;
  status: string;
  schedule: Array<{ id: string; index: number; amount: string; isDeducted: boolean; payPeriodId: string | null }>;
}

export type ContractType = 'PROBATION' | 'FIXED_TERM' | 'INDEFINITE' | 'SERVICE';

export interface LaborContract {
  id: string;
  employmentId: string;
  contractNo: string;
  contractType: ContractType;
  parentId: string | null;
  parent?: { id: string; contractNo: string } | null;
  signDate: string;
  startDate: string;
  endDate: string | null;
  salaryAmount: string | null;
  jobTitle: string | null;
  note: string | null;
  terminatedDate: string | null;
  terminateReason: string | null;
  warning?: 'EXPIRED' | 'EXPIRING';
  employment?: { id: string; codeEmp: string; status: string; person: PersonRef };
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface OvertimeRequest {
  id: string;
  employmentId: string;
  workDate: string;
  hours: string;
  otType: 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY';
  isNight: boolean;
  multiplier: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewNote: string | null;
  approvalStage: 'MANAGER' | 'HR';
  approverEmployment?: { id?: string; codeEmp?: string; person: { fullName: string } } | null;
  managerNote: string | null;
  managerReviewedAt: string | null;
  employment?: { id: string; codeEmp: string; person: PersonRef };
  reviewedBy?: { username: string } | null;
}
