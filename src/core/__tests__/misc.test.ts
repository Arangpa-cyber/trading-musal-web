import { describe, expect, it } from 'vitest'
import { buildSnapshot } from '../analytics'
import { exportBackup, parseBackup } from '../backup'
import { cardPeriod, periodMonths, periods, yearToDate } from '../checklist'
import { calendarDays, defaultTradeDate, tradingDays } from '../dates'
import { buyDeletePlan, deletePlanMessage } from '../deletePlan'
import { importIosBackup } from '../importIos'
import { backfillClosedSells, mergeDuplicateOpenPositions, mergeOverlappingClosedPositions, syncAssetNames } from '../maintenance'
import { memoAnchorId, memoPreviews } from '../memo'
import { TradePosition, type TradeOutcome } from '../position'
import { DEFAULT_SETTINGS, sellReasonText, type Buy, type JournalData, type Sell } from '../types'
import { close, day, local, makeBuy, makeMemo, makeSell } from './helpers'

const plain = <T extends { rate: number }>(r: T) => {
  const { rate: _rate, ...rest } = r
  void _rate
  return rest
}

describe('보유일 · 기본 날짜 (Asia/Seoul)', () => {
  it('보유일은 시각 말고 날짜 칸 차이', () => {
    expect(tradingDays(local(2026, 10, 21, 23), local(2026, 10, 22, 9))).toBe(1)
    expect(tradingDays(local(2026, 10, 21, 9), local(2026, 10, 21, 23))).toBe(0)
    expect(tradingDays(local(2026, 10, 22, 9), local(2026, 10, 21, 9))).toBe(0)
    expect(calendarDays(local(2026, 10, 21, 23), local(2026, 10, 22, 9))).toBe(1)
  })
  it('보유일 = 거래일(주말 제외)', () => {
    const friday = local(2026, 10, 23, 15)
    const saturday = local(2026, 10, 24, 10)
    const monday = local(2026, 10, 26, 15)
    expect(tradingDays(friday, monday)).toBe(1)
    expect(tradingDays(saturday, monday)).toBe(1)
    expect(tradingDays(friday, saturday)).toBe(0)
    expect(tradingDays(saturday, local(2026, 10, 25, 10))).toBe(0)
    expect(tradingDays(friday, local(2026, 10, 30, 15))).toBe(5)
    expect(tradingDays(local(2026, 10, 21, 15), local(2026, 11, 4, 15))).toBe(10)
    expect(tradingDays(local(2026, 10, 21, 15), local(2026, 11, 7, 15))).toBe(12)
    expect(calendarDays(friday, monday)).toBe(3)
  })
  it('달러 보유 종목은 한국 월요일 오전(뉴욕 일요일)에 보유일이 늘지 않음', () => {
    const fridayBuy = local(2026, 10, 23, 15)
    const mondayMorning = local(2026, 10, 26, 10)
    expect(tradingDays(fridayBuy, defaultTradeDate('USD', mondayMorning))).toBe(0)
    expect(tradingDays(fridayBuy, defaultTradeDate('KRW', mondayMorning))).toBe(1)
  })
  it('달러 종목 기본 날짜 = 미국 거래일, 원화는 오늘', () => {
    const now = local(2026, 10, 22, 5, 10) // 뉴욕 10/21 16:10
    const d = new Date(defaultTradeDate('USD', now))
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 21, 5, 10])
    expect(defaultTradeDate('KRW', now)).toBe(now)
  })
})

describe('확인표 기간', () => {
  const date = (y: number, m: number, d: number) => local(y, m, d, 12)
  const outcome = (id: string, closed: number, ret: number): TradeOutcome => ({
    id, tradeId: id, assetName: '종목', lotLabel: '1-1', buyDate: closed, closeDate: closed,
    stepKey: id, sellId: id, order: 0, returnPercent: ret, tradingProfit: ret, stopGap: null,
  })

  it('1개월 — 거래 없는 달도 줄로 남고 최신이 맨 앞', () => {
    const list = [outcome('a', date(2026, 7, 3), 10), outcome('b', date(2026, 7, 20), -5), outcome('c', date(2026, 9, 1), 8)]
    const ps = periods(list, 1, date(2026, 10, 25))
    expect(ps.map((p) => p.label)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])
    expect(ps.map((p) => p.count)).toEqual([0, 1, 0, 2])
    expect(ps[3].winRate).toBe(50)
  })
  it('3·6·12개월은 1월부터 달력에 맞게', () => {
    const list = [outcome('a', date(2025, 11, 10), 5), outcome('b', date(2026, 2, 1), -3)]
    const now = date(2026, 10, 25)
    expect(periods(list, 3, now).map((p) => p.label)).toEqual(['2026 10–12월', '2026 7–9월', '2026 4–6월', '2026 1–3월', '2025 10–12월'])
    expect(periods(list, 6, now).map((p) => p.label)).toEqual(['2026 하반기', '2026 상반기', '2025 하반기'])
    expect(periods(list, 12, now).map((p) => p.count)).toEqual([1, 1])
    expect(periods([], 1, now)).toEqual([])
  })
  it('현황 카드 — 지금 기간에 거래가 없으면 거래가 있는 최근 기간', () => {
    const shown = cardPeriod(periods([outcome('a', date(2026, 8, 3), 10)], 1, date(2026, 10, 25)))
    expect(shown?.block.label).toBe('2026-08')
    expect(shown?.isCurrent).toBe(false)
    expect(periodMonths(20)).toBe(1)
    expect(periodMonths(3)).toBe(3)
  })
  it('YTD — 올해 판 매수만', () => {
    const list = [outcome('old', date(2025, 12, 30), 50), outcome('a', date(2026, 2, 3), 10), outcome('b', date(2026, 9, 9), -4), outcome('c', date(2026, 10, 1), 6)]
    const ytd = yearToDate(list, date(2026, 10, 25))
    expect(ytd.label).toBe('2026 YTD')
    expect(ytd.count).toBe(3)
    expect(ytd.avgWin).toBe(8)
    expect(ytd.maxWin).toBe(10)
    expect(yearToDate(list, date(2027, 1, 5)).count).toBe(0)
  })
})

describe('메모 위치', () => {
  it('작성 날짜 이전 가장 최근 기록, 같은 날이면 그날 마지막, 첫 기록보다 이르면 첫 기록', () => {
    const d = (n: number, h: number) => local(2026, 10, 10 + n, h)
    const records = [{ id: 'a', date: d(1, 9) }, { id: 'b', date: d(3, 9) }, { id: 'c', date: d(3, 15) }]
    expect(memoAnchorId(d(2, 0), records)).toBe('a')
    expect(memoAnchorId(d(3, 1), records)).toBe('c')
    expect(memoAnchorId(d(0, 0), records)).toBe('a')
    expect(memoAnchorId(d(9, 0), records)).toBe('c')
  })
  it('한 카드에 메모가 여러 개면 최신 하나만', () => {
    const older = makeMemo('p', day(1), '옛', 'buy')
    const newer = makeMemo('p', day(2), '새', 'buy')
    const records = new Map([['p', [{ id: 'b1', date: 0 }]]])
    expect(memoPreviews([newer, older], 'buy', records).get('b1')?.text).toBe('새')
    expect(memoPreviews([newer], 'sell', records).size).toBe(0)
  })
})

describe('매수 삭제 계획', () => {
  it('안 판 매수는 그 매수만, 판 매수는 그 매도도, 마지막 매수는 거래 전체 + 메모', () => {
    const a = plain(makeBuy({ tradeId: 'p', qty: 30, price: 100 })) as Buy
    const b = plain(makeBuy({ tradeId: 'p', date: day(1), qty: 15, price: 110 })) as Buy
    const sellB = plain(makeSell({ tradeId: 'p', date: day(2), qty: 15, price: 105, lots: [b] })) as Sell
    const memo = makeMemo('p', 0, '메모')
    const unsold = buyDeletePlan(a, [a, b], [sellB], [memo])
    expect(unsold.sells.length + unsold.memos.length).toBe(0)
    expect(unsold.deletesTrade || unsold.blockedReason !== null).toBe(false)
    const sold = buyDeletePlan(b, [a, b], [sellB], [memo])
    expect(sold.sells.map((s) => s.id)).toEqual([sellB.id])
    const only = buyDeletePlan(a, [a], [], [memo])
    expect(only.deletesTrade).toBe(true)
    expect(deletePlanMessage(only)).toContain('메모 1개')
  })
  it('판 매수 정보 없는 옛 매도 — 판 수량이 산 수량보다 많아지면 막는다', () => {
    const a = plain(makeBuy({ tradeId: 'p', qty: 30, price: 100 })) as Buy
    const b = plain(makeBuy({ tradeId: 'p', qty: 15, price: 110 })) as Buy
    const legacy = plain(makeSell({ tradeId: 'p', date: day(1), qty: 40, price: 120 })) as Sell
    expect(buyDeletePlan(b, [a, b], [legacy], []).blockedReason).not.toBeNull()
    expect(buyDeletePlan(a, [a, b], [legacy], []).blockedReason).not.toBeNull()
  })
})

describe('옛 데이터 보정', () => {
  const usdLot = (tradeId: string, d: number, qty: number, price: number, stop: number, rate: number) =>
    plain(makeBuy({ tradeId, date: day(d), asset: 'SPCX', qty, price, stopLoss: stop, currency: 'USD', rate })) as Buy

  it('같은 종목·통화로 따로 보유 중인 포지션을 먼저 산 쪽으로 합치고 손절가를 올린다', () => {
    const a = usdLot('a', 0, 60, 148.68, 138, 1369)
    const b = usdLot('b', 20, 62, 159.95, 147.2, 1384.3)
    const other = plain(makeBuy({ tradeId: 'x', asset: '삼성전자', qty: 10, price: 70_000 })) as Buy
    const memo = makeMemo('b', day(21), '추가매수')
    expect(mergeDuplicateOpenPositions([a, b, other], [], [memo])).toBe(1)
    expect(b.tradeId).toBe('a')
    expect(other.tradeId).toBe('x')
    expect(memo.tradeId).toBe('a')
    expect(close(a.stopLossPrice, 147.2)).toBe(true)
    const [p] = TradePosition.aggregate([{ ...a, rate: 1369 }, { ...b, rate: 1384.3 }], [])
    expect(p.remainingQuantity).toBe(122)
    expect(Math.abs(p.nativeAverageBuyPrice - 154.41) < 0.01).toBe(true)
    expect(mergeDuplicateOpenPositions([a, b, other], [], [])).toBe(0)
  })

  it('부분 매도가 있는 포지션·다른 통화는 합치지 않는다', () => {
    const a = usdLot('a', 0, 60, 148.68, 138, 1369)
    const b = usdLot('b', 20, 62, 159.95, 147.2, 1384.3)
    const sold = plain(makeSell({ tradeId: 'b', date: day(25), asset: 'SPCX', qty: 2, price: 170, currency: 'USD' })) as Sell
    expect(mergeDuplicateOpenPositions([a, b], [sold], [])).toBe(0)
    const krw = plain(makeBuy({ tradeId: 'k', asset: 'SPCX', qty: 1, price: 200_000 })) as Buy
    expect(mergeDuplicateOpenPositions([a, krw], [], [])).toBe(0)
  })

  it('다 판 포지션의 마지막 매도만 손절가·판 매수 채움(멱등), 보유 중이면 안 건드림', () => {
    const buys = [0, 1, 2].map((i) => plain(makeBuy({ tradeId: 'p', date: day(i), qty: [30, 15, 10][i], price: [100, 110, 120][i], stopLoss: 105 })) as Buy)
    const partial = plain(makeSell({ tradeId: 'p', date: day(3), qty: 20, price: 112 })) as Sell
    const last = plain(makeSell({ tradeId: 'p', date: day(4), qty: 35, price: 104 })) as Sell
    expect(backfillClosedSells(buys, [partial, last])).toBe(1)
    expect(close(last.stopLossAtSell, 105)).toBe(true)
    expect(partial.stopLossAtSell).toBe(0)
    expect(last.soldBuyIds).toEqual([])
    expect(backfillClosedSells(buys, [partial, last])).toBe(0)

    const single = plain(makeBuy({ tradeId: 's', qty: 10, price: 100, stopLoss: 95 })) as Buy
    const full = plain(makeSell({ tradeId: 's', date: day(1), qty: 10, price: 94 })) as Sell
    backfillClosedSells([single], [full])
    expect(full.soldBuyIds).toEqual([single.id])
    expect(close(full.stopLossAtSell, 95)).toBe(true)

    const open = plain(makeBuy({ tradeId: 'o', qty: 10, price: 100 })) as Buy
    const half = plain(makeSell({ tradeId: 'o', date: day(1), qty: 5, price: 110 })) as Sell
    expect(backfillClosedSells([open], [half])).toBe(0)
  })

  it('달바글로벌 — 갈린 이름 맞추고, 겹친 다 판 거래는 한 포지션 1-1·1-2·1-3', () => {
    const a = plain(makeBuy({ tradeId: 'A', asset: '달바글로벌', qty: 370, price: 204_185 })) as Buy
    const b = plain(makeBuy({ tradeId: 'B', date: day(58), asset: '달바글로벌', qty: 200, price: 275_000 })) as Buy
    const c = plain(makeBuy({ tradeId: 'C', date: day(58), asset: '달바글로벌', qty: 150, price: 261_473 })) as Buy
    const sc = plain(makeSell({ tradeId: 'C', date: day(73), asset: '달바글로벌2', qty: 150, price: 279_500, lots: [c] })) as Sell
    const sb = plain(makeSell({ tradeId: 'B', date: day(73) + 180_000, asset: '달바글로벌3', qty: 200, price: 279_500, lots: [b] })) as Sell
    const sa = plain(makeSell({ tradeId: 'A', date: day(73) + 200_000, asset: '달바글로벌', qty: 370, price: 279_500, lots: [a] })) as Sell
    const memo = { ...makeMemo('B', day(60), '메모'), assetName: '달바글로벌3' }
    const buys = [a, b, c]
    const sells = [sc, sb, sa]
    const rated = () => TradePosition.aggregate(buys.map((x) => ({ ...x, rate: 1 })), sells.map((x) => ({ ...x, rate: 1 })))
    const realizedBefore = rated().reduce((acc, p) => acc + (p.realizedProfit ?? 0), 0)
    const returnsBefore = rated().flatMap((p) => p.outcomes).map((o) => o.returnPercent).sort()

    expect(syncAssetNames(buys, sells, [memo])).toBe(3)
    expect(mergeOverlappingClosedPositions(buys, sells, [memo])).toBe(2)
    expect(new Set([...buys, ...sells, memo].map((r) => r.tradeId))).toEqual(new Set(['A']))
    const [p, ...rest] = rated()
    expect(rest.length).toBe(0)
    expect(p.orderedBuys.map((x) => x.quantity)).toEqual([370, 150, 200])
    expect(p.orderedBuys.map((x) => p.lotLabel(x))).toEqual(['1-1', '1-2', '1-3'])
    expect(p.outcomes.map((o) => o.returnPercent).sort()).toEqual(returnsBefore)
    expect(close(p.realizedProfit, realizedBefore)).toBe(true)
    expect(syncAssetNames(buys, sells, [memo])).toBe(0)
    expect(mergeOverlappingClosedPositions(buys, sells, [memo])).toBe(0)
  })

  it('다 판 뒤 다시 산 거래는 합치지 않는다 — 2-1', () => {
    const a = plain(makeBuy({ tradeId: 'A', asset: 'SPCX', qty: 10, price: 100 })) as Buy
    const sa = plain(makeSell({ tradeId: 'A', date: day(5), asset: 'SPCX', qty: 10, price: 90, lots: [a] })) as Sell
    const b = plain(makeBuy({ tradeId: 'B', date: day(10), asset: 'SPCX', qty: 5, price: 95 })) as Buy
    const sb = plain(makeSell({ tradeId: 'B', date: day(12), asset: 'SPCX', qty: 5, price: 99, lots: [b] })) as Sell
    expect(mergeOverlappingClosedPositions([a, b], [sa, sb], [])).toBe(0)
  })
})

describe('iOS 백업 가져오기', () => {
  const legacyJSON = {
    buys: [{
      id: '11111111-1111-1111-1111-111111111111', tradeID: 't1', date: '2020-01-01T00:00:00Z', assetName: '종목',
      quantity: 10, unitPrice: 100, buyReason: '돌파 매수', targetEntryPrice: 100, riskMode: '총자산 기준', riskPercent: 1,
      plannedRiskAmount: 0, stopLossPrice: 90, stopLossBasis: '기계적 손절선', riskRewardRatio: 2, targetPrice: 120,
      totalAssetsAtEntry: 0, isPending: false, fee: 50, tax: 30,
    }],
    sells: [{
      id: '22222222-2222-2222-2222-222222222222', tradeID: 't1', date: '2020-01-02T00:00:00Z', assetName: '종목',
      quantity: 10, unitPrice: 120, sellReason: '목표가 도달', reason: '', fee: 10, tax: 5,
    }],
    cashTransactions: [{ id: '33333333-3333-3333-3333-333333333333', date: '2020-01-01T00:00:00Z', type: '입금', amount: 1000, memo: '' }],
    profiles: [],
  }

  it('옛 백업(폐기된 키 有, journals 無)도 기본값으로 읽힌다', () => {
    const { data, report } = importIosBackup(legacyJSON)
    expect(report.buys).toBe(1)
    expect(data.journals).toEqual([])
    expect(data.settings).toEqual(DEFAULT_SETTINGS)
    expect(data.buys[0]).toMatchObject({ id: '11111111-1111-1111-1111-111111111111', tradeId: 't1', quantity: 10, fee: 50, currency: 'KRW', initialStopLossPrice: 0 })
    expect(data.cash[0]).toMatchObject({ type: 'deposit', currency: 'KRW' })
    // 옛 "목표가 도달"은 글자 그대로, 다 판 포지션의 마지막 매도는 판 매수·손절가가 채워진다
    expect(sellReasonText(data.sells[0])).toBe('목표가 도달')
    expect(data.sells[0].soldBuyIds).toEqual(['11111111-1111-1111-1111-111111111111'])
    expect(data.sells[0].stopLossAtSell).toBe(90)
  })

  it('매도 이유 여러 개는 선언 순서로, 메모 "보유중"은 보유로', () => {
    const json = {
      ...legacyJSON,
      sells: [{ ...legacyJSON.sells[0], sellReason: '강세 매도,손절가 도달' }],
      journals: [{ id: '44444444-4444-4444-4444-444444444444', tradeID: 't1', assetName: '종목', date: '2020-01-03T00:00:00Z', tags: ['공포'], text: '흔들렸다', context: '보유중' }],
      defaultRiskPercent: 1, maxStopLossPercent: 0, manualFxRate: 1400, manualFxRateDate: 1000,
    }
    const { data } = importIosBackup(json)
    expect(data.sells[0].sellReasons).toEqual(['stopLossHit', 'strengthSell'])
    expect(sellReasonText(data.sells[0])).toBe('손절가 도달 · 강세 매도')
    expect(data.journals[0]).toMatchObject({ context: 'holding', text: '흔들렸다' })
    expect(data.settings).toMatchObject({ defaultRiskPercent: 1, maxStopLossPercent: 0, manualFxRate: 1400, manualFxRateDate: 1_000_000 })
  })

  /** 토스 30주 — 지정가 기준으로 더 환전돼 $0.90이 남은 옛 자동 환전 매수. */
  const tossJSON = () => {
    const fx = 6_524_651 / 4804.19
    return {
      buys: [{
        id: 'AAAAAAAA-1111-1111-1111-111111111111', tradeID: 'spx', date: '2026-10-01T00:00:00Z', assetName: '스페이스X',
        quantity: 30, unitPrice: 159.95 * fx, buyReason: '돌파 매수', targetEntryPrice: 159.95 * fx, riskMode: '총자산 기준',
        riskPercent: 0.5, plannedRiskAmount: 0, stopLossPrice: 150 * fx, totalAssetsAtEntry: 10_000_000,
        currency: 'USD', exchangeRate: fx, fee: 4.79 * fx, tax: 0, krwAmount: 6_524_651, autoExchange: true,
        usdFromBalance: 159.95 * 30 + 4.79 - 4804.19,
      }],
      sells: [],
      cashTransactions: [{ id: 'BBBBBBBB-1111-1111-1111-111111111111', date: '2026-09-01T00:00:00Z', type: '입금', amount: 10_000_000, memo: '' }],
      profiles: [{ id: 'CCCCCCCC-1111-1111-1111-111111111111', nickname: '무명', createdAt: '2026-09-01T00:00:00Z', tradingRules: '손절은 칼같이' }],
    }
  }

  it('옛 자동 환전 매수 → 환전 1건 + 달러 매수: 원화·달러 예수금 그대로, 달러 값으로 저장', () => {
    const { data, report } = importIosBackup(tossJSON())
    expect(report.splitAutoExchangeBuys).toBe(1)
    expect(close(data.buys[0].unitPrice, 159.95)).toBe(true)
    expect(close(data.buys[0].stopLossPrice, 150)).toBe(true)
    expect(close(data.buys[0].fee, 4.79)).toBe(true)
    expect(data.profile).toMatchObject({ nickname: '무명', tradingRules: '손절은 칼같이' })
    const snap = buildSnapshot(data)
    expect(close(snap.cash.krw, 10_000_000 - 6_524_651, 0.01)).toBe(true)
    expect(close(snap.cash.usd, 0.9, 0.0001)).toBe(true)
    expect(Math.abs(snap.buys[0].rate - 1358.12) < 0.01).toBe(true)
  })

  it('대금이 원화로 들어온 옛 달러 매도 → 달러 매도 + 같은 원화로 환전', () => {
    const json = tossJSON()
    const fx = 1380
    const withSell = {
      ...json,
      buys: [{ ...json.buys[0], autoExchange: false, krwAmount: undefined, usdFromBalance: 0 }],
      cashTransactions: [...json.cashTransactions, { id: 'DDDDDDDD-1111-1111-1111-111111111111', date: '2026-09-30T00:00:00Z', type: '환전', amount: 6_524_651, memo: '', foreignAmount: 4804.19, exchangeDirection: '원→달러' }],
      sells: [{ id: 'EEEEEEEE-1111-1111-1111-111111111111', tradeID: 'spx', date: '2026-10-05T00:00:00Z', assetName: '스페이스X', quantity: 30, unitPrice: 175 * fx, sellReason: '강세 매도', reason: '', currency: 'USD', exchangeRate: fx, fee: 0, tax: 0 }],
    }
    const { data, report } = importIosBackup(withSell)
    expect(report.splitAutoExchangeSells).toBe(1)
    const snap = buildSnapshot(data)
    // 원화로 받은 매도 대금(175 × 30 × 1,380)이 원화 예수금에 그대로 들어오고, 달러 예수금은 매수 뒤 남은 $0.90
    expect(close(snap.cash.krw, 10_000_000 - 6_524_651 + 175 * 30 * 1380, 0.01)).toBe(true)
    expect(close(snap.cash.usd, 0.9, 0.0001)).toBe(true)
  })

  it('웹 백업 라운드트립 — 기록·판 매수 ID·설정이 그대로', () => {
    const { data } = importIosBackup(tossJSON())
    const full: JournalData = { ...data, settings: { ...data.settings, maxWeightPercent: 20 } }
    const back = parseBackup(exportBackup(full))
    expect(back.kind).toBe('web')
    expect(back.data).toEqual(full)
    expect(parseBackup(JSON.stringify(legacyJSON)).kind).toBe('ios')
    expect(() => parseBackup('{"hello":1}')).toThrow()
  })
})
