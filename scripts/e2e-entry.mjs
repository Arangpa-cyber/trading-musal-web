// 입력 시트 통합 확인 — 개발 서버(npm run dev)를 켠 상태에서: node scripts/e2e-entry.mjs [스크린샷폴더]
// ?preview(예시 데이터, 메모리 저장)로 입금 → 매수 → 매도를 실제로 입력·저장하고 현황에 반영되는지 본다.
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
await page.goto('http://localhost:5173/?preview#/home', { waitUntil: 'networkidle0' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: false })
const clickText = async (selector, text) => {
  const ok = await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(t))
    if (!el) return false
    el.scrollIntoView({ block: 'center' })
    el.click()
    return true
  }, selector, text)
  if (!ok) throw new Error(`못 찾음: ${selector} "${text}"`)
  await sleep(250)
}
const type = async (label, text) => {
  const el = await page.$(`input[aria-label="${label}"]`)
  if (!el) throw new Error(`칸 못 찾음: ${label}`)
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await el.click({ clickCount: 3 })
  await el.type(text)
}
const bodyText = () => page.evaluate(() => document.body.innerText)
const check = (cond, msg) => { if (!cond) throw new Error(`확인 실패: ${msg}`); console.log(`✓ ${msg}`) }

// 1) 입금 100만
await page.click('button[aria-label="입력"]'); await sleep(300)
await clickText('.segmented button', '예수금')
await type('금액', '1000000')
await shot('e2e-1-deposit')
check((await bodyText()).includes('→'), '예수금 변화 박스에 저장 후 잔액 표시')
await clickText('.save-footer button', '저장'); await sleep(400)
check(!(await page.$('.sheet')), '저장하면 시트가 닫힌다')

// 2) 매수 — 자산명·목표 매수가·손절가 → 손절률 자동, 계산기 1행
await page.click('button[aria-label="입력"]'); await sleep(300)
await type('목표 매수가', '10000')
await page.$eval('input[placeholder="예: 삼성전자, 금ETF, 비트코인"]', (e) => e.scrollIntoView({ block: 'center' }))
await page.type('input[placeholder="예: 삼성전자, 금ETF, 비트코인"]', '테스트전자')
await type('손절가', '9300')
check(await page.$eval('input[aria-label="손절률"]', (e) => e.placeholder) === '7', '손절률이 회색으로 자동 계산(7%)')
await type('1번째 체결 가격', '10000')
await type('1번째 체결 수량', '50')
check(await page.$eval('input[aria-label="1번째 체결 수수료"]', (e) => e.placeholder) === '75', '체결 수수료 자동 계산(0.015% → 75원)')
await shot('e2e-2-buy')
// 쓰던 내용 보호 — 닫기 누르면 묻는다
await clickText('.sheet-bar button', '닫기')
check((await bodyText()).includes('작성 중인 내용을 버릴까요?'), '쓰던 내용이 있으면 닫기 전에 묻는다')
await clickText('.alert button', '계속 작성')
await clickText('.save-footer button', '매수 저장'); await sleep(400)
check((await bodyText()).includes('테스트전자'), '현황 보유 자산에 새 종목이 보인다')
await shot('e2e-3-home-after-buy')

// 3) 매도 — 보유 카드 메뉴 → 매도 → 이유·단가 → 저장
await page.$eval('button[aria-label="테스트전자 메뉴"]', (e) => e.scrollIntoView({ block: 'center' })); await sleep(200)
await page.click('button[aria-label="테스트전자 메뉴"]'); await sleep(250)
await clickText('.menu-item', '매도'); await sleep(300)
await clickText('.check-row', '강세 매도')
await clickText('.check-row', '전량')
await type('단가', '11000')
check((await bodyText()).includes('예상 실현손익'), '매도 미리보기(예상 실현손익)')
await shot('e2e-4-sell')
await clickText('.save-footer button', '매도 저장'); await sleep(400)
check(!(await bodyText()).includes('테스트전자'), '전량 매도하면 보유 자산에서 빠진다')

check(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`)
await browser.close()
