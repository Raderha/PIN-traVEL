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
      /** 같은 Wi‑Fi의 다른 기기에서 dev 서버 접속 허용 */
      host: true,
      proxy: {
        '/api': 'http://127.0.0.1:4000',
        '/socket.io': { target: 'http://127.0.0.1:4000', ws: true },
      },
    },
  }
})
