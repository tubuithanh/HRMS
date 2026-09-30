import { AsyncLocalStorage } from 'async_hooks';

/** Một thay đổi dữ liệu chờ ghi vào nhật ký khi request kết thúc thành công. */
export interface PendingChange {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'CREATE_MANY' | 'UPDATE_MANY' | 'DELETE_MANY';
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  summary?: string;
}

/**
 * Ngữ cảnh của request hiện tại (người dùng, IP) — truyền ngầm qua mọi hàm
 * async bằng AsyncLocalStorage, để lớp dữ liệu biết "ai" đang thay đổi.
 */
export interface RequestContext {
  requestId: string;
  userId: string | null;
  username: string | null;
  ip: string | null;
  changes: PendingChange[];
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const currentContext = () => requestContext.getStore();
