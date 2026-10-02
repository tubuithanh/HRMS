import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api/client';

export type Role = 'ADMIN' | 'HR' | 'ACCOUNTANT' | 'EMPLOYEE';

export interface CurrentUser {
  id: string;
  username: string;
  role: Role;
  personId: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  person?: { id: string; personCode: string; fullName: string } | null;
  /** Phạm vi dữ liệu (đơn vị) — rỗng = toàn công ty. */
  orgScope?: string[];
  scopeOrgs?: Array<{ id: string; name: string }>;
}

interface AuthState {
  user: CurrentUser | null;
  /** true trong lúc đang kiểm tra token đã lưu khi mở trang. */
  loading: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): void;
  /** Đổi mật khẩu: lưu token mới (phiên cũ bị server vô hiệu) và tải lại thông tin. */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  // Có token cũ thì hỏi server xem còn hợp lệ không.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (tokenStore.get()) {
      api
        .get<{ data: CurrentUser }>('/auth/me')
        .then((res) => setUser(res.data.data))
        .catch(() => logout())
        .finally(() => setLoading(false));
    }
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{ data: { token: string } }>('/auth/login', {
      username,
      password,
    });
    tokenStore.set(res.data.data.token);
    const me = await api.get<{ data: CurrentUser }>('/auth/me');
    setUser(me.data.data);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await api.post<{ data: { token: string } }>('/auth/change-password', { currentPassword, newPassword });
    tokenStore.set(res.data.data.token);
    const me = await api.get<{ data: CurrentUser }>('/auth/me');
    setUser(me.data.data);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}

/** Vai trò được sửa dữ liệu từng phân hệ — khớp với backend/src/routes.ts. */
const writers = {
  corehr: ['ADMIN', 'HR'],
  leave: ['ADMIN', 'HR'],
  attendance: ['ADMIN', 'HR'],
  recruitment: ['ADMIN', 'HR'],
  payroll: ['ADMIN', 'ACCOUNTANT'],
} satisfies Record<string, Role[]>;

export function useCanWrite(area: keyof typeof writers): boolean {
  const { user } = useAuth();
  return !!user && (writers[area] as Role[]).includes(user.role);
}

export const roleLabels: Record<Role, string> = {
  ADMIN: 'Quản trị',
  HR: 'Nhân sự',
  ACCOUNTANT: 'Kế toán',
  EMPLOYEE: 'Nhân viên',
};
