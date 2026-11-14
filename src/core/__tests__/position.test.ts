import { describe, expect, it } from 'vitest'
import { makeSnapshot, recordWeights, totalAssetsAroundRecords, assetTimeline, pointAssets } from '../analytics'
import { summarize, winHoldDaysBaseline } from '../checklist'
import {
  chronological,
  exceedsMaxWeight,
  nextLotAfterSellText,
  outcomeHoldDays,
  outcomeIsWin,
  stopGapPercent,
  stopGapWarns,
  TradePosition,
} from '../position'
import { entryRiskExceeded, entryStopLossPrice, entryStopTooWide, type RatedBuy } from '../records'
import { raiseStopLoss } from '../maintenance'
import { close, day, lotSell, makeBuy, makeCash, makeSell } from './helpers'

const agg = (buys: RatedBuy[], sells = [] as ReturnType<typeof makeSell>[]) => TradePosition.aggregate(buys, sells)

describe('TradePosition 집계', () => {
  it('tradeId로 묶고 청산 여부·잔량·평단·수익률을 계산한다', () => {
    const [p] = agg([makeBuy({ tradeId: 't1', qty: 10, price: 100 })], [makeSell({ tradeId: 't1', qty: 10, price: 120 })])
    expect(p.isClosed).toBe(true)
    expect(p.remainingQuantity).toBe(0)
    expect(close(p.averageBuyPrice, 100)).toBe(true)
    expect(close(p.returnPercent, 20)).toBe(true)
  })

  it('부분 매도는 미청산으로 남고 잔량이 맞다', () => {
    const [p] = agg([makeBuy({ tradeId: 't1', qty: 10, price: 100 })], [makeSell({ tradeId: 't1', qty: 4, price: 130 })])
    expect(p.isClosed).toBe(false)
    expect(p.remainingQuantity).toBe(6)
    expect(p.returnPercent).toBeNull()
  })
})

describe('외화(USD) — 환율이 붙은 기록', () => {
  const usdBuy = (rate: number, price = 100) => makeBuy({ tradeId: 't1', asset: 'AAPL', qty: 10, price, currency: 'USD', rate })
  const usdSell = (rate: number, price: number) => makeSell({ tradeId: 't1', asset: 'AAPL', qty: 10, price, currency: 'USD', rate })

  it('원화로 환산돼 집계되고 거래 통화 평단이 나온다', () => {
    const [p] = agg([usdBuy(1300)], [usdSell(1300, 120)])
    expect(close(p.totalBuyAmount, 1_300_000)).toBe(true)
    expect(close(p.totalSellAmount, 1_560_000)).toBe(true)
    expect(close(p.nativeAverageBuyPrice, 100)).toBe(true)
    expect(p.isForeign).toBe(true)
    expect(close(p.returnPercent, 20)).toBe(true)
  })

  it('환차익은 원화 실현손익엔 들어가지만 실력 지표엔 안 섞인다', () => {
    const [p] = agg([usdBuy(1300)], [usdSell(1400, 100)])
    expect(p.realizedProfit! > 0).toBe(true)
    expect(close(p.returnPercent, 0)).toBe(true)
    expect(p.isWin).toBe(false)
    expect(close(p.tradingProfit, 0)).toBe(true)
  })

  it('손익 분해: 매매손익 + 환차손익 = 매도대금$×매도환율 − 원화 매수원가', () => {
    const [p] = agg([usdBuy(1300)], [usdSell(1400, 120)])
    const split = p.pnlSplitTotal
    expect(close(split.trading + split.fx, 1200 * 1400 - 1000 * 1300)).toBe(true)
    expect(close(split.trading, 200 * 1300)).toBe(true)
    expect(close(split.fx, 1200 * 100)).toBe(true)
  })

  it('원화 종목은 환차손익이 0이다', () => {
    const [p] = agg([makeBuy({ tradeId: 't1', qty: 10, price: 100 })], [makeSell({ tradeId: 't1', qty: 10, price: 120 })])
    expect(p.pnlSplitTotal.fx).toBe(0)
    expect(close(p.pnlSplitTotal.trading, 200)).toBe(true)
  })
})

describe('손절가 올리기(옛 데이터 정리)', () => {
  it('기존 보유분 손절가 올리기 — 낮은 것만 올린다', () => {
    const b = makeBuy({ tradeId: 'p', qty: 40, price: 145, stopLoss: 140, currency: 'USD', rate: 1350 })
    raiseStopLoss([b], 150)
    expect(close(b.stopLossPrice, 150)).toBe(true)
    raiseStopLoss([b], 120)
    expect(close(b.stopLossPrice, 150)).toBe(true)
  })
})

describe('리스크 관리', () => {
  const krwBuy = (stop: number, plannedRisk = 100) =>
    makeBuy({ tradeId: 'k', qty: 10, price: 100, stopLoss: stop, plannedRisk, totalAssets: 10_000 })

  it('보유 중 손절 리스크는 매수 건마다 자기 손절가로 합산한다', () => {
    const a = makeBuy({ tradeId: 'k', qty: 10, price: 100, stopLoss: 90 }) // −100
    const b = makeBuy({ tradeId: 'k', date: day(1), qty: 5, price: 120, stopLoss: 110 }) // −50
    const above = makeBuy({ tradeId: 'k', date: day(2), qty: 5, price: 130, stopLoss: 135 }) // 손절가가 매수가 위 → 0
    const [p] = agg([a, b, above])
    expect(close(p.openRiskKRW, 150)).toBe(true)
    // 판 매수 건은 빼고 센다 — 가장 최근 매수(above)를 팔면 그대로, b까지 팔면 100
    const sellAbove = makeSell({ tradeId: 'k', date: day(3), qty: 5, price: 140, lots: [above] })
    expect(close(agg([a, b, above], [sellAbove])[0].openRiskKRW, 150)).toBe(true)
    const sellBoth = makeSell({ tradeId: 'k', date: day(3), qty: 10, price: 140, lots: [b, above] })
    expect(close(agg([a, b, above], [sellBoth])[0].openRiskKRW, 100)).toBe(true)
  })

  it('달러 매수 건 리스크는 달러로 계산 후 그 건의 원가 환율로 환산', () => {
    const a = makeBuy({ tradeId: 'p', asset: 'SPCX', qty: 60, price: 148.68, stopLoss: 147.2, currency: 'USD', rate: 1369, totalAssets: 200_000_000 })
    const b = makeBuy({ tradeId: 'p', asset: 'SPCX', date: day(20), qty: 62, price: 159.95, stopLoss: 150, currency: 'USD', rate: 1357.1, totalAssets: 216_600_000 })
    const [p] = agg([a, b])
    const expected = (148.68 - 147.2) * 60 * 1369 + (159.95 - 150) * 62 * 1357.1
    expect(close(p.openRiskKRW, expected, 1)).toBe(true)
  })

  it('손절가가 건마다 따로 — 평균 손절가는 수량 가중평균', () => {
    const a = makeBuy({ tradeId: 'k', qty: 10, price: 100, stopLoss: 90 })
    const b = makeBuy({ tradeId: 'k', date: day(1), qty: 30, price: 120, stopLoss: 110 })
    expect(close(TradePosition.averageStop([a, b]), (900 + 3300) / 40)).toBe(true)
    expect(TradePosition.averageStop([])).toBeNull()
  })

  it('진입 시 손절가는 손절가를 올려도 그대로', () => {
    const b = krwBuy(90)
    raiseStopLoss([b], 110)
    b.stopLossPrice = 120 // 현황에서 고침
    expect(entryStopLossPrice(b)).toBe(90)
    const legacy = { ...b, initialStopLossPrice: 0 }
    expect(entryStopLossPrice(legacy)).toBe(120)
  })

  it('현재가 기록 → 매수 건 수익률·현재수익, 7일 넘으면 낡은 값', () => {
    const b = krwBuy(90)
    expect(agg([b])[0].mark).toBeNull()
    const now = day(100)
    const p = agg([{ ...b, markPrice: 120, markDate: now - day(3) }])[0]
    expect(close(p.lotReturn(b, p.mark!.price), 20)).toBe(true)
    expect(close(p.lotProfit(b, p.mark!.price), 200)).toBe(true)
    expect(p.isMarkStale(now)).toBe(false)
    expect(agg([{ ...b, markPrice: 120, markDate: now - day(8) }])[0].isMarkStale(now)).toBe(true)
  })

  it('계좌기여율 = 매매손익 ÷ 진입 시 총자산', () => {
    const sell = makeSell({ tradeId: 'k', date: day(1), qty: 10, price: 130 })
    const p = agg([krwBuy(90)], [sell])[0]
    expect(close(p.accountContribution(sell), 3)).toBe(true)
    expect(p.pyramidContribution).toBeNull()
    const q = agg([makeBuy({ tradeId: 'k', qty: 10, price: 100, stopLoss: 90, plannedRisk: 100 })], [sell])[0]
    expect(q.accountContribution(sell)).toBeNull()
  })

  it('계좌기여율이 진입 리스크율보다 더 잃으면 경고, 수익쿠션은 판정 안 함', () => {
    for (const [price, warn] of [[89, true], [90, false], [89.6, false]] as const) {
      const s = makeSell({ tradeId: 'k', date: day(1), qty: 10, price })
      const p = agg([krwBuy(90)], [s])[0]
      expect(p.entryRiskPercent).toBe(1)
      expect(p.exceededEntryRisk(s)).toBe(warn)
    }
    const cushion = makeBuy({ tradeId: 'k', qty: 10, price: 100, stopLoss: 90, riskMode: 'profitCushion', riskPercent: 0, plannedRisk: 100, totalAssets: 10_000 })
    const s = makeSell({ tradeId: 'k', date: day(1), qty: 10, price: 80 })
    const c = agg([cushion], [s])[0]
    expect(c.entryRiskPercent).toBeNull()
    expect(c.exceededEntryRisk(s)).toBe(false)
  })

  it('매수 카드 경고 — 허용손실 초과·손절폭 한도', () => {
    expect(entryRiskExceeded(krwBuy(90, 100))).toBe(false)
    expect(entryRiskExceeded(krwBuy(90, 80))).toBe(true)
    expect(entryStopTooWide(krwBuy(90), 10)).toBe(false)
    expect(entryStopTooWide(krwBuy(88), 10)).toBe(true)
    expect(entryStopTooWide(krwBuy(88), 0)).toBe(false)
    const legacy = { ...krwBuy(80, 50), initialStopLossPrice: 0 }
    expect(entryRiskExceeded(legacy) || entryStopTooWide(legacy, 10)).toBe(false)
  })

  it('물타기 — 평단 아래 추가 매수만 경고, 첫 매수·전량 매도 뒤 재매수는 아님', () => {
    const first = makeBuy({ tradeId: 'w', qty: 10, price: 100 })
    const down = makeBuy({ tradeId: 'w', date: day(1), qty: 10, price: 90 })
    const up = makeBuy({ tradeId: 'w', date: day(2), qty: 10, price: 110 })
    const p = new TradePosition('w', '종목', [first, down, up], [])
    expect(p.isAveragingDown(first)).toBe(false)
    expect(p.isAveragingDown(down)).toBe(true)
    expect(p.isAveragingDown(up)).toBe(false)
    const sellAll = makeSell({ tradeId: 'x', date: day(1), qty: 10, price: 100 })
    const rebuy = makeBuy({ tradeId: 'x', date: day(2), qty: 10, price: 50 })
    const q = new TradePosition('x', '종목', [makeBuy({ tradeId: 'x', qty: 10, price: 100 }), rebuy], [sellAll])
    expect(q.isAveragingDown(rebuy)).toBe(false)
  })

  it('손실 오래 버팀 기준 — 수익 거래 5건 이상일 때만', () => {
    const closed = (id: string, days: number, exit: number) => {
      const b = makeBuy({ tradeId: id, qty: 1, price: 100 })
      return new TradePosition(id, '종목', [b], [makeSell({ tradeId: id, date: day(days), qty: 1, price: exit })])
    }
    const wins = [0, 1, 2, 3, 4].map((i) => closed(`w${i}`, 10 + i * 5, 110))
    const loss = closed('l', 40, 90)
    expect(winHoldDaysBaseline([...wins.slice(0, 4), loss].flatMap((p) => p.outcomes))).toBeNull()
    // 1970-01-01(목)부터 달력 10·15·20·25·30일 = 거래일 6·11·14·17·21 → 평균 13.8
    // (iOS 테스트는 보유일이 거래일로 바뀌기 전 기대값 20이 남아 있다)
    expect(close(winHoldDaysBaseline([...wins, loss].flatMap((p) => p.outcomes)), 13.8)).toBe(true)
  })

  it('최대 비중 — 25% 한도에 26%는 경고, 0이면 끔', () => {
    expect(exceedsMaxWeight(26, 25)).toBe(true)
    expect(exceedsMaxWeight(25, 25)).toBe(false)
    expect(exceedsMaxWeight(80, 0)).toBe(false)
    expect(exceedsMaxWeight(null, 25)).toBe(false)
  })

  it('손절가대비 — 매도 시점 손절가 기준, 옛 기록(0)은 지금 손절가', () => {
    const deep = makeSell({ tradeId: 'k', date: day(1), qty: 10, price: 88.9, stopAtSell: 90 })
    const p = agg([krwBuy(95)], [deep])[0]
    expect(close(p.stopGap(deep), ((88.9 - 90) / 90) * 100)).toBe(true)
    expect(stopGapWarns(p.stopGap(deep))).toBe(true)
    expect(stopGapWarns(stopGapPercent(89.2, 90))).toBe(false)
    const legacy = makeSell({ tradeId: 'k', date: day(1), qty: 10, price: 95 })
    const q = agg([krwBuy(95)], [legacy])[0]
    expect(close(q.stopAtSell(legacy), 95)).toBe(true)
    expect(close(q.stopGap(legacy), 0)).toBe(true)
  })

  it('확인표 손실 거래 평균 손절가대비 — 수량 가중, 수익 거래 제외', () => {
    const position = (id: string, exits: [number, number][], stop: number) => {
      const b = makeBuy({ tradeId: id, qty: exits.reduce((a, e) => a + e[0], 0), price: 100 })
      const sells = exits.map(([qty, price], i) => makeSell({ tradeId: id, date: day(i + 1), qty, price, stopAtSell: stop }))
      return new TradePosition(id, '종목', [b], sells)
    }
    const a = position('a', [[3, 90], [1, 86]], 90)
    const b = position('b', [[1, 90]], 90)
    const c = position('c', [[1, 120]], 90)
    const expectedA = (0 * 3 + ((86 - 90) / 90) * 100) / 4
    expect(close(a.averageStopGap, expectedA)).toBe(true)
    expect(close(summarize([a, b, c].flatMap((p) => p.outcomes)).avgLossStopGap, expectedA / 2)).toBe(true)
  })

  it('피라미딩 기여 — 분모는 첫 매수 때 총자산, 수수료 포함', () => {
    const first = makeBuy({ tradeId: 'py', qty: 100, price: 10_000, stopLoss: 9_500, riskPercent: 0.5, plannedRisk: 50_000, totalAssets: 10_000_000 })
    const pyramid = makeBuy({ tradeId: 'py', date: day(5), qty: 100, price: 11_000, stopLoss: 10_500, riskMode: 'profitCushion', riskPercent: 0, plannedRisk: 50_000, totalAssets: 10_050_000 })
    const s1 = makeSell({ tradeId: 'py', date: day(10), qty: 100, price: 12_000 })
    const s2 = makeSell({ tradeId: 'py', date: day(12), qty: 100, price: 12_000 })
    const p = agg([first, pyramid], [s1, s2])[0]
    expect(close(p.accountContribution(s1), 1.5)).toBe(true)
    expect(close(p.accountContribution(s2), 1.5)).toBe(true)
    expect(close(p.pyramidContribution, 1.0)).toBe(true)
    expect(close(p.positionContribution, 3.0)).toBe(true)
    const open = agg([first, pyramid], [s1])[0]
    expect(open.pyramidContribution).toBeNull()

    const pf = agg([first, { ...pyramid, fee: 10_000 }], [s1, { ...s2, fee: 20_000 }])[0]
    expect(close(pf.positionContribution, 2.7)).toBe(true)
    expect(close(pf.pyramidContribution, 0.8)).toBe(true)
  })
})

describe('이동평균 평단', () => {
  const scenario = () => {
    const b1 = makeBuy({ tradeId: 'm', qty: 100, price: 10_000 })
    const s1 = makeSell({ tradeId: 'm', date: day(1), qty: 50, price: 11_000 })
    const b2 = makeBuy({ tradeId: 'm', date: day(2), qty: 100, price: 12_000 })
    return { buys: [b1, b2], sells: [s1] }
  }

  it('부분 매도 뒤 추가 매수해도 이미 한 매도의 손익은 그대로', () => {
    const { buys, sells } = scenario()
    const p = agg(buys, sells)[0]
    expect(close(p.costBasis(sells[0]), 500_000)).toBe(true)
    expect(close(p.pnlSplit(sells[0]).trading, 50_000)).toBe(true)
  })

  it('남은 평단은 (남은 50주 + 추가 100주) 평균', () => {
    const { buys, sells } = scenario()
    const p = agg(buys, sells)[0]
    expect(p.remainingQuantity).toBe(150)
    expect(close(p.averageBuyPrice, 1_700_000 / 150)).toBe(true)
    expect(close(p.positionCost, 1_700_000)).toBe(true)
    expect(close(assetTimeline(buys, sells, []).at(-1)?.investedAmount, 1_700_000)).toBe(true)
  })

  it('완결되면 매도별 원가 합 = 전체 매수금액', () => {
    const { buys, sells } = scenario()
    sells.push(makeSell({ tradeId: 'm', date: day(3), qty: 150, price: 13_000 }))
    const p = agg(buys, sells)[0]
    expect(p.isClosed).toBe(true)
    expect(close(sells.reduce((a, s) => a + p.costBasis(s), 0), p.totalBuyAmount)).toBe(true)
    expect(close(p.pnlSplitTotal.trading, p.realizedProfit!)).toBe(true)
  })

  it('매도 날짜가 매수보다 앞선 이상한 기록은 전체 평균으로 배분', () => {
    const b = makeBuy({ tradeId: 'x', date: day(1), qty: 10, price: 100 })
    const s = makeSell({ tradeId: 'x', qty: 4, price: 120 })
    const p = agg([b], [s])[0]
    expect(close(p.costBasis(s), 400)).toBe(true)
    expect(close(p.positionCost, 600)).toBe(true)
  })

  it('매도 수정 미리보기: 원가는 그 매도 시점 이동평균', () => {
    const b1 = makeBuy({ tradeId: 'e', qty: 100, price: 10_000 })
    const s1 = makeSell({ tradeId: 'e', date: day(1), qty: 50, price: 11_000 })
    const b2 = makeBuy({ tradeId: 'e', date: day(2), qty: 100, price: 12_000 })
    const p = agg([b1, b2], [s1])[0]
    expect(close(p.nativeCostPrice(s1), 10_000)).toBe(true)
    expect(close(p.pnlSplitEditing(s1, 40, 11_000 * 40).trading, 40_000)).toBe(true)
  })
})

describe('피라미딩별 기여 · 카드 비중', () => {
  const scenario = () => {
    const first = makeBuy({ tradeId: 't4', date: day(1), qty: 100, price: 10_000, stopLoss: 9_500, riskPercent: 0.5, plannedRisk: 50_000, totalAssets: 10_000_000 })
    const adds = [11_000, 12_000, 13_000].map((price, i) => makeBuy({ tradeId: 't4', date: day(i + 2), qty: 100, price }))
    return { buys: [first, ...adds], cash: [makeCash('deposit', 10_000_000)] }
  }

  it('4차 피라미딩 후 전량 매도: +4/+3/+2/+1%, 합 = 포지션 전체', () => {
    const sell = makeSell({ tradeId: 't4', date: day(10), qty: 400, price: 14_000 })
    const p = agg(scenario().buys, [sell])[0]
    const t = p.trancheContributions ?? []
    expect(t.length).toBe(4)
    expect([close(t[0], 4), close(t[1], 3), close(t[2], 2), close(t[3], 1)]).toEqual([true, true, true, true])
    expect(close(t.reduce((a, x) => a + x, 0), p.positionContribution!)).toBe(true)
    expect(close(p.pyramidContribution, 6)).toBe(true)
  })

  it('매수 카드 비중 = 매수 직후 누적 10→21→33→46%, 전량 매도 = 46% → 0', () => {
    const sell = makeSell({ tradeId: 't4', date: day(10), qty: 400, price: 14_000 })
    const { buys, cash } = scenario()
    const w = recordWeights(makeSnapshot(buys, [sell], cash))
    buys.forEach((b, i) => expect(close(w.afterBuy.get(b.id), [10, 21, 33, 46][i])).toBe(true))
    expect(close(w.aroundSell.get(sell.id)?.before, 46)).toBe(true)
    expect(close(w.aroundSell.get(sell.id)?.after, 0)).toBe(true)
  })

  it('나눠 판 첫 매도: 직전 46% → 직후 21.9%', () => {
    const s1 = makeSell({ tradeId: 't4', date: day(10), qty: 200, price: 14_000 })
    const s2 = makeSell({ tradeId: 't4', date: day(12), qty: 200, price: 14_000 })
    const { buys, cash } = scenario()
    const w = recordWeights(makeSnapshot(buys, [s1, s2], cash))
    expect(close(w.aroundSell.get(s1.id)?.before, 46)).toBe(true)
    expect(close(w.aroundSell.get(s1.id)?.after, (2_300_000 / 10_500_000) * 100)).toBe(true)
    expect(close(w.aroundSell.get(s2.id)?.before, (2_300_000 / 10_500_000) * 100)).toBe(true)
  })

  it('기록별 총자산의 마지막 직후 값 = 자산 추이 마지막 점', () => {
    const sell = makeSell({ tradeId: 't4', date: day(10), qty: 400, price: 14_000 })
    const { buys, cash } = scenario()
    const around = totalAssetsAroundRecords(buys, [sell], cash)
    const last = assetTimeline(buys, [sell], cash).at(-1)!
    expect(close(around.get(sell.id)?.after, pointAssets(last))).toBe(true)
    expect(close(around.get(sell.id)?.after, 11_000_000)).toBe(true)
  })
})

describe('매수별 매도', () => {
  /** 1-1 30주(100) · 1-2 15주(110) · 1-3 10주(120) */
  const pyramid = () => [
    makeBuy({ tradeId: 'p', date: day(0), qty: 30, price: 100 }),
    makeBuy({ tradeId: 'p', date: day(1), qty: 15, price: 110 }),
    makeBuy({ tradeId: 'p', date: day(2), qty: 10, price: 120 }),
  ]

  it('판 매수는 다시 고를 수 없고, 매도 카드 결과는 판 매수만', () => {
    const buys = pyramid()
    const sell = lotSell([buys[2]], 115, day(3))
    const p = new TradePosition('p', '종목', buys, [sell])
    expect(p.availableLots().map((b) => b.id)).toEqual([buys[0].id, buys[1].id])
    expect(p.availableLots(sell).length).toBe(3)
    expect(p.remainingQuantity).toBe(45)
    const results = p.lotResults(sell)
    expect(results.map((r) => r.label)).toEqual(['1-3'])
    expect(close(results[0].percent, ((115 - 120) / 120) * 100)).toBe(true)
    expect(p.sellOfLot(buys[2])?.id).toBe(sell.id)
    expect(p.hasLegacySells).toBe(false)
    const all = lotSell(buys, 130, day(3))
    const q = new TradePosition('p', '종목', buys, [all])
    expect(q.lotResults(all).map((r) => r.label)).toEqual(['1-1', '1-2', '1-3'])
    expect(q.isClosed).toBe(true)
  })

  it('완료 거래 = 팔린 매수 하나 — 그 매수가 기준', () => {
    const buys = pyramid()
    const p = new TradePosition('p', '종목', buys, [lotSell([buys[2]], 115, day(3))])
    const [o, ...rest] = p.outcomes
    expect(rest.length).toBe(0)
    expect(o.lotLabel).toBe('1-3')
    expect(outcomeIsWin(o)).toBe(false)
    expect(close(o.returnPercent, ((115 - 120) / 120) * 100)).toBe(true)
    expect(close(o.tradingProfit, (115 - 120) * 10)).toBe(true)
    // 1970-01-03(토) 매수 → 01-04(일) 매도 = 거래일 0일(iOS 테스트엔 거래일 전환 전 기대값 1이 남아 있다)
    expect(outcomeHoldDays(o)).toBe(0)
  })

  it('다 판 포지션의 매수별 손익 합 = 포지션 실현손익', () => {
    const buys = pyramid()
    const p = new TradePosition('p', '종목', buys, [lotSell([buys[2]], 115, day(3)), lotSell([buys[0], buys[1]], 130, day(4))])
    expect(p.isClosed).toBe(true)
    expect(p.outcomes.length).toBe(3)
    expect(new Set(p.outcomes.map((o) => o.stepKey)).size).toBe(2)
    expect(close(p.outcomes.reduce((a, o) => a + o.tradingProfit, 0), p.realizedProfit!)).toBe(true)
  })

  it('같은 매도로 판 매수는 항상 1-1 → 1-2 → 1-3 순', () => {
    const buys = pyramid()
    const p = new TradePosition('p', '종목', buys, [lotSell(buys, 130, day(3))])
    expect(chronological([...p.outcomes].reverse()).map((o) => o.lotLabel)).toEqual(['1-1', '1-2', '1-3'])
  })

  it('최근 매수부터 판다 — 메뉴 글자·매수 건 이름', () => {
    const buys = pyramid()
    const p = new TradePosition('p', '종목', buys, [])
    const lots = p.availableLots()
    expect(TradePosition.lotsSelling(buys[2], lots).map((b) => b.id)).toEqual([buys[2].id])
    expect(TradePosition.lotsSelling(buys[1], lots).map((b) => b.id)).toEqual([buys[1].id, buys[2].id])
    expect(p.sellMenuText(buys[2])).toEqual({ title: '1-3 매도', detail: '10주' })
    expect(p.sellMenuText(buys[1])).toEqual({ title: '1-2까지 매도', detail: '1-2, 1-3 · 25주' })
    const sold = lotSell([buys[2]], 115, day(3))
    const q = new TradePosition('p', '종목', buys, [sold])
    expect(q.lotsLabel(sold.soldBuyIds)).toBe('1-3')
    expect(q.lotsLabel(buys.map((b) => b.id))).toBe('1-1, 1-2, 1-3')
    expect(q.lotsLabel([buys[0].id, buys[2].id])).toBe('1-1, 1-3')
  })

  it('N-n의 N = 같은 자산명의 몇 번째 거래 — 다 팔고 다시 사면 N+1', () => {
    const first = makeBuy({ tradeId: 'a', qty: 10, price: 100 })
    const firstSell = makeSell({ tradeId: 'a', date: day(1), qty: 10, price: 110, lots: [first] })
    const second = makeBuy({ tradeId: 'b', date: day(2), qty: 5, price: 120 })
    const other = makeBuy({ tradeId: 'c', date: day(3), asset: '다른종목', qty: 5, price: 50 })
    const byId = new Map(agg([second, first, other], [firstSell]).map((p) => [p.id, p]))
    expect(byId.get('a')?.lotLabel(first)).toBe('1-1')
    expect(byId.get('b')?.lotLabel(second)).toBe('2-1')
    expect(byId.get('c')?.lotLabel(other)).toBe('1-1')
  })

  it('피라미딩별 계좌기여율 — 매수별 실제 매도가로, 합계는 포지션 전체와 같다', () => {
    const buys = pyramid().map((b) => ({ ...b, totalAssetsAtEntry: 100_000 }))
    const p = new TradePosition('p', '종목', buys, [lotSell([buys[2]], 115, day(3)), lotSell([buys[0], buys[1]], 140, day(4))])
    const t = p.trancheContributions ?? []
    expect(t.length).toBe(3)
    expect(close(t[2], ((115 - 120) * 10) / 100_000 * 100)).toBe(true)
    expect(close(t[1], ((140 - 110) * 15) / 100_000 * 100)).toBe(true)
    expect(close(t.reduce((a, x) => a + x, 0), p.positionContribution!)).toBe(true)
  })

  it('매도일이 팔 매수의 매수일보다 빠르면 막고, 같은 날이면 매수 1초 뒤로', () => {
    const early = makeBuy({ tradeId: 't', qty: 1, price: 100 })
    const late = makeBuy({ tradeId: 't', date: day(2) + 600_000, qty: 1, price: 100 })
    expect(TradePosition.lotBoughtAfter(day(1), [early, late])?.id).toBe(late.id)
    expect(TradePosition.lotBoughtAfter(day(2), [early, late])).toBeNull()
    expect(TradePosition.sellDate(day(2) + 60_000, [early, late])).toBe(late.date + 1000)
    expect(TradePosition.sellDate(day(3), [early, late])).toBe(day(3))
  })

  it('이 매도 뒤 다음에 팔릴 매수 안내', () => {
    const buys = [makeBuy({ tradeId: 'p', qty: 3, price: 100 }), makeBuy({ tradeId: 'p', date: day(1), qty: 2, price: 110 })]
    const p = new TradePosition('p', '종목', buys, [])
    const lots = p.availableLots()
    expect(nextLotAfterSellText(p, lots, new Set([buys[1].id]))).toBe('이 매도 뒤 다음에 팔릴 매수: 1-1')
    expect(nextLotAfterSellText(p, lots, new Set(buys.map((b) => b.id)))).toBe('전량 매도 — 이 포지션이 끝나요')
    expect(nextLotAfterSellText(p, lots, new Set())).toBeNull()
  })
})
