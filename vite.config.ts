import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  build: {
    target: 'esnext',
    minify: true,
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^node:.+$/],
    },
  },
  test: {
    watch: !process.env.CI,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
