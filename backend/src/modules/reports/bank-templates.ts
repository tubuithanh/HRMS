import { z } from 'zod';
import { prisma } from '../../config/prisma';

/**
 * Mẫu file chuyển lương: mỗi ngân hàng một bố cục cột khác nhau, kế toán tự khai báo
 * (thứ tự cột, tên cột, Excel hay CSV) theo file mẫu tải từ Internet Banking.
 * Lưu trong system_setting (key "bankTemplates").
 */

export const BANKS: Record<string, string> = {
  VCB: 'Vietcombank',
  TCB: 'Techcombank',
  BIDV: 'BIDV',
  VTB: 'VietinBank',
  ACB: 'ACB',
  MB: 'MB Bank',
  VPB: 'VPBank',
  TPB: 'TPBank',
  STB: 'Sacombank',
  AGR: 'Agribank',
};

export const BANK_FIELDS = {
  stt: 'STT',
  accountNo: 'Số tài khoản',
  beneficiary: 'Tên người hưởng (in hoa, không dấu)',
  fullName: 'Họ tên (có dấu)',
  bankCode: 'Mã ngân hàng',
  bankName: 'Tên ngân hàng',
  branch: 'Chi nhánh',
  amount: 'Số tiền',
  content: 'Nội dung chuyển khoản',
  codeEmp: 'Mã nhân viên',
} as const;
export type BankField = keyof typeof BANK_FIELDS;

const templateSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(100),
  format: z.enum(['xlsx', 'csv']),
  /** Tách sheet / file cùng ngân hàng và khác ngân hàng. */
  splitByBank: z.boolean(),
  headerRow: z.boolean(),
  columns: z
    .array(
      z.object({
        field: z.enum(Object.keys(BANK_FIELDS) as [BankField, ...BankField[]]),
        header: z.string().trim().min(1).max(60),
      }),
    )
    .min(1)
    .max(20),
});
export type BankTemplate = z.infer<typeof templateSchema>;

export const bankTemplatesSchema = z
  .array(templateSchema)
  .min(1)
  .max(30)
  .refine((xs) => new Set(xs.map((x) => x.id)).size === xs.length, { message: 'Mã mẫu bị trùng' });

export const DEFAULT_TEMPLATE: BankTemplate = {
  id: 'default',
  name: 'Mẫu chung',
  format: 'xlsx',
  splitByBank: true,
  headerRow: true,
  columns: [
    { field: 'stt', header: 'STT' },
    { field: 'accountNo', header: 'Số tài khoản' },
    { field: 'beneficiary', header: 'Tên người thụ hưởng' },
    { field: 'bankCode', header: 'Ngân hàng' },
    { field: 'branch', header: 'Chi nhánh' },
    { field: 'amount', header: 'Số tiền' },
    { field: 'content', header: 'Nội dung' },
    { field: 'codeEmp', header: 'Mã NV' },
  ],
};

const KEY = 'bankTemplates';

export async function getBankTemplates(): Promise<BankTemplate[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  const parsed = bankTemplatesSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : [DEFAULT_TEMPLATE];
}

export async function saveBankTemplates(templates: BankTemplate[]) {
  await prisma.systemSetting.upsert({ where: { key: KEY }, update: { value: templates }, create: { key: KEY, value: templates } });
  return templates;
}

export interface TransferRow {
  codeEmp: string;
  fullName: string;
  beneficiary: string;
  accountNo: string | null;
  bank: string | null;
  branch: string | null;
  amount: number;
}

/** Giá trị một ô theo trường của mẫu. */
export function cellValue(field: BankField, r: TransferRow, index: number, content: string): string | number {
  switch (field) {
    case 'stt':
      return index + 1;
    case 'accountNo':
      return r.accountNo ?? '';
    case 'beneficiary':
      return r.beneficiary;
    case 'fullName':
      return r.fullName;
    case 'bankCode':
      return r.bank ?? '';
    case 'bankName':
      return (r.bank && BANKS[r.bank]) || r.bank || '';
    case 'branch':
      return r.branch ?? '';
    case 'amount':
      return r.amount;
    case 'content':
      return content;
    case 'codeEmp':
      return r.codeEmp;
  }
}

/** CSV UTF-8 có BOM (Excel mở đúng tiếng Việt); bọc ngoặc kép khi cần. */
export function toCsv(template: BankTemplate, rows: TransferRow[], content: string): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  if (template.headerRow) lines.push(template.columns.map((c) => esc(c.header)).join(','));
  rows.forEach((r, i) => lines.push(template.columns.map((c) => esc(cellValue(c.field, r, i, content))).join(',')));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
