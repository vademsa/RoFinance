import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@platform': path.resolve(__dirname, 'platform.ts') } },
  publicDir: path.resolve(__dirname, '../public'),
  server: {
    host: '127.0.0.1',
    fs: { allow: [
      __dirname,
      path.resolve(__dirname, '../src'),
      path.resolve(__dirname, '../shared'),
      path.resolve(__dirname, '../public'),
      path.resolve(__dirname, '../node_modules'),
    ] },
  },
});
