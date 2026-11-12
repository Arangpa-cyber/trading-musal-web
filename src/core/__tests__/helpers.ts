// 테스트용 기록 팩토리 — iOS CoreServiceTests의 makeBuy/makeSell/makeCash와 같은 기본값.
import type { RatedBuy, RatedSell } from '../records'
import type { CashTx, CashTxType, ExchangeDirection, JournalEntry, Millis } from '../types'

export const DAY = 86_400_000
export const day = (n: number): Millis => n * DAY

/** 부동소수 근사 비교(iOS `close`와 같은 허용치). */
export function close(a: number | null | undefined, b: number, tol = 0.0001): boolean {
  return a !== null && a !== undefined && Math.abs(a - b) < tol
}

export function makeBuy(o: {
  tradeId: string
  date?: Millis
  asset?: string
  qty: number
  price: number
  stopLoss?: number
  fee?: number
  tax?: number
  currency?: 'KRW' | 'USD'
  rate?: number
  riskMode?: 'totalAssets' | 'profitCushion'
  riskPercent?: number
  plannedRisk?: number
  totalAssets?: number
}): RatedBuy {
  const stop = o.stopLoss ?? o.price * 0.9
  return {
    id: crypto.randomUUID(),
    tradeId: o.tradeId,
    date: o.date ?? 0,
    assetName: o.asset ?? '종목',
    quantity: o.qty,
    unitPrice: o.price,
    buyReason: 'breakout',
    targetEntryPrice: o.price,
    riskMode: o.riskMode ?? 'totalAssets',
    riskPercent: o.riskPercent ?? 1,
    plannedRiskAmount: o.plannedRisk ?? 0,
    stopLossPrice: stop,
    initialStopLossPrice: stop,
    totalAssetsAtEntry: o.totalAssets ?? 0,
    markPrice: 0,
    markDate: null,
    currency: o.currency ?? 'KRW',
    fee: o.fee ?? 0,
    tax: o.tax ?? 0,
    fallbackRate: o.rate ?? 1,
    rate: o.rate ?? 1,
  }
}

export function makeSell(o: {
  tradeId: string
  date?: Millis
  asset?: string
  qty: number
  price: number
  fee?: number
  tax?: number
  currency?: 'KRW' | 'USD'
  rate?: number
  stopAtSell?: number
  lots?: { id: string }[]
}): RatedSell {
  return {
    id: crypto.randomUUID(),
    tradeId: o.tradeId,
    date: o.date ?? 0,
    assetName: o.asset ?? '종목',
    quantity: o.qty,
    unitPrice: o.price,
    sellReasons: ['strengthSell'],
    legacyReason: '',
    reasonNote: '',
    currency: o.currency ?? 'KRW',
    fee: o.fee ?? 0,
    tax: o.tax ?? 0,
    stopLossAtSell: o.stopAtSell ?? 0,
    soldBuyIds: (o.lots ?? []).map((l) => l.id),
    rate: o.rate ?? 1,
  }
}

/** 매수들을 다 파는 매도(판 매수 지정). */
export function lotSell(lots: RatedBuy[], price: number, date: Millis, tradeId = 'p'): RatedSell {
  return makeSell({ tradeId, date, qty: lots.reduce((a, l) => a + l.quantity, 0), price, lots })
}

export function makeCash(type: CashTxType, amount: number, date: Millis = 0): CashTx {
  return { id: crypto.randomUUID(), date, type, amount, memo: '', currency: 'KRW', foreignAmount: 0, direction: null }
}

export function exchange(krw: number, usd: number, date: Millis = 0, direction: ExchangeDirection = 'krwToUsd'): CashTx {
  return { id: crypto.randomUUID(), date, type: 'exchange', amount: krw, memo: '', currency: 'KRW', foreignAmount: usd, direction }
}

export function makeMemo(tradeId: string, date: Millis, text: string, context: JournalEntry['context'] = 'holding'): JournalEntry {
  return { id: crypto.randomUUID(), tradeId, assetName: '종목', date, text, context }
}

/** 그 시각의 기기(서울) 시간 — 테스트는 TZ=Asia/Seoul로 돈다. */
export const local = (y: number, m: number, d: number, h = 0, min = 0): Millis => new Date(y, m - 1, d, h, min).getTime()
