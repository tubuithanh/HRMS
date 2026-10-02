/* Service worker tối thiểu để cài ứng dụng lên màn hình chính.
   Không lưu dữ liệu ngoại tuyến (dữ liệu nhân sự luôn lấy mới từ máy chủ); chỉ dự phòng trang khi mất mạng. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request).catch(
      () =>
        new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATECH HRM</title><body style="font-family:system-ui;padding:2rem;text-align:center"><h2>Không có kết nối mạng</h2><p>Kiểm tra mạng rồi mở lại ứng dụng.</p></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        ),
    ),
  );
});
