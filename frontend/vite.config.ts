import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  // vitest soll den Browser-Build von svelte verwenden (mount statt SSR-Stub)
  resolve: mode === 'test' ? { conditions: ['browser'] } : undefined,
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test-setup.ts'],
  },
}))
