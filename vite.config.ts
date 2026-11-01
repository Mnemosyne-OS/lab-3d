import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Lab 3D (doc 166). Outside the pnpm workspace like Objets 3D and Atlas: its
// three.js and Spark are installed with npm in this folder.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5243,
    strictPort: true,
    cors: true,
  },
  build: { outDir: 'dist', assetsDir: 'assets', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
} as UserConfig & { test: Record<string, unknown> });
