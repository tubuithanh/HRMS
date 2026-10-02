// Giờ Việt Nam cho chấm công, đi muộn, "hôm nay" — máy chủ cloud mặc định chạy UTC.
process.env.TZ ??= 'Asia/Ho_Chi_Minh';

import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { startScheduler } from './modules/jobs/daily';

const app = createApp();

const server = app.listen(env.PORT, () => {
  // Nhắc việc hằng ngày (khi server đang chạy); test không mở cổng nên không chạy.
  startScheduler();
  console.log(`✅ ATECH HRM API đang chạy tại http://localhost:${env.PORT}`);
  console.log(`   Kiểm tra: http://localhost:${env.PORT}/api/health`);
  console.log(`   Môi trường: ${env.NODE_ENV}`);
});

/** Đóng kết nối gọn gàng khi tắt tiến trình. */
async function shutdown(signal: string) {
  console.log(`\n${signal} nhận được, đang tắt server...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Đã đóng kết nối database. Tạm biệt.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
