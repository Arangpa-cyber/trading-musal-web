import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 배포(GitHub Pages)는 https://arangpa-cyber.github.io/trading-musal-web/ 아래에 놓인다.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/trading-musal-web/' : '/',
}))
