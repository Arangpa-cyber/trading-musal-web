// 개발용 예시 데이터 — `npm run dev` 후 주소 끝에 ?preview 를 붙이면 로그인 없이 화면을 본다(배포본엔 안 들어감).
// 실제 거래 데이터가 아니다.
import { DEFAULT_SETTINGS, type Buy, type CashTx, type JournalData, type Sell } from '../core'

const DAY = 86_400_000
const start = new Date(2026, 4, 4, 15, 20).getTime()
let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

function buy(tradeId: string, day: number, asset: string, qty: number, price: number, stop: number, extra: Partial<Buy> = {}): Buy {
  return {
    id: id(), tradeId, date: start + day * DAY, assetName: asset, quantity: qty, unitPrice: price, buyReason: 'breakout',
    targetEntryPrice: price, riskMode: 'totalAssets', riskPercent: 0.5, plannedRiskAmount: 50_000, stopLossPrice: stop,
    initialStopLossPrice: stop, totalAssetsAtEntry: 10_000_000, markPrice: 0, markDate: null, currency: 'KRW',
    fee: Math.floor(qty * price * 0.00015), tax: 0, fallbackRate: 1, ...extra,
  }
}

function sell(b: Buy[], day: number, price: number, extra: Partial<Sell> = {}): Sell {
  return {
    id: id(), tradeId: b[0].tradeId, date: start + day * DAY, assetName: b[0].assetName, quantity: b.reduce((a, x) => a + x.quantity, 0),
    unitPrice: price, sellReasons: price >= b[0].unitPrice ? ['strengthSell'] : ['stopLossHit'], legacyReason: '', reasonNote: '',
    currency: b[0].currency, fee: 0, tax: 0, stopLossAtSell: b[0].stopLossPrice, soldBuyIds: b.map((x) => x.id), ...extra,
  }
}

export function sampleData(): JournalData {
  n = 0
  // ?tier=juhwa — 연패를 덧붙여 주화입마 패널 확인 / ?tier=rich — 입금을 늘려 총자산 조건을 넘긴 모양 / ?tier=both — 둘 다 / ?tier=beomin — 완료 거래 12건(범인).
  // ?order=old — 카드 순서를 예전 방식으로 저장해 둔 계정(새 카드가 어디 붙는지 확인).
  const scenario = new URLSearchParams(window.location.search).get('tier')
  const cash: CashTx[] = [
    { id: id(), date: start - DAY, type: 'deposit', amount: scenario === 'rich' || scenario === 'both' ? 150_000_000 : 20_000_000, memo: '', currency: 'KRW', foreignAmount: 0, direction: null },
    { id: id(), date: start + 30 * DAY, type: 'exchange', amount: 2_720_000, memo: '', currency: 'KRW', foreignAmount: 2000, direction: 'krwToUsd' },
  ]
  const buys: Buy[] = []
  const sells: Sell[] = []
  // 지난 완료 거래 22건 — 승/패 섞어서(경지 삼류 이상이 나오게)
  const results = [12, -4, 18, -5, 7, -3, 25, -6, -4, 9, -5, 15, -3, -6, 11, -4, 20, -5, 8, -3, -7, 14]
  if (scenario === 'juhwa' || scenario === 'both') results.push(...Array(13).fill(-5))
  if (scenario === 'beomin') results.length = 12
  results.forEach((r, i) => {
    const b = buy(`t${i}`, i * 4, ['한미반도체', '알테오젠', 'HD현대일렉트릭', '삼양식품'][i % 4], 10, 100_000, 93_000)
    buys.push(b)
    sells.push(sell([b], i * 4 + 3, 100_000 * (1 + r / 100)))
  })
  // 보유 — 추가 매수 3건 중 1-3을 판 포지션
  // 같은 종목에 비중을 더하면 매수 건(1-1·1-2·1-3)마다 손절가가 따로다.
  const p1 = buy('hold1', 120, '효성중공업', 20, 300_000, 285_000)
  const p2 = buy('hold1', 126, '효성중공업', 10, 330_000, 312_000)
  const p3 = buy('hold1', 131, '효성중공업', 5, 355_000, 337_000)
  p1.markPrice = 361_000
  p1.markDate = start + 168 * DAY
  buys.push(p1, p2, p3)
  sells.push(sell([p3], 140, 349_000))
  // 보유 — 달러 종목
  const u = buy('hold2', 150, 'SPCX', 12, 159.95, 147.2, { currency: 'USD', fallbackRate: 1360, plannedRiskAmount: 40_000, fee: 1.91 })
  buys.push(u)
  // 보유 — 손절폭이 넓은 종목(손절률 주황)
  buys.push(buy('hold3', 160, '레인보우로보틱스', 8, 180_000, 160_000))
  // ?pie=many — 파이 지시선 라벨 확인용(예수금이 크고 소액 종목이 많은 모양, iOS 프리뷰와 같다).
  if (new URLSearchParams(window.location.search).get('pie') === 'many') {
    for (const [i, [name, price]] of ([['META', 60_000], ['SPC삼립', 60_000], ['DELL', 38_000], ['HYPE', 17_000], ['ETH', 11_000], ['XRP', 4_000]] as const).entries()) {
      buys.push(buy(`many${i}`, 170 + i, name, 10, price, price * 0.9))
    }
  }
  return { buys, sells, cash, journals: [], profile: { nickname: '무명 검객', tradingRules: '', createdAt: start }, settings: { ...DEFAULT_SETTINGS, homeCardOrder: new URLSearchParams(window.location.search).get('order') === 'old' ? 'holdings,portfolio,returnDistribution,trend,checklist' : null } }
}
