// 화면 확인용 스크린샷 — 개발 서버(npm run dev)를 켠 상태에서:
//   node scripts/shot.mjs "#/home" /tmp/home.png [폭=390] [높이=844] [전체=1]
// ?preview(예시 데이터, 로그인 없음)로 연다. 폭 700 미만은 폰 흉내(터치·모바일 뷰포트).
// 이 Mac의 Chrome을 쓴다(headless Chrome 창은 최소 폭이 있어 --window-size로는 폰 폭이 안 나온다).
import puppeteer from 'puppeteer-core'

const [, , hash = '#/home', out = '/tmp/shot.png', width = '390', height = '844', full = '1'] = process.argv
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: +width, height: +height, deviceScaleFactor: 2, isMobile: +width < 700, hasTouch: +width < 700 })
// 경지 알림이 화면을 가리지 않게 — 지금 상태를 이미 본 것으로.
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('lastSeenTier', '1')
  localStorage.setItem('lastSeenJuhwaipmaSeverity', '0')
})
await page.goto(`http://localhost:5173/?preview${hash}`, { waitUntil: 'networkidle0' })
await page.screenshot({ path: out, fullPage: full === '1' })
await browser.close()
