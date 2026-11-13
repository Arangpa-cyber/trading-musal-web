import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 배포(GitHub Pages)는 https://arangpa-cyber.github.io/trading-musal-web/ 아래에 놓인다.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/trading-musal-web/' : '/',
  // 앱 정보 "버전" — 빌드한 날짜(배포할 때마다 바뀐다).
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
}))
