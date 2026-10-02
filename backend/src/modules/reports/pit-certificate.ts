import Decimal from 'decimal.js';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../common/errors/AppError';
import { getCompany } from '../settings/settings.service';

/**
 * Chứng từ khấu trừ thuế TNCN cho tiền lương, tiền công (nội dung theo Điều 32 Nghị định 123/2020).
 * Hệ thống lập số liệu, đánh số và in PDF để ký, đóng dấu. Chứng từ điện tử có giá trị pháp lý
 * còn cần ký số và đăng ký sử dụng với cơ quan thuế — làm ngoài hệ thống.
 */

export const issueSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    fromMonth: z.number().int().min(1).max(12).default(1),
    toMonth: z.number().int().min(1).max(12).default(12),
    employmentIds: z.array(z.string().uuid()).optional(),
    /** Lập cả cho người không bị khấu trừ thuế (cá nhân yêu cầu để tự quyết toán). */
    includeZeroTax: z.boolean().default(false),
  })
  .refine((v) => v.toMonth >= v.fromMonth, { message: 'Đến tháng phải sau từ tháng', path: ['toMonth'] });

const dec = (v: unknown) => new Decimal(v === null || v === undefined ? 0 : String(v));
const SYMBOL = (year: number) => `CT/${String(year).slice(2)}E`;

const certInclude = {
  employment: {
    select: {
      codeEmp: true,
      person: { select: { fullName: true, personalTaxCode: true, idNo: true, idDateOfIssue: true, idPlaceOfIssue: true, nationality: true, isForeigner: true } },
    },
  },
} as const;

export const pitCertificateService = {
  /** Lập (hoặc cập nhật số liệu) chứng từ cho từng người có lương trong khoảng tháng. */
  async issue(input: z.infer<typeof issueSchema>, userId?: string) {
    const start = new Date(Date.UTC(input.year, input.fromMonth - 1, 1));
    const end = new Date(Date.UTC(input.year, input.toMonth, 0));
    const periods = await prisma.payPeriod.findMany({ where: { dateEnd: { gte: start, lte: end }, status: { not: 'CANCELLED' } }, select: { id: true } });
    if (periods.length === 0) throw new ValidationError('Không có kỳ lương trong khoảng tháng đã chọn');
    const results = await prisma.payrollResult.findMany({
      where: {
        payPeriodId: { in: periods.map((p) => p.id) },
        ...(input.employmentIds ? { employmentId: { in: input.employmentIds } } : {}),
      },
      select: { employmentId: true, taxableIncome: true, empInsurance: true, pitAmount: true },
    });
    const sums = new Map<string, { income: Decimal; ins: Decimal; tax: Decimal }>();
    for (const r of results) {
      const s = sums.get(r.employmentId) ?? { income: new Decimal(0), ins: new Decimal(0), tax: new Decimal(0) };
      s.income = s.income.plus(dec(r.taxableIncome));
      s.ins = s.ins.plus(dec(r.empInsurance));
      s.tax = s.tax.plus(dec(r.pitAmount));
      sums.set(r.employmentId, s);
    }
    const targets = [...sums.entries()].filter(([, s]) => input.includeZeroTax || s.tax.gt(0));
    if (targets.length === 0) throw new ValidationError('Không có ai bị khấu trừ thuế trong khoảng tháng này');

    return prisma.$transaction(async (tx) => {
      let seq = (await tx.pitCertificate.aggregate({ where: { year: input.year }, _max: { seq: true } }))._max.seq ?? 0;
      let created = 0;
      let updated = 0;
      for (const [employmentId, s] of targets) {
        const key = { employmentId, year: input.year, fromMonth: input.fromMonth, toMonth: input.toMonth };
        const data = { taxableIncome: s.income.toFixed(4), insurance: s.ins.toFixed(4), taxWithheld: s.tax.toFixed(4), issuedById: userId ?? null };
        const existing = await tx.pitCertificate.findUnique({ where: { employmentId_year_fromMonth_toMonth: key } });
        if (existing) {
          await tx.pitCertificate.update({ where: { id: existing.id }, data: { ...data, issuedAt: new Date() } });
          updated++;
        } else {
          await tx.pitCertificate.create({ data: { ...key, ...data, seq: ++seq, symbol: SYMBOL(input.year) } });
          created++;
        }
      }
      return { created, updated };
    });
  },

  list(filter: { year: number; employmentId?: string; personId?: string }) {
    return prisma.pitCertificate.findMany({
      where: {
        year: filter.year,
        ...(filter.employmentId ? { employmentId: filter.employmentId } : {}),
        ...(filter.personId ? { employment: { personId: filter.personId } } : {}),
      },
      include: certInclude,
      orderBy: { seq: 'asc' },
    });
  },

  async remove(id: string) {
    const c = await prisma.pitCertificate.findUnique({ where: { id } });
    if (!c) throw new NotFoundError('Không tìm thấy chứng từ');
    await prisma.pitCertificate.delete({ where: { id } });
  },

  /** PDF nhiều chứng từ (mỗi chứng từ một trang). personId: chỉ cho phép chứng từ của người đó. */
  async pdf(ids: string[], personId?: string) {
    const certs = await prisma.pitCertificate.findMany({
      where: { id: { in: ids }, ...(personId ? { employment: { personId } } : {}) },
      include: certInclude,
      orderBy: { seq: 'asc' },
    });
    if (certs.length === 0) throw new NotFoundError('Không tìm thấy chứng từ');
    const company = await getCompany();
    return renderCertificatesPdf(certs, company);
  },
};

// ===================== PDF =====================

const FONT_DIR = path.join(__dirname, '../../../assets/fonts');
const vnd = (d: Decimal) => `${Number(d.toFixed(0)).toLocaleString('vi-VN')} đồng`;
const dmy = (d: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '');

type Cert = Awaited<ReturnType<typeof pitCertificateService.list>>[number];

function renderCertificatesPdf(certs: Cert[], company: { name: string; taxCode: string | null; address: string | null }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: false, info: { Title: 'Chứng từ khấu trừ thuế TNCN' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const regularPath = path.join(FONT_DIR, 'DejaVuSans.ttf');
    const boldPath = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');
    const hasFonts = fs.existsSync(regularPath) && fs.existsSync(boldPath);
    if (hasFonts) {
      doc.registerFont('vi', regularPath);
      doc.registerFont('vi-bold', boldPath);
    }
    const R = hasFonts ? 'vi' : 'Helvetica';
    const B = hasFonts ? 'vi-bold' : 'Helvetica-Bold';
    const L = 50;
    const W = 495;

    const field = (code: string, label: string, value: string) => {
      const y = doc.y;
      doc.font(R).fontSize(10).fillColor('#000').text(`[${code}] ${label}:`, L, y, { width: 230 });
      const after = doc.y;
      doc.font(B).text(value || '……………………………', L + 235, y, { width: W - 235 });
      doc.y = Math.max(after, doc.y) + 3;
    };
    const section = (t: string) => {
      doc.moveDown(0.5);
      doc.font(B).fontSize(10.5).text(t, L, doc.y);
      doc.moveDown(0.3);
    };

    for (const c of certs) {
      doc.addPage();
      const p = c.employment.person;
      // Đầu trang: tổ chức bên trái, ký hiệu bên phải.
      doc.font(B).fontSize(9.5).text(company.name.toUpperCase(), L, 50, { width: 280 });
      doc.font(R).fontSize(9).text(`MST: ${company.taxCode ?? ''}`, L, doc.y, { width: 280 });
      doc.font(R).fontSize(9).text(`Ký hiệu mẫu: CTT56\nKý hiệu: ${c.symbol}\nSố: ${String(c.seq).padStart(7, '0')}`, L + 300, 50, { width: 195, align: 'right' });
      doc.y = 105;
      doc.font(B).fontSize(15).text('CHỨNG TỪ KHẤU TRỪ THUẾ THU NHẬP CÁ NHÂN', L, doc.y, { width: W, align: 'center' });
      doc.font(R).fontSize(9).fillColor('#555').text('(Theo Nghị định số 123/2020/NĐ-CP)', { width: W, align: 'center' });
      doc.fillColor('#000').moveDown(0.6);

      section('I. THÔNG TIN TỔ CHỨC KHẤU TRỪ THUẾ');
      field('01', 'Tên tổ chức trả thu nhập', company.name);
      field('02', 'Mã số thuế', company.taxCode ?? '');
      field('03', 'Địa chỉ', company.address ?? '');

      section('II. THÔNG TIN NGƯỜI NỘP THUẾ');
      field('04', 'Họ và tên', p.fullName);
      field('05', 'Mã số thuế', p.personalTaxCode ?? '');
      field('06', 'Quốc tịch', p.nationality ?? 'Việt Nam');
      field('07', 'Cá nhân', p.isForeigner ? 'Không cư trú / cư trú (đối chiếu hồ sơ thuế)' : 'Cư trú');
      field('08', 'Số CCCD / hộ chiếu', p.idNo ?? '');
      field('09', 'Nơi cấp', p.idPlaceOfIssue ?? '');
      field('10', 'Ngày cấp', dmy(p.idDateOfIssue));

      section('III. THÔNG TIN THUẾ THU NHẬP CÁ NHÂN KHẤU TRỪ');
      const income = dec(c.taxableIncome);
      const tax = dec(c.taxWithheld);
      field('11', 'Khoản thu nhập', 'Tiền lương, tiền công');
      field('12', 'Khoản đóng bảo hiểm bắt buộc', vnd(dec(c.insurance)));
      field('13', 'Thời điểm trả thu nhập', `Tháng ${c.fromMonth} đến tháng ${c.toMonth} năm ${c.year}`);
      field('14', 'Tổng thu nhập chịu thuế phải khấu trừ', vnd(income));
      field('15', 'Số thuế thu nhập cá nhân đã khấu trừ', vnd(tax));
      field('16', 'Tổng thu nhập cá nhân còn được nhận', vnd(income.minus(tax)));

      doc.moveDown(1.2);
      const d = c.issuedAt;
      const y = doc.y;
      doc.font(R).fontSize(10).text(`Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`, L + 260, y, { width: 235, align: 'center' });
      doc.font(B).text('ĐẠI DIỆN TỔ CHỨC TRẢ THU NHẬP', L + 260, doc.y + 4, { width: 235, align: 'center' });
      doc.font(R).fontSize(9).fillColor('#555').text('(Ký, ghi rõ họ tên, đóng dấu)', L + 260, doc.y, { width: 235, align: 'center' });
      doc.fillColor('#000');
      doc.font(R).fontSize(8).fillColor('#777').text(`Mã nhân viên: ${c.employment.codeEmp}`, L, 780, { width: W });
      doc.fillColor('#000');
    }
    doc.end();
  });
}
