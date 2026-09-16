import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// 外部 CDN・フォント・解析ツールを一切使わない構成。
// すべてのアセットはバンドルしてローカルサーバーから配信する。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: {
      // shared/ はクライアントルート外にあるため明示的に許可する
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
