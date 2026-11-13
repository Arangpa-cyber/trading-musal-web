// 포지션(거래) — 매수·매도 기록을 tradeId로 묶어 그때그때 계산하는 값. 저장하지 않는다.
import { calendarDays, isLaterDay, isSameDay, tradingDays } from './dates'
import {
  buyAmountKRW,
  buyCostKRW,
  buyCostNative,
  sellAmountKRW,
  sellNetNative,
  type RatedBuy,
  type RatedSell,
} from './records'
import type { Currency, Millis } from './types'

/** iOS UUID 정렬과 같게 — 대문자 문자열 비교. */
export const idKey = (id: string): string => id.toUpperCase()

// MARK: - 이동평균 원가 장부

/** 원가 풀 — 수량과 그 원가를 네 가지 기준으로 같이 들고 다닌다(매도 때 같은 비율로 떼어낸다). */
class CostPool {
  qty = 0
  /** 원화 체결금액(수수료 제외) — 평단·보유 원가·총자산 */
  amount = 0
  /** 거래 통화 체결금액(수수료 제외) — 네이티브 평단 */
  native = 0
  /** 원화 매수원가(수수료·거래세 포함) — 손익 분해 */
  cost = 0
  /** 거래 통화 매수원가(수수료·거래세 포함) — 손익 분해 */
  nativeCost = 0

  /** 매수 실효 환율(원화 원가 ÷ 거래 통화 원가, 수수료 포함). 원화는 1. */
  get costRate(): number {
    return this.nativeCost > 0 ? this.cost / this.nativeCost : 1
  }

  add(b: RatedBuy): void {
    this.qty += b.quantity
    this.amount += buyAmountKRW(b)
    this.native += b.unitPrice * b.quantity
    this.cost += buyCostKRW(b)
    this.nativeCost += buyCostNative(b)
  }

  /** `quantity`만큼을 수량 비율로 떼어낸 풀. */
  slice(quantity: number): CostPool {
    const part = new CostPool()
    if (this.qty <= 0) return part
    const f = quantity / this.qty
    part.qty = quantity
    part.amount = this.amount * f
    part.native = this.native * f
    part.cost = this.cost * f
    part.nativeCost = this.nativeCost * f
    return part
  }

  remove(part: CostPool): void {
    this.qty -= part.qty
    this.amount -= part.amount
    this.native -= part.native
    this.cost -= part.cost
    this.nativeCost -= part.nativeCost
  }
}

/**
 * 매수·매도를 날짜순으로 재생한 원가 장부(증권사 이동평균법). 매도 원가는 그 시점까지 산 것만으로 정해지고
 * 부분 매도는 남은 평단을 바꾸지 않는다. 같은 시각이면 매수 먼저. 보유량보다 많이 판 매도가 나오면
 * (날짜가 꼬인 기록) 전체 매수 평균으로 배분한다.
 */
class CostLedger {
  all = new CostPool()
  remaining = new CostPool()
  perSell = new Map<string, CostPool>()
  /** 매수·매도 직후 보유 원가(원) — 카드 비중 */
  holdingAfter = new Map<string, number>()
  /** 매도 직전 보유 원가(원) */
  holdingBeforeSell = new Map<string, number>()
  /** 추가 매수 직전 보유분 네이티브 평단 — 물타기 판정 */
  nativeAverageBeforeBuy = new Map<string, number>()

  constructor(buys: RatedBuy[], sells: RatedSell[]) {
    buys.forEach((b) => this.all.add(b))
    type Event = { date: Millis; buy?: RatedBuy; sell?: RatedSell; offset: number }
    const events: Event[] = [
      ...buys.map((b) => ({ date: b.date, buy: b })),
      ...sells.map((s) => ({ date: s.date, sell: s })),
    ].map((e, offset) => ({ ...e, offset }))
    events.sort((a, b) => {
      if (a.date !== b.date) return a.date - b.date
      if (!!a.buy !== !!b.buy) return a.buy ? -1 : 1
      return a.offset - b.offset
    })

    const pool = new CostPool()
    const slices = new Map<string, CostPool>()
    const after = new Map<string, number>()
    const beforeSell = new Map<string, number>()
    for (const event of events) {
      if (event.buy) {
        const buy = event.buy
        if (pool.qty > 0) this.nativeAverageBeforeBuy.set(buy.id, pool.native / pool.qty)
        pool.add(buy)
        after.set(buy.id, pool.amount)
      } else if (event.sell) {
        const sell = event.sell
        if (sell.quantity > pool.qty) {
          this.useAverage(sells) // 시점별 보유 원가도 알 수 없으니 비워 둔다
          return
        }
        beforeSell.set(sell.id, pool.amount)
        const part = pool.slice(sell.quantity)
        pool.remove(part)
        slices.set(sell.id, part)
        after.set(sell.id, Math.max(pool.amount, 0))
      }
    }
    this.remaining = pool
    this.perSell = slices
    this.holdingAfter = after
    this.holdingBeforeSell = beforeSell
  }

  /** 재생할 수 없는 기록 — 전체 매수 평균으로 수량 비율 배분. */
  private useAverage(sells: RatedSell[]): void {
    this.perSell = new Map()
    for (const s of sells) if (!this.perSell.has(s.id)) this.perSell.set(s.id, this.all.slice(s.quantity))
    const sold = sells.reduce((acc, s) => acc + s.quantity, 0)
    this.remaining = this.all.slice(Math.max(this.all.qty - sold, 0))
  }
}

// MARK: - 완료 거래 1건

/**
 * 완료 거래 1건 = 팔린 매수 하나(N-1·N-2…) — 경지·주화입마·확인표·수익분포·통산 승률이 모두 이 단위로 센다.
 * 수익률은 그 매수 자기 매수가 기준(거래 통화, 수수료 미반영). 옛 기록 포지션 1건이면 `lotLabel`이 null.
 */
export interface TradeOutcome {
  id: string
  tradeId: string
  assetName: string
  lotLabel: string | null
  buyDate: Millis
  closeDate: Millis
  /** 같은 매도로 같이 팔린 매수는 같은 키 — 경지 연속 횟수는 매도 1회당 한 번만 센다. */
  stepKey: string
  /** 이 거래를 끝낸 매도 기록 id(옛 기록 포지션 1건이면 마지막 매도) — 화면에서 그 매도 카드로 이동. */
  sellId: string
  /** 같은 시각 정렬용(N-1 = 0, N-2 = 1…). */
  order: number
  returnPercent: number
  /** 매매손익(원, 환율 변동 제외) — 주화입마 기대손익. */
  tradingProfit: number
  /** 손절가대비(%) — 그 매수를 판 매도 기준. */
  stopGap: number | null
}

export const outcomeIsWin = (o: TradeOutcome): boolean => o.returnPercent > 0
export const outcomeHoldDays = (o: TradeOutcome): number => tradingDays(o.buyDate, o.closeDate)

/** 시간순(매도 시각 → 같은 매도끼리 → 매수 순). 같은 기록이면 항상 같은 순서. */
export function chronological(outcomes: TradeOutcome[]): TradeOutcome[] {
  return [...outcomes].sort((a, b) => {
    if (a.closeDate !== b.closeDate) return a.closeDate - b.closeDate
    if (a.stepKey !== b.stepKey) return a.stepKey < b.stepKey ? -1 : 1
    return a.order - b.order
  })
}

export interface PnlSplit {
  trading: number
  fx: number
}

/** 손절가보다 이만큼(%) 넘게 아래에서 팔리면 주황(⑧). 표시 반올림 0.05%p는 봐준다. */
export const STOP_SLIPPAGE_WARN_PERCENT = 1.0
/** 현재가가 낡았나 — 기록한 지 이 일수 넘음(⑥). */
export const MARK_STALE_DAYS = 7
/** 현황 보유 알약 주황 — 보유 50거래일 초과(⑪). */
export const LONG_HOLD_WARN_DAYS = 50

/** 손절가대비(%) = (매도가 − 손절가) ÷ 손절가 — 둘 다 거래 통화. 손절가가 없으면 null. */
export function stopGapPercent(sellPrice: number, stop: number): number | null {
  return stop > 0 ? ((sellPrice - stop) / stop) * 100 : null
}

export function stopGapWarns(gap: number | null): boolean {
  return (gap ?? 0) < -STOP_SLIPPAGE_WARN_PERCENT - 0.05
}

/** 비중이 최대 비중 한도(0 = 끔)를 넘었나(④). */
export function exceedsMaxWeight(weight: number | null, limit: number): boolean {
  if (weight === null || limit <= 0) return false
  return weight > limit
}

// MARK: - 포지션

export class TradePosition {
  readonly id: string
  readonly assetName: string
  readonly buys: RatedBuy[]
  readonly sells: RatedSell[]
  /** 이 종목(자산명)에 몇 번째로 들어간 거래인지(1부터) — 매수 이름 "N-n"의 N. `aggregate`가 정한다. */
  readonly entryNumber: number
  private readonly ledger: CostLedger

  constructor(id: string, assetName: string, buys: RatedBuy[], sells: RatedSell[], entryNumber = 1) {
    this.id = id
    this.assetName = assetName
    this.buys = buys
    this.sells = sells
    this.entryNumber = entryNumber
    this.ledger = new CostLedger(buys, sells)
  }

  get totalBuyAmount(): number {
    return this.buys.reduce((a, b) => a + buyAmountKRW(b), 0)
  }
  get totalSellAmount(): number {
    return this.sells.reduce((a, s) => a + sellAmountKRW(s), 0)
  }
  get totalBuyQuantity(): number {
    return this.buys.reduce((a, b) => a + b.quantity, 0)
  }
  get totalSellQuantity(): number {
    return this.sells.reduce((a, s) => a + s.quantity, 0)
  }
  get remainingQuantity(): number {
    return this.totalBuyQuantity - this.totalSellQuantity
  }

  /** 평단의 기준 풀 — 보유 중이면 남은 수량의 이동평균 원가, 다 팔았으면 전체 매수. */
  private get basis(): CostPool {
    return this.remainingQuantity > 0 ? this.ledger.remaining : this.ledger.all
  }

  /** 평단(원/주, 수수료 제외) — 이동평균. */
  get averageBuyPrice(): number {
    const b = this.basis
    return b.qty > 0 ? b.amount / b.qty : 0
  }

  /** 미청산 원가(원) = 평단 × 잔량. */
  get positionCost(): number {
    return this.averageBuyPrice * this.remainingQuantity
  }

  get currency(): Currency {
    return this.buys[0]?.currency ?? this.sells[0]?.currency ?? 'KRW'
  }
  get isForeign(): boolean {
    return this.currency !== 'KRW'
  }

  /** 거래 통화 평단. */
  get nativeAverageBuyPrice(): number {
    const b = this.basis
    return b.qty > 0 ? b.native / b.qty : 0
  }

  /** 매수 실효 환율(수수료 포함). 원화는 1. */
  get averageBuyExchangeRate(): number {
    return this.basis.costRate
  }

  /** 실현손익(원) — 완결 포지션만. */
  get realizedProfit(): number | null {
    return this.isClosed ? this.totalSellAmount - this.totalBuyAmount : null
  }

  private splitFrom(pool: CostPool, quantity: number, nativeProceeds: number, sellRate: number): PnlSplit {
    if (pool.qty <= 0) return { trading: 0, fx: 0 }
    const share = quantity / pool.qty
    const allocKRW = pool.cost * share
    if (!this.isForeign) return { trading: nativeProceeds - allocKRW, fx: 0 }
    const allocNative = pool.nativeCost * share
    const buyRate = pool.costRate
    return { trading: (nativeProceeds - allocNative) * buyRate, fx: nativeProceeds * (sellRate - buyRate) }
  }

  private poolFor(sell: { id: string }): CostPool {
    return this.ledger.perSell.get(sell.id) ?? this.ledger.all
  }

  /** 지금 보유분에서 `quantity`만큼 판다고 가정한 손익 분해(매도 입력 미리보기). */
  pnlSplitPreview(quantity: number, nativeProceeds: number, sellRate: number): PnlSplit {
    return this.splitFrom(this.basis, quantity, nativeProceeds, sellRate)
  }

  /** 이미 한 매도 1건의 손익 분해 — 원가는 그 매도 시점까지 산 것만으로 정해진다. */
  pnlSplit(sell: RatedSell): PnlSplit {
    return this.splitFrom(this.poolFor(sell), sell.quantity, sellNetNative(sell), sell.rate)
  }

  /** 매도 1건을 수량·대금만 바꿨다고 가정한 손익 분해(매도 수정 미리보기). */
  pnlSplitEditing(sell: RatedSell, quantity: number, nativeProceeds: number): PnlSplit {
    return this.splitFrom(this.poolFor(sell), quantity, nativeProceeds, sell.rate)
  }

  /** 이 매도의 거래 통화 평단(그 매도 시점 이동평균). */
  nativeCostPrice(sell: { id: string }): number {
    const pool = this.poolFor(sell)
    return pool.qty > 0 ? pool.native / pool.qty : 0
  }

  /** 이 매도에 배분된 원가의 환율(수수료 포함) — 달러 매도 대금을 달러 장부에 들이는 환율. */
  costRateFor(sell: { id: string }): number {
    return this.poolFor(sell).costRate
  }

  /** 이 매도의 원가(원, 수수료 제외) — 매도 시점 이동평균 평단 × 매도 수량. */
  costBasis(sell: RatedSell): number {
    const pool = this.ledger.perSell.get(sell.id)
    if (pool) return pool.amount
    const all = this.ledger.all
    return all.qty > 0 ? (all.amount / all.qty) * sell.quantity : sellAmountKRW(sell)
  }

  get pnlSplitTotal(): PnlSplit {
    return this.sells.reduce(
      (acc, s) => {
        const p = this.pnlSplit(s)
        return { trading: acc.trading + p.trading, fx: acc.fx + p.fx }
      },
      { trading: 0, fx: 0 },
    )
  }

  /** 환율 변동을 뺀 실현손익(원) — 주화입마 기대손익용. */
  get tradingProfit(): number | null {
    const realized = this.realizedProfit
    if (realized === null) return null
    return this.isForeign ? realized - this.pnlSplitTotal.fx : realized
  }

  /** 거래 완결 = 전체 청산. */
  get isClosed(): boolean {
    return this.totalBuyQuantity > 0 && this.totalSellQuantity >= this.totalBuyQuantity
  }

  get firstBuyDate(): Millis | null {
    return this.buys.length ? Math.min(...this.buys.map((b) => b.date)) : null
  }
  get lastSellDate(): Millis | null {
    return this.sells.length ? Math.max(...this.sells.map((s) => s.date)) : null
  }

  /** 거래당 수익률(%) — 거래 통화 기준(환율 변동 제외). */
  get returnPercent(): number | null {
    if (!this.isClosed) return null
    const nativeBuy = this.buys.reduce((a, b) => a + b.unitPrice * b.quantity, 0)
    const nativeSell = this.sells.reduce((a, s) => a + s.unitPrice * s.quantity, 0)
    if (nativeBuy <= 0) return null
    return ((nativeSell - nativeBuy) / nativeBuy) * 100
  }

  get isWin(): boolean | null {
    const r = this.returnPercent
    return r === null ? null : r > 0
  }

  /** 잔량 전부를 `nativePrice`에 판다고 가정한 손익(원, 순수 가격 기준) — 피라미딩 쿠션(확보이익). */
  liquidationProfit(nativePrice: number, exchangeRate: number): number {
    return (nativePrice * exchangeRate - this.averageBuyPrice) * this.remainingQuantity
  }

  // MARK: 리스크 관리 — 달러로 먼저 계산한 뒤 포지션 원가 환율 하나로 환산한다.

  /** 대표 매매계획 = 가장 최근 매수건. */
  get plan(): RatedBuy | null {
    return maxBy(this.buys, (b) => b.date)
  }

  /** 원가 환율 = 원화 체결금액 ÷ 거래 통화 체결금액(수수료 제외). 원화는 1. */
  get costRate(): number {
    const b = this.basis
    return b.native > 0 ? b.amount / b.native : 1
  }

  /** 손절가(거래 통화) — 대표 매수건 기준. */
  get nativeStopLoss(): number | null {
    return this.plan?.stopLossPrice ?? null
  }

  /** 손절률(%) = (손절가 − 평단) ÷ 평단. */
  get stopLossPercent(): number | null {
    const stop = this.nativeStopLoss
    const avg = this.nativeAverageBuyPrice
    if (stop === null || avg <= 0) return null
    return ((stop - avg) / avg) * 100
  }

  /** 손절 시 손익(원) = (손절가 − 평단) × 잔량 × 원가 환율. */
  get pnlAtStop(): number | null {
    const stop = this.nativeStopLoss
    if (stop === null) return null
    return (stop - this.nativeAverageBuyPrice) * this.remainingQuantity * this.costRate
  }

  /** 손절 시 손익 ÷ 대표 매수건 진입 시 총자산(%) — 음수면 리스크율, 양수면 확보수익률. */
  get pnlAtStopPercent(): number | null {
    const pnl = this.pnlAtStop
    const base = this.plan?.totalAssetsAtEntry
    if (pnl === null || !base || base <= 0) return null
    return (pnl / base) * 100
  }

  /** 손절가 ≥ 평단 — "본전 확보". */
  get isBreakevenSecured(): boolean {
    return (this.pnlAtStop ?? -1) >= 0
  }

  /** 가장 최근에 기록한 현재가(거래 통화)와 기록 시각. */
  get mark(): { price: number; date: Millis } | null {
    const marks = this.buys
      .filter((b) => b.markDate !== null && b.markPrice > 0)
      .map((b) => ({ price: b.markPrice, date: b.markDate as Millis }))
    return maxBy(marks, (m) => m.date)
  }

  get markReturnPercent(): number | null {
    const m = this.mark
    const avg = this.nativeAverageBuyPrice
    if (!m || avg <= 0) return null
    return (m.price / avg - 1) * 100
  }

  /** 현재수익(원) = (현재가 − 평단) × 잔량 × 원가 환율(환율 변동 제외). */
  get markProfit(): number | null {
    const m = this.mark
    if (!m) return null
    return (m.price - this.nativeAverageBuyPrice) * this.remainingQuantity * this.costRate
  }

  /** 손절 여유(%) = (손절가 − 현재가) ÷ 현재가. 0 이상이면 손절가 도달. */
  get stopRoomPercent(): number | null {
    const m = this.mark
    const stop = this.nativeStopLoss
    if (!m || m.price <= 0 || stop === null) return null
    return ((stop - m.price) / m.price) * 100
  }

  /** ⑥ 현재가를 기록한 지 7일 넘음(달력 기준). */
  isMarkStale(now: Millis = Date.now()): boolean {
    const m = this.mark
    if (!m) return false
    return calendarDays(m.date, now) > MARK_STALE_DAYS
  }

  // MARK: 계좌기여율 · 피라미딩 기여 (분모 = 첫 매수 때 총자산)

  private get firstBuy(): RatedBuy | null {
    return minBy(this.buys, (b) => b.date)
  }

  private get entryTotalAssets(): number | null {
    const base = this.firstBuy?.totalAssetsAtEntry
    return base && base > 0 ? base : null
  }

  /** 계좌기여율(%) = 이 매도의 매매손익(수수료 포함·환차 제외) ÷ 포지션 진입 시 총자산. */
  accountContribution(sell: RatedSell): number | null {
    const base = this.entryTotalAssets
    return base === null ? null : (this.pnlSplit(sell).trading / base) * 100
  }

  /** 진입 리스크율(%) — 첫 매수가 총자산 기준일 때. 수익쿠션이거나 0이면 null. */
  get entryRiskPercent(): number | null {
    const first = this.firstBuy
    if (!first || first.riskMode !== 'totalAssets' || first.riskPercent <= 0) return null
    return first.riskPercent
  }

  /** ⑦ 이 매도의 계좌기여율이 진입 리스크율보다 더 잃었나(0.05%p 여유). */
  exceededEntryRisk(sell: RatedSell): boolean {
    const risk = this.entryRiskPercent
    const contribution = this.accountContribution(sell)
    if (risk === null || contribution === null) return false
    return contribution < -risk - 0.05
  }

  /** 이 매도의 손절가(거래 통화) — 저장 때 기록한 매도 시점 손절가, 없으면 지금 손절가. */
  stopAtSell(sell: RatedSell): number | null {
    if (sell.stopLossAtSell > 0) return sell.stopLossAtSell
    const current = this.nativeStopLoss
    return current !== null && current > 0 ? current : null
  }

  stopGap(sell: RatedSell): number | null {
    const stop = this.stopAtSell(sell)
    return stop === null ? null : stopGapPercent(sell.unitPrice, stop)
  }

  /** 포지션 손절가대비(%) — 매도별 손절가대비를 매도 수량으로 가중평균. */
  get averageStopGap(): number | null {
    let qty = 0
    let sum = 0
    for (const s of this.sells) {
      const g = this.stopGap(s)
      if (g === null) continue
      qty += s.quantity
      sum += g * s.quantity
    }
    return qty > 0 ? sum / qty : null
  }

  /** ③ 물타기 — 보유 중에 그 시점 평단보다 낮은 가격으로 추가 매수했나. */
  isAveragingDown(buy: RatedBuy): boolean {
    const average = this.ledger.nativeAverageBeforeBuy.get(buy.id)
    return average !== undefined && buy.unitPrice < average
  }

  /** ⑤ 보유 중 리스크가 진입 리스크율을 0.05%p 넘게 넘었나. 본전 확보·수익쿠션 진입은 판정 안 함. */
  get openRiskExceedsEntry(): boolean {
    const risk = this.entryRiskPercent
    const pct = this.pnlAtStopPercent
    if (risk === null || pct === null || pct >= 0) return false
    return -pct > risk + 0.05
  }

  /** 포지션 전체 계좌기여율(%, 완결 포지션). */
  get positionContribution(): number | null {
    const base = this.entryTotalAssets
    if (!this.isClosed || base === null) return null
    return (this.pnlSplitTotal.trading / base) * 100
  }

  /** 매수 순서(N-1·N-2…). 같은 시각이면 단가가 낮은 쪽이 먼저, 그다음 ID 순. */
  get orderedBuys(): RatedBuy[] {
    return [...this.buys].sort((a, b) => {
      if (a.date !== b.date) return a.date - b.date
      if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice
      return idKey(a.id) < idKey(b.id) ? -1 : idKey(a.id) > idKey(b.id) ? 1 : 0
    })
  }

  /**
   * 피라미딩별 계좌기여율(%, 완결 포지션, `orderedBuys` 순) — 추가 매수가 없으면 null.
   * 추가 매수분(N-2~) = 그 매수가 받은 매도 대금 − 자기 매수원가 ÷ 첫 매수 진입 총자산,
   * 첫 매수(N-1) = 포지션 전체 − 추가분 합.
   */
  get trancheContributions(): number[] | null {
    const total = this.positionContribution
    const base = this.entryTotalAssets
    if (!this.isClosed || this.buys.length <= 1 || this.totalBuyQuantity <= 0 || total === null || base === null) return null
    const soldIds = new Set(this.sells.flatMap((s) => s.soldBuyIds))
    const exact = !this.hasLegacySells && soldIds.size === this.buys.length && this.buys.every((b) => soldIds.has(b.id))
    const quantityById = new Map<string, number>()
    for (const b of this.buys) if (!quantityById.has(b.id)) quantityById.set(b.id, b.quantity)
    const netProceeds = this.sells.reduce((a, s) => a + sellNetNative(s), 0)
    const added = this.orderedBuys.slice(1).map((buy) => {
      const nativeCost = buyCostNative(buy)
      const rate = nativeCost > 0 ? buyCostKRW(buy) / nativeCost : 1
      let proceeds: number
      const sell = exact ? this.sellOfLot(buy) : null
      if (sell) {
        const lotQuantity = sell.soldBuyIds.reduce((a, id) => a + (quantityById.get(id) ?? 0), 0)
        proceeds = lotQuantity > 0 ? (sellNetNative(sell) * buy.quantity) / lotQuantity : 0
      } else {
        proceeds = (netProceeds * buy.quantity) / this.totalBuyQuantity
      }
      return (((proceeds - nativeCost) * rate) / base) * 100
    })
    return [total - added.reduce((a, x) => a + x, 0), ...added]
  }

  /** 피라미딩 기여(계좌 %) = 추가 매수분 기여 합. */
  get pyramidContribution(): number | null {
    const t = this.trancheContributions
    return t === null ? null : t.slice(1).reduce((a, x) => a + x, 0)
  }

  // MARK: 매수별 매도 — 가장 최근 매수부터 순서대로 판다.

  /** 이미 팔린 매수 ID. `excluding` 매도는 뺀다(매도 수정 화면). */
  soldLotIds(excluding?: { id: string } | null): Set<string> {
    return new Set(this.sells.filter((s) => s.id !== excluding?.id).flatMap((s) => s.soldBuyIds))
  }

  /** 아직 안 판 매수(오래된 것 먼저). */
  availableLots(excluding?: { id: string } | null): RatedBuy[] {
    const sold = this.soldLotIds(excluding)
    return this.orderedBuys.filter((b) => !sold.has(b.id))
  }

  /** `lot`까지 팔 때 같이 팔리는 매수 — `lot`과 그보다 최근의 안 판 매수 전부. */
  static lotsSelling<T extends { id: string }>(lot: { id: string }, lots: T[]): T[] {
    const index = lots.findIndex((l) => l.id === lot.id)
    return index < 0 ? [] : lots.slice(index)
  }

  /** 판 매수 정보가 없는 옛 매도가 섞여 있나 — 보유 중이면 전량만 팔 수 있다. */
  get hasLegacySells(): boolean {
    return this.sells.some((s) => s.soldBuyIds.length === 0)
  }

  sellOfLot(buy: { id: string }): RatedSell | null {
    return this.sells.find((s) => s.soldBuyIds.includes(buy.id)) ?? null
  }

  /** 매수 순서 이름 "N-n". */
  trancheLabel(index: number): string {
    return `${this.entryNumber}-${index + 1}`
  }

  lotLabel(buy: { id: string }): string {
    const index = this.orderedBuys.findIndex((b) => b.id === buy.id)
    return index < 0 ? '' : this.trancheLabel(index)
  }

  /** 여러 매수를 한 이름으로 — "1-1, 1-2"(매수 순). */
  lotsLabel(ids: string[]): string | null {
    const set = new Set(ids)
    const names = this.orderedBuys.flatMap((b, i) => (set.has(b.id) ? [this.trancheLabel(i)] : []))
    return names.length ? names.join(', ') : null
  }

  /** 매도일(날짜 칸)보다 늦게 산 매수 — 있으면 그 매도는 저장하면 안 된다. */
  static lotBoughtAfter<T extends { date: Millis }>(sellDate: Millis, lots: T[]): T | null {
    return maxBy(
      lots.filter((l) => isLaterDay(l.date, sellDate)),
      (l) => l.date,
    )
  }

  /** 저장할 매도 시각 — 같은 날 산 매수보다 앞서면 그 매수 1초 뒤로. */
  static sellDate(date: Millis, lots: { date: Millis }[]): Millis {
    if (!lots.length) return date
    const latest = Math.max(...lots.map((l) => l.date))
    if (date > latest || !isSameDay(date, latest)) return date
    return latest + 1000
  }

  /** "1-3 매도"(부제 "N주") / "1-2까지 매도"(부제 "1-2, 1-3 · N주"). */
  sellMenuText(buy: { id: string }): { title: string; detail: string } {
    const lots = TradePosition.lotsSelling(buy, this.availableLots())
    const quantity = lots.reduce((a, l) => a + l.quantity, 0)
    const name = this.lotLabel(buy)
    const range = this.lotsLabel(lots.map((l) => l.id))
    if (lots.length <= 1 || range === null) return { title: `${name} 매도`, detail: `${quantity}주` }
    return { title: `${name}까지 매도`, detail: `${range} · ${quantity}주` }
  }

  /** 현황 보유 카드 알약 — 다음에 팔릴 매수 이름. */
  get nextLotLabel(): string | null {
    const next = this.hasLegacySells ? this.orderedBuys.at(-1) : this.availableLots().at(-1)
    return next ? this.lotLabel(next) : null
  }

  // MARK: 완료 거래(매수 단위)

  /** 매수별 수익률(%) — 그 매수 자기 매수가 기준. */
  lotReturn(buy: RatedBuy, nativePrice: number): number | null {
    const cost = buy.unitPrice
    return cost > 0 ? ((nativePrice - cost) / cost) * 100 : null
  }

  /** 매수별 매매손익(원, 수수료 미반영·환율 변동 제외). */
  private lotProfit(buy: RatedBuy, nativePrice: number): number {
    const rate = buy.rate > 0 ? buy.rate : 1
    return (nativePrice - buy.unitPrice) * buy.quantity * rate
  }

  /** 완료 거래 목록 — 팔린 매수 하나 = 1건. 옛 매도가 섞인 포지션은 다 팔렸을 때 포지션 전체 1건. */
  get outcomes(): TradeOutcome[] {
    if (this.hasLegacySells) {
      const r = this.returnPercent
      const end = this.lastSellDate
      const lastSell = maxBy(this.sells, (s) => s.date)
      if (!this.isClosed || r === null || end === null || !lastSell) return []
      return [
        {
          id: this.id,
          tradeId: this.id,
          assetName: this.assetName,
          lotLabel: null,
          buyDate: this.firstBuyDate ?? end,
          closeDate: end,
          stepKey: this.id,
          sellId: lastSell.id,
          order: 0,
          returnPercent: r,
          tradingProfit: this.tradingProfit ?? 0,
          stopGap: this.averageStopGap,
        },
      ]
    }
    return this.orderedBuys.flatMap((buy, index) => {
      const sell = this.sellOfLot(buy)
      const r = sell ? this.lotReturn(buy, sell.unitPrice) : null
      if (!sell || r === null) return []
      return [
        {
          id: buy.id,
          tradeId: this.id,
          assetName: this.assetName,
          lotLabel: this.trancheLabel(index),
          buyDate: buy.date,
          closeDate: sell.date,
          stepKey: idKey(sell.id),
          sellId: sell.id,
          order: index,
          returnPercent: r,
          tradingProfit: this.lotProfit(buy, sell.unitPrice),
          stopGap: this.stopGap(sell),
        },
      ]
    })
  }

  /** 이 매도로 판 매수별 결과 — 매도 카드 "1-1 +12.3% · 1-2 −4.2%". */
  lotResults(sell: RatedSell): { label: string; percent: number }[] {
    const ids = new Set(sell.soldBuyIds)
    return this.orderedBuys.flatMap((buy, index) => {
      const r = ids.has(buy.id) ? this.lotReturn(buy, sell.unitPrice) : null
      return r === null ? [] : [{ label: this.trancheLabel(index), percent: r }]
    })
  }

  /** 이 매도에 포함된 매수 중 가장 오래 보유한 거래일 수 — 옛 기록이면 null. */
  longestLotHoldDays(sell: RatedSell): number | null {
    const ids = new Set(sell.soldBuyIds)
    const days = this.buys.filter((b) => ids.has(b.id)).map((b) => tradingDays(b.date, sell.date))
    return days.length ? Math.max(...days) : null
  }

  /** 이 매수 직후 보유 원가(원) — 피라미딩이면 누적. */
  holdingCostAfterBuy(buy: { id: string }): number | null {
    return this.ledger.holdingAfter.get(buy.id) ?? null
  }

  /** 이 매도 직전·직후 보유 원가(원). */
  holdingCostAroundSell(sell: { id: string }): { before: number; after: number } | null {
    const before = this.ledger.holdingBeforeSell.get(sell.id)
    const after = this.ledger.holdingAfter.get(sell.id)
    return before === undefined || after === undefined ? null : { before, after }
  }

  /** `target`에 합칠 수 있는지 — 같은 종목·통화, 둘 다 보유 중, 둘 다 매도 기록 없음. */
  canMerge(target: TradePosition): boolean {
    return (
      this.id !== target.id &&
      this.assetName === target.assetName &&
      this.currency === target.currency &&
      !this.isClosed &&
      !target.isClosed &&
      this.sells.length === 0 &&
      target.sells.length === 0 &&
      this.buys.length > 0
    )
  }

  /** tradeId로 묶어 포지션 목록을 만든다(첫 매수일 최근 순). N-n의 N도 여기서 정한다. */
  static aggregate(buys: RatedBuy[], sells: RatedSell[]): TradePosition[] {
    const buysById = groupBy(buys, (b) => b.tradeId)
    const sellsById = groupBy(sells, (s) => s.tradeId)
    const tradeIds = new Set([...buysById.keys(), ...sellsById.keys()])
    const trades = [...tradeIds].map((tid) => {
      const tb = buysById.get(tid) ?? []
      const ts = sellsById.get(tid) ?? []
      return {
        id: tid,
        name: tb[0]?.assetName ?? ts[0]?.assetName ?? '',
        buys: tb,
        sells: ts,
        firstBuy: tb.length ? Math.min(...tb.map((b) => b.date)) : -Infinity,
      }
    })
    // 같은 자산명 거래를 첫 매수일 순으로 세어 "N-n"의 N을 붙인다(통화가 달라도 이름이 같으면 같이 센다).
    const numbers = new Map<string, number>()
    for (const group of groupBy(trades, (t) => t.name).values()) {
      const ordered = [...group].sort((a, b) =>
        a.firstBuy !== b.firstBuy ? a.firstBuy - b.firstBuy : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      )
      ordered.forEach((t, i) => numbers.set(t.id, i + 1))
    }
    return trades
      .map((t) => new TradePosition(t.id, t.name, t.buys, t.sells, numbers.get(t.id) ?? 1))
      .sort((a, b) => (b.firstBuyDate ?? -Infinity) - (a.firstBuyDate ?? -Infinity))
  }
}

/** 이 매도 뒤 다음에 팔릴 매수 안내 — 고른 게 없으면 null. */
export function nextLotAfterSellText(position: TradePosition, lots: { id: string }[], selection: Set<string>): string | null {
  if (selection.size === 0) return null
  const next = [...lots].reverse().find((l) => !selection.has(l.id))
  if (!next) return '전량 매도 — 이 포지션이 끝나요'
  return `이 매도 뒤 다음에 팔릴 매수: ${position.lotLabel(next)}`
}

// MARK: - 작은 도구

export function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

/** 가장 큰 값(같으면 앞의 것). */
export function maxBy<T>(items: T[], value: (t: T) => number): T | null {
  let best: T | null = null
  let bestValue = -Infinity
  for (const item of items) {
    const v = value(item)
    if (best === null || v > bestValue) {
      best = item
      bestValue = v
    }
  }
  return best
}

/** 가장 작은 값(같으면 앞의 것). */
export function minBy<T>(items: T[], value: (t: T) => number): T | null {
  let best: T | null = null
  let bestValue = Infinity
  for (const item of items) {
    const v = value(item)
    if (best === null || v < bestValue) {
      best = item
      bestValue = v
    }
  }
  return best
}
