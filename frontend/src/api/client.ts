import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'atech_hrm_token';

/** Đọc/ghi token đăng nhập. localStorage có thể bị chặn nên luôn bọc try/catch. */
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

/** Client HTTP dùng chung cho toàn bộ frontend. */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
  timeout: 15000,
});

// Tự gắn token vào mọi request.
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Gọi khi server báo 401 (token hết hạn / tài khoản bị khoá). */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const isLogin = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLogin) onUnauthorized?.();
    const code = (err.response?.data as { error?: { code?: string } } | undefined)?.error?.code;
    if (code === 'PASSWORD_CHANGE_REQUIRED') window.location.reload();
    return Promise.reject(err);
  },
);

/** Lấy thông báo lỗi tiếng Việt từ response của backend. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: { message?: string } }
      | undefined;
    if (data?.error?.message) return data.error.message;
    if (!err.response) return 'Không kết nối được máy chủ';
  }
  return err instanceof Error ? err.message : 'Đã xảy ra lỗi';
}
