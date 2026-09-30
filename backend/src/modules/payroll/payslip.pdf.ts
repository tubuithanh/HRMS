import { Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { PayslipData } from './payslip';

/**
 * Kết xuất phiếu lương ra PDF (đệm sẵn font DejaVu để hiển thị tiếng Việt).
 * Phiếu chi tiết (có `sections`) in theo từng phần; phiếu tóm tắt in `lines`.
 */

const FONT_DIR = path.join(__dirname, '../../../assets/fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

const INK = '#1c2430';
const MUTED = '#6b7280';
const RULE = '#d9dde3';
const ACCENT = '#2a78d6';

function formatVND(amount: string): string {
  const negative = amount.startsWith('-');
  const n = Number(negative ? amount.slice(1) : amount);
  return `${negative ? '−' : ''}${n.toLocaleString('vi-VN')} đ`;
}

export function renderPayslipPdf(data: PayslipData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Phiếu lương ${data.periodCode} - ${data.employeeCode}` } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const hasFonts = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);
      if (hasFonts) {
        doc.registerFont('vi', FONT_REGULAR);
        doc.registerFont('vi-bold', FONT_BOLD);
      }
      const regular = hasFonts ? 'vi' : 'Helvetica';
      const bold = hasFonts ? 'vi-bold' : 'Helvetica-Bold';
      const left = 50;
      const right = 545;
      const width = right - left;

      /** Một dòng: nhãn (+ ghi chú nhỏ) bên trái, số tiền bên phải. */
      const row = (label: string, amount: string, opts: { bold?: boolean; note?: string; indent?: number } = {}) => {
        if (doc.y > 760) doc.addPage();
        const y = doc.y;
        const x = left + (opts.indent ?? 0);
        doc.font(opts.bold ? bold : regular).fontSize(10).fillColor(INK);
        doc.text(label, x, y, { width: width - 150 - (opts.indent ?? 0) });
        const afterLabel = doc.y;
        doc.text(formatVND(amount), left, y, { width, align: 'right' });
        doc.y = Math.max(afterLabel, doc.y);
        if (opts.note) {
          doc.font(regular).fontSize(8).fillColor(MUTED).text(opts.note, x, doc.y + 1, { width: width - 150 });
        }
        doc.moveDown(0.45);
      };
      const rule = (color = RULE) => {
        doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.7).strokeColor(color).stroke();
        doc.moveDown(0.4);
      };

      // ---------- Tiêu đề ----------
      if (data.companyName) {
        doc.font(bold).fontSize(10).fillColor(MUTED).text(data.companyName.toUpperCase(), left, 50, { width });
        doc.moveDown(0.6);
      }
      doc.font(bold).fontSize(17).fillColor(INK).text('PHIẾU LƯƠNG', { align: 'center' });
      doc.font(regular).fontSize(10).fillColor(MUTED).text(`Kỳ lương ${data.periodCode}`, { align: 'center' });
      doc.moveDown(1);

      if (!data.sections) {
        // ---------- Phiếu tóm tắt (kiểu cũ) ----------
        doc.font(regular).fontSize(11).fillColor(INK);
        doc.text(`Nhân viên: ${data.employeeName}`);
        doc.text(`Mã nhân viên: ${data.employeeCode}`);
        doc.moveDown(1);
        for (const line of data.lines) row(line.label, line.amount, { bold: line.group === 'SUMMARY' });
      } else {
        // ---------- Thông tin nhân viên: 2 cột ----------
        const info = data.info ?? [];
        const colW = width / 2;
        const labelW = 90;
        let y = doc.y;
        // Mỗi hàng 2 ô; chiều cao hàng = ô cao nhất (giá trị dài sẽ xuống dòng).
        for (let i = 0; i < info.length; i += 2) {
          const cells = info.slice(i, i + 2);
          doc.font(bold).fontSize(9.5);
          const h = Math.max(...cells.map(([, v]) => doc.heightOfString(v, { width: colW - labelW - 8 })));
          cells.forEach(([k, v], j) => {
            const x = left + j * colW;
            doc.font(regular).fontSize(9).fillColor(MUTED).text(k, x, y + 0.5, { width: labelW });
            doc.font(bold).fontSize(9.5).fillColor(INK).text(v, x + labelW, y, { width: colW - labelW - 8 });
          });
          y += h + 6;
        }
        doc.y = y + 2;
        doc.x = left;
        rule();

        // ---------- Các phần ----------
        for (const section of data.sections) {
          doc.moveDown(0.3);
          doc.font(bold).fontSize(10.5).fillColor(ACCENT).text(section.title, left, doc.y);
          doc.moveDown(0.4);
          for (const r of section.rows) row(r.label, r.amount, { bold: r.bold, note: r.note, indent: 10 });
          if (section.total) {
            rule();
            row(section.total.label, section.total.amount, { bold: true });
          }
          doc.moveDown(0.4);
        }

        // ---------- Thực lĩnh ----------
        if (doc.y > 720) doc.addPage();
        const boxY = doc.y + 4;
        doc.rect(left, boxY, width, 34).fillColor('#eef4fc').fill();
        doc.font(bold).fontSize(12).fillColor(INK).text('THỰC LĨNH', left + 12, boxY + 10);
        doc.font(bold).fontSize(13).fillColor(ACCENT).text(formatVND(data.netPay), left, boxY + 9, { width: width - 12, align: 'right' });
        doc.y = boxY + 46;
        doc.x = left;

        for (const n of data.notes ?? []) {
          doc.font(regular).fontSize(8.5).fillColor(MUTED).text(`• ${n}`, left, doc.y, { width });
          doc.moveDown(0.2);
        }
      }

      doc.moveDown(1.5);
      doc
        .font(regular)
        .fontSize(8)
        .fillColor(MUTED)
        .text('Phiếu lương do hệ thống ATECH HRM tạo tự động. Thông tin lương là bảo mật — vui lòng phản hồi bộ phận nhân sự nếu có sai sót.', left, doc.y, {
          width,
          align: 'center',
        });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** Tạo PDF phiếu lương và gửi về trình duyệt dưới dạng file tải xuống. */
export async function sendPayslipPdf(res: Response, data: PayslipData) {
  const pdf = await renderPayslipPdf(data);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${data.employeeCode}-${data.periodCode}.pdf"`);
  res.send(pdf);
}
