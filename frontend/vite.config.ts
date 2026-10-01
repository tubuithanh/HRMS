import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Render (và các host khác) chạy `vite preview` trên cổng $PORT với tên miền riêng
// → phải lắng nghe 0.0.0.0 và cho phép tên miền *.onrender.com.
const port = Number(process.env.PORT) || undefined;

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: {
    host: true,
    port: port ?? 4173,
    allowedHosts: ['.onrender.com'],
  },
});
