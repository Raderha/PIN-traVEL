import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const naverMapKeyId = env.VITE_X_NCP_APIGW_API_KEY_ID ?? env['X-NCP-APIGW-API-KEY-ID'] ?? ''

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_X_NCP_APIGW_API_KEY_ID': JSON.stringify(naverMapKeyId),
    },
    server: {
      proxy: {
        '/api': 'http://localhost:4000',
      },
    },
  }
})
