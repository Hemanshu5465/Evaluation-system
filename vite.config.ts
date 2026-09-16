import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // In dev the frontend talks to the backend through this same-origin proxy,
  // which avoids cross-origin connection quirks (CORS preflights, HTTP/2 coalescing).
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'
  return {
    plugins: [react()],
    resolve: { alias: { '@': srcDir } },
    server: {
      port: 5173,
      open: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
