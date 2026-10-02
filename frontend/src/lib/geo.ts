/** Lấy toạ độ GPS hiện tại (để chấm công giới hạn vị trí). Báo lỗi tiếng Việt nếu bị từ chối / hết giờ. */
export function getPosition(timeoutMs = 10_000): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Trình duyệt không hỗ trợ định vị'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? 'Bạn chưa cho phép truy cập vị trí — bật quyền vị trí cho trang này rồi thử lại'
              : 'Không lấy được vị trí — kiểm tra GPS / mạng rồi thử lại',
          ),
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
