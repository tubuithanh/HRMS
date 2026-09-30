import { DependencyList, useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';

/**
 * Gọi GET khi mount / khi deps đổi. Trả về { data, error, loading, reload }.
 * path = null thì không gọi (chờ đủ tham số).
 */
export function useFetch<T>(path: string | null, deps: DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<{ data: T }>(path)
      .then((res) => !cancelled && setData(res.data.data))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Tải file (PDF, Excel) có kèm token đăng nhập. */
export async function downloadFile(path: string, fallbackName: string) {
  let res;
  try {
    res = await api.get(path, { responseType: 'blob' });
  } catch (err) {
    // Lỗi trả về dạng Blob: đọc JSON bên trong để lấy thông báo tiếng Việt.
    const data = (err as { response?: { data?: unknown } }).response?.data;
    if (data instanceof Blob) {
      try {
        const body = JSON.parse(await data.text());
        if (body?.error?.message) throw new Error(body.error.message);
      } catch (inner) {
        if (inner instanceof Error && !(inner instanceof SyntaxError)) throw inner;
      }
    }
    throw err;
  }
  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition && /filename="?([^"]+)"?/.exec(disposition);
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
