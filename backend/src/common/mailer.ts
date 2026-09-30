import nodemailer from 'nodemailer';
import { env } from '../config/env';

/**
 * Gửi email. Nếu chưa cấu hình SMTP_HOST thì in nội dung ra log (tiện khi
 * phát triển) thay vì gửi — không bao giờ ném lỗi làm hỏng request.
 */
const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transport) {
    console.log(`\n📧 [chưa cấu hình SMTP] Email tới ${to}\n   Tiêu đề: ${subject}\n   ${text.replace(/\n/g, '\n   ')}\n`);
    return;
  }
  try {
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
  } catch (e) {
    console.error('Gửi email thất bại:', e instanceof Error ? e.message : e);
  }
}
