import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
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
})
