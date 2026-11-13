// 설정·가이드 통합 확인 — 개발 서버를 켠 상태에서: node scripts/e2e-settings.mjs [스크린샷폴더]
import puppeteer from 'puppeteer-core'

const out = process.argv[2] ?? '/tmp'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('lastSeenTier', '1')
  localStorage.setItem('lastSeenJuhwaipmaSeverity', '0')
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => page.evaluate(() => document.body.innerText)
const check = (cond, msg) => { if (!cond) throw new Error(`확인 실패: ${msg}`); console.log(`✓ ${msg}`) }
/** 칸을 비우고 입력(폰 흉내에선 세 번 눌러 전체 선택이 안 된다). */
const fill = async (label, value) => {
  await page.$eval(`input[aria-label="${label}"]`, (e) => e.scrollIntoView({ block: 'center' }))
  await page.focus(`input[aria-label="${label}"]`)
  const len = await page.$eval(`input[aria-label="${label}"]`, (e) => e.value.length)
  await page.keyboard.press('End')
  for (let i = 0; i < len; i++) await page.keyboard.press('Backspace')
  await page.type(`input[aria-label="${label}"]`, value)
}
const click = async (selector, contains) => {
  const found = await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => (t ? e.textContent.includes(t) : true))
    if (!el) return false
    el.scrollIntoView({ block: 'center' })
    return true
  }, selector, contains)
  if (!found) throw new Error(`못 찾음: ${selector} "${contains ?? ''}"`)
  await sleep(150)
  await page.evaluate((sel, t) => [...document.querySelectorAll(sel)].find((e) => (t ? e.textContent.includes(t) : true)).click(), selector, contains)
  await sleep(250)
}

await page.goto('http://localhost:5173/?preview#/settings', { waitUntil: 'networkidle0' })
await page.screenshot({ path: `${out}/s1-settings.png`, fullPage: true })

// 1) 기본 리스크율 1% → 매수 입력 리스크율 칸에 1
// (미리보기는 새로고침하면 처음 데이터로 돌아가므로 같은 페이지 안에서 확인)
await fill('기본 리스크율', '1')
await page.keyboard.press('Enter'); await sleep(300)
await page.evaluate(() => (window.location.hash = '/home')); await sleep(300)
await page.click('button[aria-label="입력"]'); await sleep(300)
check((await page.$eval('input[aria-label="리스크율"]', (e) => e.value)) === '1', '기본 리스크율이 매수 입력에 반영')
await click('.sheet-bar button', '닫기')
await page.evaluate(() => (window.location.hash = '/settings')); await sleep(300)

// 2) 별호 바꾸기
await click('.group-row', '별호')
await fill('별호', '청운검')
await click('.alert button', '저장'); await sleep(300)
check((await text()).includes('청운검'), '별호가 바뀐다')

// 3) 설정 환율 저장
await click('.group-row', '설정 환율')
await page.type('input[aria-label="설정 환율"]', '1400')
await click('.sheet-bar button', '저장'); await sleep(300)
check((await text()).includes('직접 입력'), '설정 환율이 직접 입력값으로 적용')

// 4) 카드 순서 — 확인표를 맨 위로 끌기
await click('.group-row', '현황 카드 순서 바꾸기')
const handle = await page.$('span[aria-label="확인표 옮기기"]')
const box = await handle.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 22)
await page.mouse.up(); await sleep(300)
const first = await page.$eval('.order-row span', (e) => e.textContent)
check(first === '확인표', '카드를 끌어서 맨 위로 옮긴다')
await page.screenshot({ path: `${out}/s2-order.png` })
await click('.sheet-bar button', '닫기')
await page.evaluate(() => (window.location.hash = '/home')); await sleep(400)
const cardTitles = await page.$$eval('.card h2', (els) => els.map((e) => e.textContent))
check(cardTitles[1] === '확인표', '현황 카드 순서에 반영(경지 다음이 확인표)')

// 5) 가이드 검색
await page.evaluate(() => (window.location.hash = '/settings')); await sleep(300)
await click('.group-row', '가이드')
check((await text()).includes('경지 단계별 승급 조건'), '가이드 흐름 설명')
await page.type('input[aria-label="용어 검색"]', '손절가대비'); await sleep(200)
check((await page.$$('.glossary-row')).length >= 1 && !(await text()).includes('이 앱은 무엇인가'), '검색하면 용어만 거른다')
await page.screenshot({ path: `${out}/s3-guide.png` })
check(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`)
await browser.close()
