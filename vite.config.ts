import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: '.',
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      external: [/^node:.+$/],
    },
  },
  test: {
    watch: !process.env.CI,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
