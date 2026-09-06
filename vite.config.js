import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview, mode }) => ({
  // Build output must never contain debug-payment UI, even when .env sets NODE_ENV=development.
  define: { 'import.meta.env.DEBUG_PAYMENT_DEV_SERVER': JSON.stringify(command === 'serve' && !isPreview && mode !== 'production') },
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: Number(process.env.WEB_PORT || 5173),
    allowedHosts: ['.usatit.com', 'localhost'],
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/media': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}))
