import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeEnv: Record<string, unknown> = {};
vi.mock('../config/env', () => ({ env: fakeEnv }));

async function load(env: Record<string, unknown>) {
  for (const k of Object.keys(fakeEnv)) delete fakeEnv[k];
  Object.assign(fakeEnv, { SMTP_PORT: 587, SMTP_FROM: 'ATECH HRM <no-reply@atech.local>', GMAIL_SEND_VIA: 'smtp' }, env);
  vi.resetModules();
  return import('./mailer');
}

const gmail = { GMAIL_USER: 'hr@gmail.com', GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 'secret', GMAIL_REFRESH_TOKEN: 'rt' };

describe('chọn cách gửi email', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('chưa cấu hình → chỉ ghi log', async () => {
    const m = await load({});
    expect(m.mailMode()).toBe('log');
  });
  it('SMTP thường', async () => {
    const m = await load({ SMTP_HOST: 'smtp.example.com' });
    expect(m.mailMode()).toBe('smtp');
    expect(m.mailFrom()).toBe('ATECH HRM <no-reply@atech.local>');
  });
  it('Gmail OAuth2 ưu tiên hơn SMTP; người gửi là địa chỉ Gmail, giữ tên hiển thị', async () => {
    const m = await load({ SMTP_HOST: 'smtp.example.com', ...gmail });
    expect(m.mailMode()).toBe('gmail-smtp');
    expect(m.mailFrom()).toBe('"ATECH HRM" <hr@gmail.com>');
  });
  it('thiếu một biến Gmail → không dùng Gmail', async () => {
    const m = await load({ ...gmail, GMAIL_REFRESH_TOKEN: undefined });
    expect(m.mailMode()).toBe('log');
  });
  it('GMAIL_SEND_VIA=api → Gmail API', async () => {
    const m = await load({ ...gmail, GMAIL_SEND_VIA: 'api' });
    expect(m.mailMode()).toBe('gmail-api');
  });
});

describe('Gmail API', () => {
  it('dựng thư MIME UTF-8, mã base64url, tiêu đề có dấu được mã hoá', async () => {
    const m = await load(gmail);
    const raw = await m.buildRawMessage({ from: '"ATECH HRM" <hr@gmail.com>', to: 'a@b.vn', subject: 'Nhắc việc hôm nay', text: 'Xin chào Đào' });
    expect(raw).not.toMatch(/[+/=]/);
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toMatch(/^Subject: =\?UTF-8\?/m);
    expect(mime).toMatch(/^To: a@b\.vn$/m);
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8');
  });

  it('đổi refresh token lấy access token, lưu tạm; refresh token hỏng → thông báo rõ', async () => {
    const m = await load({ ...gmail, GMAIL_SEND_VIA: 'api' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'AT1', expires_in: 3600 }), { status: 200 }));
    expect(await m.gmailAccessToken()).toBe('AT1');
    expect(await m.gmailAccessToken()).toBe('AT1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=rt');

    const m2 = await load({ ...gmail, GMAIL_SEND_VIA: 'api' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    await expect(m2.gmailAccessToken()).rejects.toThrow(/npm run gmail:token/);
  });

  it('gửi: gọi Gmail API với access token và thư đã mã hoá; lỗi API → ném lỗi', async () => {
    const m = await load({ ...gmail, GMAIL_SEND_VIA: 'api' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'AT2', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'msg1' }), { status: 200 }));
    await expect(m.sendMailOrThrow('a@b.vn', 'Thử', 'Nội dung')).resolves.toEqual({ mode: 'gmail-api' });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer AT2');
    expect(JSON.parse(String(init.body)).raw).toBeTruthy();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Insufficient Permission' } }), { status: 403 }));
    await expect(m.sendMailOrThrow('a@b.vn', 'Thử', 'x')).rejects.toThrow(/403.*Insufficient Permission/);
    // sendMail không ném lỗi
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(m.sendMail('a@b.vn', 'Thử', 'x')).resolves.toBeUndefined();
  });
});
