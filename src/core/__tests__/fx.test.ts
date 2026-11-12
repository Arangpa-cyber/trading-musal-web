import { describe, expect, it } from 'vitest'
import { assetsAt, buildSnapshot, cumulativeFees, cumulativeReturnPercent, annualizedReturnPercent, makeSnapshot, netContributions, assetTimeline, timeWeightedReturnPercent } from '../analytics'
import { cashBalances, feeFor, replayFx, resolveFxRate, resolveRates } from '../fx'
import { TradePosition } from '../position'
import { cashDeltaOf, impliedExchangeRate } from '../records'
import { DEFAULT_SETTINGS, type Buy, type Sell } from '../types'
import { close, day, exchange, makeBuy, makeCash, makeSell } from './helpers'

/** 저장 형태(환율 없음)로 — 환율은 resolveRates가 정한다. */
const stored = <T extends { rate: number }>(r: T): Omit<T, 'rate'> => {
  const { rate: _rate, ...rest } = r
  void _rate
  return rest
}

describe('자산 계산', () => {
  const tx = [makeCash('deposit', 1_000_000), makeCash('dividend', 500), makeCash('withdrawal', 200), makeCash('feeExpense', 300)]
  const buys = [makeBuy({ tradeId: 't1', qty: 10, price: 100 })]

  it('현금잔고 = 입금+배당 − 출금 − 수수료 − 매수', () => {
    expect(close(cashBalances(tx, buys, []).krw, 999_000)).toBe(true)
  })
  it('순입금액은 입금 − 출금만', () => {
    expect(close(netContributions(tx), 999_800)).toBe(true)
  })
  it('누적 수수료는 옛 수수료 지출 합계', () => {
    expect(close(cumulativeFees(tx), 300)).toBe(true)
  })
  it('매수·매도 기록의 수수료·제세금이 현금 차감·누적 수수료에 반영된다', () => {
    const cash = [makeCash('deposit', 1_000_000)]
    const b = [makeBuy({ tradeId: 't1', qty: 10, price: 100, fee: 30 })]
    const s = [makeSell({ tradeId: 't1', qty: 10, price: 130, fee: 20, tax: 40 })]
    expect(close(cashBalances(cash, b, s).krw, 1_000_210)).toBe(true)
    expect(close(cumulativeFees(cash, b, s), 90)).toBe(true)
  })
  it('누적수익률·연환산수익률', () => {
    expect(close(cumulativeReturnPercent(1210, 1000), 21)).toBe(true)
    expect(close(annualizedReturnPercent(21, 365), 21)).toBe(true)
  })
  it('타임라인은 입금·매수마다 점을 찍고, 이익으로 청산하면 TWR이 양수', () => {
    expect(assetTimeline(buys, [], [makeCash('deposit', 1_000_000)]).length).toBe(2)
    const t = assetTimeline(
      [makeBuy({ tradeId: 't1', date: day(1), qty: 10, price: 100 })],
      [makeSell({ tradeId: 't1', date: day(2), qty: 10, price: 120 })],
      [makeCash('deposit', 1000)],
    )
    expect(timeWeightedReturnPercent(t)! > 0).toBe(true)
  })
})

describe('이중통화(원화 장부)', () => {
  it('매수 수수료 자동 계산 — 1센트·1원 미만 버림', () => {
    expect(feeFor(159.95 * 30, 0.1, 'USD')).toBe(4.79)
    expect(feeFor(159.88 * 12, 0.1, 'USD')).toBe(1.91)
    expect(feeFor(1_000_000, 0.015, 'KRW')).toBe(150)
  })

  it('환전은 순입금액을 바꾸지 않고 원화↔달러 예수금만 옮긴다', () => {
    const tx = [makeCash('deposit', 1_000_000), exchange(680_000, 500)]
    expect(close(netContributions(tx), 1_000_000)).toBe(true)
    const c = cashBalances(tx, [], [])
    expect(close(c.krw, 320_000)).toBe(true)
    expect(close(c.usd, 500)).toBe(true)
    expect(close(impliedExchangeRate(tx[1]), 1360)).toBe(true)
  })

  it('설정 환율: 수동 입력과 마지막 환전 중 더 최근 것', () => {
    const ex = exchange(1_360_000, 1000)
    const auto = resolveFxRate([ex], 0, 0)
    expect(auto?.source).toBe('auto')
    expect(close(auto?.rate, 1360)).toBe(true)
    const manual = resolveFxRate([ex], 1400, 1_000_000)
    expect(manual?.source).toBe('manual')
    expect(manual?.rate).toBe(1400)
    expect(resolveFxRate([], 0, 0)).toBeNull()
  })

  it('예수금 변화 규칙 — 입금·달러 배당·환전 방향별', () => {
    expect(cashDeltaOf('deposit', 100, 0, null, 'KRW')).toEqual({ krw: 100, usd: 0 })
    expect(cashDeltaOf('dividend', 12.34, 0, null, 'USD')).toEqual({ krw: 0, usd: 12.34 })
    expect(cashDeltaOf('exchange', 1_380_000, 1_000, 'krwToUsd', 'KRW')).toEqual({ krw: -1_380_000, usd: 1_000 })
    expect(cashDeltaOf('exchange', 1_450_000, 1_000, 'usdToKrw', 'KRW')).toEqual({ krw: 1_450_000, usd: -1_000 })
  })

  it('환전 기록 + 달러 매수 — 남은 달러는 잔액, 매수 순간 총자산은 수수료만큼만 준다', () => {
    const rate = 6_524_651 / 4804.19
    const ex = exchange(6_524_651, 4804.19)
    const deposit = makeCash('deposit', 10_000_000)
    const buy = stored(makeBuy({ tradeId: 'spx', asset: '스페이스X', qty: 30, price: 159.95, stopLoss: 150, fee: 4.79, currency: 'USD', rate: 1300 })) as Buy
    const settings = DEFAULT_SETTINGS
    const after = buildSnapshot({ buys: [buy], sells: [], cash: [deposit, ex], settings })
    expect(close(after.buys[0].rate, rate, 0.000001)).toBe(true) // 장부 평균 환율 1,358.12원
    expect(close(after.cash.krw, 10_000_000 - 6_524_651, 0.01)).toBe(true)
    expect(close(after.cash.usd, 0.9, 0.0001)).toBe(true)
    const before = buildSnapshot({ buys: [], sells: [], cash: [deposit, ex], settings })
    expect(close(after.totalAssets, before.totalAssets - 4.79 * rate, 0.01)).toBe(true)
  })

  it('설정 환율을 바꿔도 총자산·경지는 그대로다', () => {
    const rate = 6_524_651 / 4804.19
    const buy = makeBuy({ tradeId: 'spx', qty: 30, price: 159.95, fee: 5.69, currency: 'USD', rate, totalAssets: 10_000_000 })
    const sell = makeSell({ tradeId: 'spx', date: day(1), qty: 30, price: 175, currency: 'USD', rate: 1380 })
    const deposit = makeCash('deposit', 10_000_000)
    const low = makeSnapshot([buy], [sell], [deposit], { rate: 1300, date: 0, source: 'manual' })
    const high = makeSnapshot([buy], [sell], [deposit], { rate: 1500, date: 0, source: 'manual' })
    expect(close(high.totalAssets, low.totalAssets, 0.01)).toBe(true)
    expect(high.grading.currentTier).toBe(low.grading.currentTier)
    expect(close(high.cash.unrealizedFx(1500)! - low.cash.unrealizedFx(1300)!, (175 * 30 - 4804.19) * 200, 0.01)).toBe(true)
    expect(close(assetsAt(Infinity, high.timeline), assetsAt(Infinity, low.timeline))).toBe(true)
    const split = new TradePosition('spx', 'x', [buy], [sell]).pnlSplit(sell)
    expect(close(split.trading + split.fx, 175 * 30 * 1380 - 4804.19 * rate, 0.01)).toBe(true)
    expect(close(cashBalances([], [buy], [sell]).usd, 175 * 30 - 4804.19)).toBe(true)
  })
})

describe('달러 장부', () => {
  const usdBuy = (qty: number, price: number, date: number, fallback = 1420): Buy =>
    stored(makeBuy({ tradeId: 'u', asset: 'AAPL', date, qty, price, currency: 'USD', rate: fallback })) as Buy
  const usdSell = (qty: number, price: number, date: number): Sell =>
    stored(makeSell({ tradeId: 'u', asset: 'AAPL', date, qty, price, currency: 'USD' })) as Sell

  it('평균 매입 환율: 1,300원·1,400원에 $1,000씩 → 1,350원, 달러 매수 원가도 1,350원', () => {
    const deposit = makeCash('deposit', 10_000_000)
    const ex = [exchange(1_300_000, 1000, day(0)), exchange(1_400_000, 1000, day(1))]
    const s = DEFAULT_SETTINGS
    const before = buildSnapshot({ buys: [], sells: [], cash: [deposit, ...ex], settings: s })
    expect(close(before.cash.usdAverageRate, 1350)).toBe(true)
    expect(close(before.totalAssets, 10_000_000)).toBe(true)
    const after = buildSnapshot({ buys: [usdBuy(5, 200, day(2))], sells: [], cash: [deposit, ...ex], settings: s })
    expect(close(after.buys[0].rate, 1350)).toBe(true)
    expect(close(after.totalAssets, 10_000_000, 0.01)).toBe(true)
    expect(close(after.cash.usdAverageRate, 1350)).toBe(true)
  })

  it('달러가 없을 때 산 매수는 저장된 대체 환율을 쓴다', () => {
    const { buys } = resolveRates([usdBuy(5, 200, day(2), 1420)], [], [])
    expect(buys[0].rate).toBe(1420)
  })

  it('달러 매도: 원가 환율로 잡혀 매도 시점 환차손익 0, 총자산은 매매손익만큼만 는다', () => {
    const deposit = makeCash('deposit', 10_000_000)
    const ex = [exchange(1_350_000, 1000, day(0))]
    const snap = buildSnapshot({ buys: [usdBuy(5, 200, day(1))], sells: [usdSell(5, 240, day(5))], cash: [deposit, ...ex], settings: DEFAULT_SETTINGS })
    expect(close(snap.sells[0].rate, 1350)).toBe(true)
    const p = snap.positions[0]
    expect(close(p.pnlSplit(snap.sells[0]).fx, 0, 0.01)).toBe(true)
    expect(close(p.realizedProfit, 40 * 5 * 1350, 0.01)).toBe(true)
    expect(close(snap.totalAssets, 10_270_000, 0.01)).toBe(true)
    expect(close(snap.cash.usd, 1200)).toBe(true)
    expect(close(snap.cash.usdAverageRate, 1350)).toBe(true)
    expect(close(assetsAt(Infinity, snap.timeline), snap.totalAssets, 0.01)).toBe(true)
  })

  it('달러 → 원화 환전에서 환차손익 확정: $1,200 × (1,450 − 1,350) = +12만', () => {
    const deposit = makeCash('deposit', 10_000_000)
    const ex = exchange(1_620_000, 1200, day(0))
    const back = exchange(1_740_000, 1200, day(3), 'usdToKrw')
    const s = DEFAULT_SETTINGS
    const before = buildSnapshot({ buys: [], sells: [], cash: [deposit, ex], settings: s })
    const after = buildSnapshot({ buys: [], sells: [], cash: [deposit, ex, back], settings: s })
    expect(close(after.cash.realizedFx, 120_000, 0.01)).toBe(true)
    expect(close(after.totalAssets - before.totalAssets, 120_000, 0.01)).toBe(true)
    expect(close(after.cash.usd, 0)).toBe(true)
    expect(close(replayFx([], [], [deposit, ex, back]).exchangeFx.get(back.id), 120_000, 0.01)).toBe(true)
  })

  it('과거에 환전을 끼워 넣으면 그 뒤 매수 원가 환율이 바뀐다', () => {
    const ex1 = exchange(1_300_000, 1000, day(0))
    const buy = usdBuy(5, 200, day(5))
    expect(close(resolveRates([buy], [], [ex1]).buys[0].rate, 1300)).toBe(true)
    const ex2 = exchange(1_500_000, 1000, day(2))
    expect(close(resolveRates([buy], [], [ex1, ex2]).buys[0].rate, 1400)).toBe(true)
  })
})
