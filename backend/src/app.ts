import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './common/middleware/errorHandler';
import { notFound } from './common/middleware/notFound';
import { auditContext } from './common/audit/audit';

/**
 * Cấu hình ứng dụng Express. Tách khỏi server.ts để có thể import
 * `app` trong test mà không cần mở cổng mạng.
 */
export function createApp() {
  const app = express();

  // Bảo mật header HTTP cơ bản
  app.use(helmet());

  // Cho phép frontend gọi API
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

  // Đọc body JSON
  app.use(express.json({ limit: '10mb' }));

  // Ngữ cảnh nhật ký thao tác (ai, IP) cho mọi request
  app.use(auditContext);

  // Tất cả API nằm dưới tiền tố /api
  app.use('/api', routes);

  // Route không khớp
  app.use(notFound);

  // Xử lý lỗi tập trung (phải đặt cuối cùng)
  app.use(errorHandler);

  return app;
}
