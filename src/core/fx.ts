// 달러 장부 — 원화·달러 이중통화의 중심. 달러 기록을 날짜순으로 재생해 평균 매입 환율을 구하고,
// 달러 매수·매도의 원가 환율을 정한다(`resolveRates`). 이 환율로 원화 금액을 만든다.
import { TradePosition, groupBy } from './position'
import {
  buyCostNative,
  cashDelta,
  impliedExchangeRate,
  isForeign,
  sellCashInflow,
  sellNetNative,
  buyCashOutflow,
  type RatedBuy,
  type RatedSell,
} from './records'
import type { Buy, CashTx, Currency, Millis, Sell } from './types'

const EPS = 1e-9

/** 달러 예수금 장부 — 달러와 그 원화 원가를 같이 굴려 평균 매입 환율을 구한다(이동평균). */
export class UsdBook {
  usd = 0
  krw = 0
  /** 잔액이 0 이하일 때 쓸 마지막 평균 환율. */
  lastRate: number | null = null

  get averageRate(): number | null {
    return this.usd > EPS ? this.krw / this.usd : this.lastRate
  }

  /** 원가를 아는 달러 유입. */
  deposit(amount: number, cost: number): void {
    if (amount <= 0) return
    if (this.usd <= EPS) {
      // 잔액이 없거나 마이너스였으면(달러가 모자란 채 매수) 이번 유입 환율로 다시 시작한다.
      this.usd += amount
      this.krw = this.usd * (cost / amount)
    } else {
      this.usd += amount
      this.krw += cost
    }
    this.lastRate = this.averageRate
  }

  /** 원가를 모르는 달러 유입(배당 등) — 지금 평균 환율로 들인다. */
  depositAtAverage(amount: number): void {
    this.deposit(amount, amount * (this.averageRate ?? 0))
  }

  /** 달러 유출 — 평균 환율로 뺀 원화 원가를 돌려준다. */
  withdraw(amount: number): number {
    if (amount <= 0) return 0
    const rate = this.averageRate ?? 0
    this.usd -= amount
    this.krw -= amount * rate
    if (Math.abs(this.usd) <= EPS) {
      this.usd = 0
      this.krw = 0
    }
    this.lastRate = rate > 0 ? rate : this.lastRate
    return amount * rate
  }
}

type FxEvent<B, S> =
  | { kind: 'cash'; date: Millis; tx: CashTx }
  | { kind: 'buy'; date: Millis; buy: B }
  | { kind: 'sell'; date: Millis; sell: S }

/** 같은 시각은 달러 유입 → 매수 → 매도 → 달러 유출(원화 환전 등). */
function priority<B, S>(e: FxEvent<B, S>): number {
  if (e.kind === 'cash') return cashDelta(e.tx).usd >= 0 ? 0 : 3
  return e.kind === 'buy' ? 1 : 2
}

/** 달러가 움직이는 기록만 날짜순으로. */
function fxEvents<B extends { date: Millis; currency: Currency }, S extends { date: Millis; currency: Currency }>(
  buys: B[],
  sells: S[],
  cash: CashTx[],
): FxEvent<B, S>[] {
  const all: FxEvent<B, S>[] = [
    ...cash.filter((t) => Math.abs(cashDelta(t).usd) > 0).map((tx) => ({ kind: 'cash' as const, date: tx.date, tx })),
    ...buys.filter(isForeign).map((buy) => ({ kind: 'buy' as const, date: buy.date, buy })),
    ...sells.filter(isForeign).map((sell) => ({ kind: 'sell' as const, date: sell.date, sell })),
  ]
  return all
    .map((e, offset) => ({ e, offset }))
    .sort((a, b) => {
      if (a.e.date !== b.e.date) return a.e.date - b.e.date
      const pa = priority(a.e)
      const pb = priority(b.e)
      if (pa !== pb) return pa - pb
      return a.offset - b.offset
    })
    .map((x) => x.e)
}

/** 예수금 기록을 달러 장부에 반영 — 원화→달러 환전은 보낸 원화로, 다른 유입은 평균 환율로. 유출이면 원가를 돌려준다. */
function applyCash(book: UsdBook, tx: CashTx): number | null {
  const usd = cashDelta(tx).usd
  if (tx.type === 'exchange' && tx.direction === 'krwToUsd') {
    book.deposit(usd, tx.amount)
  } else if (usd > 0) {
    book.depositAtAverage(usd)
  } else {
    return book.withdraw(-usd)
  }
  return null
}

/**
 * 기록에 원가 환율을 붙인다(저장하지 않는 값). iOS `FxLedger.normalize`와 같은 규칙:
 * - 달러 매수 = 그 시점 달러 평균 매입 환율(갖고 있던 달러로 샀으니 원가도 그 환율) — 달러 예수금이 없었으면 `fallbackRate`.
 * - 달러 매도 = 그 포지션의 원가 환율 → 매도 시점 환차손익 0. 환율 변동은 원화로 환전할 때 확정된다.
 * 날짜순으로 한 건씩 정하므로 과거 기록을 끼워 넣어도 다시 계산하면 맞춰진다.
 */
export function resolveRates(buys: Buy[], sells: Sell[], cash: CashTx[]): { buys: RatedBuy[]; sells: RatedSell[] } {
  const ratedBuys: RatedBuy[] = buys.map((b) => ({ ...b, rate: isForeign(b) ? b.fallbackRate : 1 }))
  const ratedSells: RatedSell[] = sells.map((s) => ({ ...s, rate: 1 }))
  const buysByTrade = groupBy(ratedBuys, (b) => b.tradeId)
  const sellsByTrade = groupBy(ratedSells, (s) => s.tradeId)
  const book = new UsdBook()

  for (const event of fxEvents(ratedBuys, ratedSells, cash)) {
    if (event.kind === 'cash') {
      applyCash(book, event.tx)
    } else if (event.kind === 'buy') {
      const rate = book.averageRate
      if (rate !== null && rate > 0) event.buy.rate = rate
      book.withdraw(buyCostNative(event.buy))
    } else {
      const sell = event.sell
      const position = new TradePosition(
        sell.tradeId,
        sell.assetName,
        buysByTrade.get(sell.tradeId) ?? [],
        sellsByTrade.get(sell.tradeId) ?? [],
      )
      const rate = position.costRateFor(sell)
      if (rate > 0) sell.rate = rate
      const net = sellNetNative(sell)
      book.deposit(net, net * sell.rate)
    }
  }
  return { buys: ratedBuys, sells: ratedSells }
}

export interface FxReplay {
  book: UsdBook
  /** 기록 id → 이 기록이 달러 장부가(원화)를 바꾼 양 — 자산 추이에 쓴다. */
  bookDeltas: Map<string, number>
  /** 달러→원화 환전 id → 확정 환차손익(원). */
  exchangeFx: Map<string, number>
}

/** 환율이 붙은 기록으로 달러 장부를 재생(읽기 전용). */
export function replayFx(buys: RatedBuy[], sells: RatedSell[], cash: CashTx[]): FxReplay {
  const r: FxReplay = { book: new UsdBook(), bookDeltas: new Map(), exchangeFx: new Map() }
  for (const event of fxEvents(buys, sells, cash)) {
    const before = r.book.krw
    if (event.kind === 'cash') {
      const cost = applyCash(r.book, event.tx)
      if (cost !== null && event.tx.type === 'exchange') r.exchangeFx.set(event.tx.id, event.tx.amount - cost)
      r.bookDeltas.set(event.tx.id, r.book.krw - before)
    } else if (event.kind === 'buy') {
      r.book.withdraw(buyCashOutflow(event.buy).usd)
      r.bookDeltas.set(event.buy.id, r.book.krw - before)
    } else {
      const s = event.sell
      r.book.deposit(sellCashInflow(s).usd, sellNetNative(s) * s.rate)
      r.bookDeltas.set(s.id, r.book.krw - before)
    }
  }
  return r
}

/** 원화·달러 예수금 — 모든 화면이 `cashBalances` 하나로 같은 값을 쓴다. */
export class CashBalances {
  krw = 0
  usd = 0
  /** 달러 예수금의 원화 장부가 = 달러 × 평균 매입 환율. 총자산엔 이 값이 들어간다. */
  usdBookKRW = 0
  /** 달러→원화 환전으로 확정된 환차손익 누적(원). */
  realizedFx = 0

  /** 원화 장부 합계 = 원화 예수금 + 달러 예수금 장부가. */
  get totalKRW(): number {
    return this.krw + this.usdBookKRW
  }

  /** 달러 평균 매입 환율. 달러 잔액이 없으면 null. */
  get usdAverageRate(): number | null {
    return this.usd > EPS ? this.usdBookKRW / this.usd : null
  }

  /** 미실현 환차 = 달러 예수금을 지금 환율로 바꾼다면 생길 환차손익(참고값, 총자산 미반영). */
  unrealizedFx(rate: number | null | undefined): number | null {
    if (!rate || rate <= 0 || Math.abs(this.usd) <= EPS) return null
    return this.usd * rate - this.usdBookKRW
  }
}

/** 예수금 기록 + 매수 유출 + 매도 유입(수수료·거래세 반영). 장부가·확정 환차는 달러 장부 재생. */
export function cashBalances(cash: CashTx[], buys: RatedBuy[], sells: RatedSell[]): CashBalances {
  const result = new CashBalances()
  for (const tx of cash) {
    const d = cashDelta(tx)
    result.krw += d.krw
    result.usd += d.usd
  }
  for (const b of buys) {
    const d = buyCashOutflow(b)
    result.krw -= d.krw
    result.usd -= d.usd
  }
  for (const s of sells) {
    const d = sellCashInflow(s)
    result.krw += d.krw
    result.usd += d.usd
  }
  const ledger = replayFx(buys, sells, cash)
  result.usdBookKRW = ledger.book.krw
  result.realizedFx = [...ledger.exchangeFx.values()].reduce((a, x) => a + x, 0)
  return result
}

// MARK: 설정 환율

export interface ResolvedFxRate {
  rate: number
  date: Millis
  source: 'manual' | 'auto'
}

/** 마지막 환전 기록의 환율과 날짜. */
export function lastExchangeRate(cash: CashTx[]): { rate: number; date: Millis } | null {
  let best: { rate: number; date: Millis } | null = null
  for (const tx of cash) {
    const rate = impliedExchangeRate(tx)
    if (rate !== null && (best === null || tx.date > best.date)) best = { rate, date: tx.date }
  }
  return best
}

/**
 * 설정 환율 — 수동 입력값과 마지막 환전 환율 중 더 최근 것. 지금 시장 환율의 참고값이라 총자산엔 안 들어가고
 * 미실현 환차와 달러 잔액이 없을 때의 달러 매수 계획 환산에만 쓴다.
 */
export function resolveFxRate(cash: CashTx[], manualRate: number, manualDate: Millis): ResolvedFxRate | null {
  const auto = lastExchangeRate(cash)
  const manual = manualRate > 0 ? { rate: manualRate, date: manualDate } : null
  if (manual && auto) {
    return manual.date >= auto.date ? { ...manual, source: 'manual' } : { ...auto, source: 'auto' }
  }
  if (manual) return { ...manual, source: 'manual' }
  if (auto) return { ...auto, source: 'auto' }
  return null
}

/** 매수 수수료 자동 계산 — 체결금액 × 수수료율. 원화는 1원, 달러는 1센트 미만을 버린다. */
export function feeFor(amount: number, ratePercent: number, currency: Currency): number {
  const raw = (amount * ratePercent) / 100
  const unit = currency === 'USD' ? 100 : 1
  return Math.floor(raw * unit + 1e-9) / unit
}
