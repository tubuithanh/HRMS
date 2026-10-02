/**
 * Lấy GMAIL_REFRESH_TOKEN cho gửi email Gmail OAuth2 — chạy MỘT LẦN trên máy của bạn:
 *
 *   cd backend
 *   npm run gmail:token
 *
 * Cần GMAIL_CLIENT_ID và GMAIL_CLIENT_SECRET (trong backend/.env hoặc biến môi trường) của một
 * OAuth client loại "Desktop app" trên Google Cloud (xem README → Gửi email bằng Gmail OAuth2).
 * Lệnh mở một cổng tạm trên 127.0.0.1, in đường dẫn đăng nhập Google; đăng nhập bằng tài khoản Gmail
 * dùng để gửi, bấm Cho phép → refresh token được in ra màn hình. KHÔNG chia sẻ / commit token này.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('❌ Thiếu GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET (đặt trong backend/.env rồi chạy lại).');
  process.exit(1);
}

// https://mail.google.com/ cần cho gửi qua SMTP (XOAUTH2); cũng đủ cho Gmail API.
const SCOPE = 'https://mail.google.com/';
const verifier = crypto.randomBytes(48).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(16).toString('hex');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/') {
    res.writeHead(404).end();
    return;
  }
  const html = (title: string, msg: string) =>
    `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;padding:2rem"><h2>${title}</h2><p>${msg}</p></body>`;
  if (url.searchParams.get('state') !== state) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(html('Sai mã kiểm tra', 'Hãy chạy lại lệnh.'));
    return;
  }
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(html('Chưa cấp quyền', error ?? 'Không nhận được mã.'));
    console.error(`❌ Google trả lỗi: ${error}`);
    server.close();
    return;
  }
  const { port } = server.address() as { port: number };
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `http://127.0.0.1:${port}/`,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const body = (await r.json()) as { refresh_token?: string; error?: string; error_description?: string };
  if (!body.refresh_token) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' }).end(html('Không lấy được refresh token', body.error_description ?? body.error ?? ''));
    console.error('❌ Không lấy được refresh token:', body.error_description ?? body.error ?? body);
    console.error('   Nếu đã cấp quyền trước đó: vào https://myaccount.google.com/permissions gỡ quyền của ứng dụng rồi chạy lại.');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html('Đã lấy refresh token ✔', 'Quay lại cửa sổ dòng lệnh. Có thể đóng tab này.'));
    console.log('\n✅ GMAIL_REFRESH_TOKEN (đặt vào backend/.env và biến môi trường trên Render — giữ bí mật):\n');
    console.log(body.refresh_token);
    console.log('\nĐặt thêm GMAIL_USER = địa chỉ Gmail vừa đăng nhập.\n');
  }
  server.close();
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as { port: number };
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `http://127.0.0.1:${port}/`,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // luôn trả refresh token
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  console.log('\nMở đường dẫn sau trong trình duyệt, đăng nhập bằng tài khoản Gmail dùng để GỬI email và bấm Cho phép:\n');
  console.log(auth.toString());
  console.log('\n(Đang chờ… nhấn Ctrl+C để huỷ)');
});
