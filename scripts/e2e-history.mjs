// 거래내역·수정·메모·삭제 통합 확인 — 개발 서버를 켠 상태에서: node scripts/e2e-history.mjs [스크린샷폴더]
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
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` })
const text = () => page.evaluate(() => document.body.innerText)
const check = (cond, msg) => { if (!cond) throw new Error(`확인 실패: ${msg}`); console.log(`✓ ${msg}`) }
// 스크롤하면 메뉴가 닫히므로(iOS와 같게) 먼저 스크롤하고 잠깐 기다린 뒤 누른다.
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
const typeInto = async (label, value) => {
  await page.$eval(`input[aria-label="${label}"]`, (e) => e.scrollIntoView({ block: 'center' }))
  await page.click(`input[aria-label="${label}"]`, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type(`input[aria-label="${label}"]`, value)
}

await page.goto('http://localhost:5173/?preview#/history', { waitUntil: 'networkidle0' })
check((await text()).includes('실현손익'), '월 머리에 그달 실현손익')
await shot('h1-list')

// 1) 매수 수정 — 레인보우로보틱스 수량 8 → 10
await click('button[aria-label="레인보우로보틱스 매수 메뉴"]')
await click('.menu-item', '수정')
check((await text()).includes('매수 기록 수정'), '매수 수정 화면이 열린다')
await typeInto('수량', '10')
await click('.sheet-bar button', '저장'); await sleep(300)
check((await text()).includes('10주'), '수량 수정이 카드에 반영')

// 2) 메모 — 매수 카드 메뉴 → 메모 → + → 작성 → 저장 → 카드 미리보기
await click('button[aria-label="레인보우로보틱스 매수 메뉴"]')
await click('.menu-item', '메모')
await click('button[aria-label="새 메모"]')
await page.type('textarea[aria-label="메모 내용"]', '돌파 후 거래량 확인하고 진입')
await click('.sheet-bar button', '저장'); await sleep(300)
check((await text()).includes('돌파 후 거래량 확인하고 진입'), '메모 목록에 새 메모')
await click('.sheet-bar button', '닫기'); await sleep(200)
check((await page.$$eval('.memo-preview', (els) => els.map((e) => e.textContent))).some((t) => t.includes('돌파 후 거래량')), '매수 카드에 메모 미리보기')

// 3) 매도 삭제 — 확인 창 → 삭제
const deletedId = await page.$eval('.row-sell', (e) => e.id)
await click('.row-sell')
await click('.menu-item', '삭제')
check((await text()).includes('이 매도 기록을 삭제할까요?'), '삭제 전에 확인 창')
await click('.alert button', '삭제'); await sleep(300)
check(!(await page.$(`#${deletedId}`)), '매도 기록이 지워진다')

// 4) 캘린더
await click('button[aria-label="캘린더 보기"]')
check(!!(await page.$('.calendar')), '캘린더 보기로 바뀐다')
await shot('h2-calendar')
await click('button[aria-label="목록 보기"]')

// 5) 모아보기
await click('button[aria-label="효성중공업 매수 메뉴"]')
await click('.menu-item', '이 종목 모아보기')
check((await text()).includes('피라미딩별'), '자산 상세에 피라미딩별 표')
await shot('h3-asset')
await click('.sheet-bar button', '닫기')

// 6) 현황 — 보유 메모 → 매도 시 확인 시트, 현재가 기록
await page.goto('http://localhost:5173/?preview#/home', { waitUntil: 'networkidle0' })
await click('button[aria-label="SPCX 메뉴"]')
await click('.menu-item', '메모')
await click('button[aria-label="새 메모"]')
await page.type('textarea[aria-label="메모 내용"]', '50일선 깨지면 판다')
await click('.sheet-bar button', '저장'); await sleep(300)
await click('.sheet-bar button', '닫기'); await sleep(200)
await click('button[aria-label="SPCX 메뉴"]')
await click('.menu-item', '매도')
check((await text()).includes('보유 중일 때 남겨둔 생각이 있어요'), '보유 메모가 있으면 매도 전 확인')
await shot('h4-sell-confirm')
await click('.memo-confirm button', '다시 생각해볼게요')
await click('button[aria-label="SPCX 메뉴"]')
await click('.menu-item', '현재가 기록')
await typeInto('현재가', '171.5')
await click('.sheet-bar button', '저장'); await sleep(300)
check((await text()).includes('$171.50'), '현재가 기록이 카드에 반영')

// 7) 메모 → 거래 보기 — 거래내역으로 이동해 그 카드가 강조된다
await click('button[aria-label="SPCX 메뉴"]')
await click('.menu-item', '메모')
await click('button[aria-label="메모 메뉴"]')
await click('.menu-item', '거래 보기'); await sleep(500)
check(page.url().includes('#/history'), '메모 "거래 보기"로 거래내역 탭 이동')
check(!!(await page.$('.flash')), '그 메모가 붙은 카드가 강조된다')
await shot('h5-jump')

// 8) 무한 스크롤 — 최근 3개월(적어도 30건)만, "이전 기록 더 보기"로 더
const rowsBefore = (await page.$$('.history-row')).length
const more = await page.$('.load-more button')
if (more) {
  await click('.load-more button'); await sleep(300)
  check((await page.$$('.history-row')).length > rowsBefore, '"이전 기록 더 보기"로 오래된 기록이 더 나온다')
} else {
  console.log('· 기록이 적어 더 보기 버튼 없음')
}
check(errors.length === 0, `페이지 오류 없음 ${errors.join(' / ')}`)
await browser.close()
