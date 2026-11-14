// 총자산·자산 추이·경지 판정 등 화면들이 같이 쓰는 값을 한 번에 계산한다.
import { cashBalances, replayFx, resolveFxRate, resolveRates, type CashBalances, type ResolvedFxRate } from './fx'
import { TradePosition, type TradeOutcome } from './position'
import { buyAmountKRW, buyCashOutflow, buyFeeKRW, cashDelta, sellAmountKRW, sellCashInflow, sellFeeKRW, type RatedBuy, type RatedSell } from './records'
import { evaluate, type TierGradingResult } from './tier'
import { DEFAULT_SETTINGS, type CashTx, type CashTxType, type JournalData, type Millis, type Settings } from './types'

// MARK: 예수금·순입금액

/** 누적 수수료 = 옛 예수금 '수수료' 합계 + 매수·매도 기록의 수수료·제세금. */
export function cumulativeFees(cash: CashTx[], buys: RatedBuy[] = [], sells: RatedSell[] = []): number {
  const manual = cash.filter((t) => t.type === 'feeExpense' && t.currency === 'KRW').reduce((a, t) => a + t.amount, 0)
  return manual + buys.reduce((a, b) => a + buyFeeKRW(b), 0) + sells.reduce((a, s) => a + sellFeeKRW(s), 0)
}

/** 순입금액 = 누적 입금 − 누적 출금. 환전·배당은 미반영. */
export function netContributions(cash: CashTx[]): number {
  let total = 0
  for (const t of cash) {
    if (t.currency !== 'KRW') continue
    if (t.type === 'deposit') total += t.amount
    else if (t.type === 'withdrawal') total -= t.amount
  }
  return total
}

/** 누적수익률(%) = (총자산 − 순입금액) ÷ 순입금액. */
export function cumulativeReturnPercent(totalAssets: number, net: number): number | null {
  return net > 0 ? ((totalAssets - net) / net) * 100 : null
}

// MARK: 자산 추이

export type TimelineEventType = CashTxType | 'buy' | 'sell'

export interface AssetTimelinePoint {
  recordId: string
  date: Millis
  cashAmount: number
  investedAmount: number
  /** 그 시점까지 누적 순입금액(입금 − 출금만) */
  netContributions: number
  eventType: TimelineEventType
  /** 매수·매도면 자산명 */
  eventLabel: string | null
}

export const pointAssets = (p: AssetTimelinePoint): number => p.cashAmount + p.investedAmount

interface TimelineEvent {
  recordId: string
  date: Millis
  krwDelta: number
  usdBookDelta: number
  investedDelta: number
  netContributionDelta: number
  eventType: TimelineEventType
  eventLabel: string | null
}

/**
 * 입금·출금·환전·매수·매도 전체를 시간순으로 재생해 이벤트마다 한 점씩 찍는 총자산 시계열.
 * 원화 예수금 + 달러 예수금 장부가 + 보유 원가 — 현재 총자산 공식과 같은 기준이라 설정 환율엔 흔들리지 않는다.
 */
function replayTimeline(
  buys: RatedBuy[],
  sells: RatedSell[],
  cash: CashTx[],
  positions: TradePosition[] = TradePosition.aggregate(buys, sells),
): { points: AssetTimelinePoint[]; around: Map<string, { before: number; after: number }> } {
  const usdBook = replayFx(buys, sells, cash).bookDeltas
  const events: TimelineEvent[] = []

  for (const tx of cash) {
    const d = cashDelta(tx)
    let net = 0
    if (tx.type === 'deposit' && tx.currency === 'KRW') net = tx.amount
    if (tx.type === 'withdrawal' && tx.currency === 'KRW') net = -tx.amount
    events.push({
      recordId: tx.id, date: tx.date, krwDelta: d.krw, usdBookDelta: usdBook.get(tx.id) ?? 0,
      investedDelta: 0, netContributionDelta: net, eventType: tx.type, eventLabel: null,
    })
  }
  for (const b of buys) {
    events.push({
      recordId: b.id, date: b.date, krwDelta: -buyCashOutflow(b).krw, usdBookDelta: usdBook.get(b.id) ?? 0,
      investedDelta: buyAmountKRW(b), netContributionDelta: 0, eventType: 'buy', eventLabel: b.assetName,
    })
  }
  // 부분 매도 원가 = 매도 시점 이동평균 평단 × 매도 수량
  const byTrade = new Map(positions.map((p) => [p.id, p]))
  for (const s of sells) {
    const costBasis = byTrade.get(s.tradeId)?.costBasis(s) ?? sellAmountKRW(s)
    events.push({
      recordId: s.id, date: s.date, krwDelta: sellCashInflow(s).krw, usdBookDelta: usdBook.get(s.id) ?? 0,
      investedDelta: -costBasis, netContributionDelta: 0, eventType: 'sell', eventLabel: s.assetName,
    })
  }

  // 같은 시각이면 넣은 순서(예수금 → 매수 → 매도) — 같이 기록한 환전이 매수보다 먼저.
  const sorted = events.map((e, offset) => ({ e, offset }))
    .sort((a, b) => (a.e.date !== b.e.date ? a.e.date - b.e.date : a.offset - b.offset))
    .map((x) => x.e)

  let krw = 0
  let usdBookKRW = 0
  let invested = 0
  let net = 0
  const points: AssetTimelinePoint[] = []
  const around = new Map<string, { before: number; after: number }>()
  for (const e of sorted) {
    const before = krw + usdBookKRW + invested
    krw += e.krwDelta
    usdBookKRW += e.usdBookDelta
    invested += e.investedDelta
    net += e.netContributionDelta
    around.set(e.recordId, { before, after: krw + usdBookKRW + invested })
    points.push({
      recordId: e.recordId, date: e.date, cashAmount: krw + usdBookKRW, investedAmount: invested,
      netContributions: net, eventType: e.eventType, eventLabel: e.eventLabel,
    })
  }
  return { points, around }
}

export function assetTimeline(buys: RatedBuy[], sells: RatedSell[], cash: CashTx[]): AssetTimelinePoint[] {
  return replayTimeline(buys, sells, cash).points
}

/** 기록별 총자산(직전·직후) — 마지막 직후 값 = 현재 총자산. */
export function totalAssetsAroundRecords(buys: RatedBuy[], sells: RatedSell[], cash: CashTx[]) {
  return replayTimeline(buys, sells, cash).around
}

/** 그 시각까지의 마지막 타임라인 점의 총자산. */
export function assetsAt(date: Millis, timeline: AssetTimelinePoint[]): number {
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].date <= date) return pointAssets(timeline[i])
  }
  return 0
}

/**
 * 경지 판정 — 완료 거래를 각 매도 시점의 총자산 스냅샷(타임라인)으로만 재생한다. 입출금(출금 포함)으로 총자산이
 * 경지 최소 밑이 되면 그 순간 강등. `limitPercent` = 설정의 최대 손절폭(기준 넘은 손실 판정).
 */
export function grading(outcomes: TradeOutcome[], timeline: AssetTimelinePoint[], limitPercent = DEFAULT_SETTINGS.maxStopLossPercent): TierGradingResult {
  return evaluate(
    outcomes,
    timeline.map((p) => ({ date: p.date, assets: pointAssets(p) })),
    limitPercent,
  )
}

/**
 * 시간가중수익률(TWR, %) — 입출금마다 구간을 나눠 구간별 수익률을 곱으로 이어 붙인다.
 * 입출금 금액·시점에 영향받지 않는다.
 */
export function timeWeightedReturnPercent(timeline: AssetTimelinePoint[]): number | null {
  const sorted = [...timeline].sort((a, b) => a.date - b.date)
  if (!sorted.length) return null
  let segmentStart: number | null = null
  let factor = 1
  let lastValue = 0
  sorted.forEach((point, index) => {
    const isCashFlow = point.eventType === 'deposit' || point.eventType === 'withdrawal'
    if (isCashFlow) {
      if (segmentStart !== null && segmentStart > 0) factor *= 1 + (lastValue - segmentStart) / segmentStart
      segmentStart = pointAssets(point)
    }
    lastValue = pointAssets(point)
    if (index === sorted.length - 1 && !isCashFlow && segmentStart !== null && segmentStart > 0) {
      factor *= 1 + (lastValue - segmentStart) / segmentStart
    }
  })
  if (segmentStart === null) return null
  return (factor - 1) * 100
}

// MARK: 스냅샷

/** 총자산(원) = 원화 예수금 + 보유 매수원가 + 달러 예수금 × 달러 평균 매입 환율. 설정 환율은 안 들어간다. */
export function totalAssetsOf(open: TradePosition[], cash: CashBalances): number {
  return cash.totalKRW + open.reduce((a, p) => a + p.positionCost, 0)
}

/** 한 번의 계산으로 화면들이 공통으로 쓰는 값. */
export interface PortfolioSnapshot {
  buys: RatedBuy[]
  sells: RatedSell[]
  cashTxs: CashTx[]
  positions: TradePosition[]
  openPositions: TradePosition[]
  closedPositions: TradePosition[]
  outcomes: TradeOutcome[]
  cash: CashBalances
  fxRate: ResolvedFxRate | null
  totalAssets: number
  netContributions: number
  cumulativeFees: number
  timeline: AssetTimelinePoint[]
  /** 기록 id → 직전·직후 총자산 */
  assetsAround: Map<string, { before: number; after: number }>
  grading: TierGradingResult
}

/** 환율이 붙은 기록으로 스냅샷을 만든다(테스트·내부용). */
export function makeSnapshot(
  buys: RatedBuy[],
  sells: RatedSell[],
  cashTxs: CashTx[],
  fxRate: ResolvedFxRate | null = null,
  settings: Pick<Settings, 'maxStopLossPercent'> = DEFAULT_SETTINGS,
): PortfolioSnapshot {
  const positions = TradePosition.aggregate(buys, sells)
  const open = positions.filter((p) => !p.isClosed)
  const balances = cashBalances(cashTxs, buys, sells)
  const { points, around } = replayTimeline(buys, sells, cashTxs, positions)
  const outcomes = positions.flatMap((p) => p.outcomes)
  return {
    buys,
    sells,
    cashTxs,
    positions,
    openPositions: open,
    closedPositions: positions.filter((p) => p.isClosed),
    outcomes,
    cash: balances,
    fxRate,
    totalAssets: totalAssetsOf(open, balances),
    netContributions: netContributions(cashTxs),
    cumulativeFees: cumulativeFees(cashTxs, buys, sells),
    timeline: points,
    assetsAround: around,
    grading: grading(outcomes, points, settings.maxStopLossPercent),
  }
}

/** 저장된 데이터 전체 → 스냅샷(환율 정하기 포함). 화면은 이것 하나만 쓴다. */
export function buildSnapshot(data: Pick<JournalData, 'buys' | 'sells' | 'cash' | 'settings'>): PortfolioSnapshot {
  const { buys, sells } = resolveRates(data.buys, data.sells, data.cash)
  const fx = resolveFxRate(data.cash, data.settings.manualFxRate, data.settings.manualFxRateDate)
  return makeSnapshot(buys, sells, data.cash, fx, data.settings)
}

// MARK: 카드 비중

/**
 * 매수·매도 카드 비중(%) — 현황 보유 카드와 같은 공식(보유 원가 ÷ 총자산)을 그 기록 시점으로.
 * 매수 = 그 매수 직후(피라미딩이면 누적), 매도 = 직전 → 직후.
 */
export interface RecordWeights {
  afterBuy: Map<string, number>
  aroundSell: Map<string, { before: number; after: number }>
}

export function recordWeights(snapshot: Pick<PortfolioSnapshot, 'positions' | 'assetsAround'>): RecordWeights {
  const result: RecordWeights = { afterBuy: new Map(), aroundSell: new Map() }
  for (const p of snapshot.positions) {
    for (const b of p.buys) {
      const cost = p.holdingCostAfterBuy(b)
      const total = snapshot.assetsAround.get(b.id)?.after
      if (cost !== null && total !== undefined && total > 0) result.afterBuy.set(b.id, (cost / total) * 100)
    }
    for (const s of p.sells) {
      const cost = p.holdingCostAroundSell(s)
      const total = snapshot.assetsAround.get(s.id)
      if (cost && total && total.before > 0 && total.after > 0) {
        result.aroundSell.set(s.id, { before: (cost.before / total.before) * 100, after: (cost.after / total.after) * 100 })
      }
    }
  }
  return result
}

/** 보유 포지션 자산별 원가 — 파이차트. */
export function openPositionBreakdown(open: TradePosition[]): { name: string; amount: number }[] {
  return open.map((p) => ({ name: p.assetName, amount: p.positionCost }))
}
