import { describe, expect, it } from 'vitest'
import { TradePosition, type TradeOutcome } from '../position'
import {
  BEOMIN,
  IRYU,
  SAMRYU,
  WINDOW_SIZE,
  adjustedRatioOf,
  assetCeiling,
  evaluate,
  evaluateClosedPositions,
  losingStreak,
  lockedRiskPercent,
  nextStepHint,
  recoverStreak,
  tierName,
  windowStats,
  winLossRatio,
  winRate,
} from '../tier'
import { close, day, makeBuy, makeSell } from './helpers'

/** 완결 포지션 1건 — 손익 = sellPrice − buyPrice(수량 1), 날짜는 index 순. */
function closedPos(index: number, buyPrice: number, sellPrice: number): TradePosition {
  const id = `p${index}`
  const date = day(index)
  return TradePosition.aggregate(
    [makeBuy({ tradeId: id, date, qty: 1, price: buyPrice })],
    [makeSell({ tradeId: id, date, qty: 1, price: sellPrice })],
  )[0]
}
const winPos = (i: number) => closedPos(i, 100, 200) // +100%
const lossPos = (i: number) => closedPos(i, 100, 50) // −50%
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i)
const outcomes = (ps: TradePosition[]) => ps.flatMap((p) => p.outcomes)

/** 수익률(%)만 정한 완료 거래 — 포지션 1천만 원 기준 손익. 한 매도 = 한 거래. */
const POS = 10_000_000
function mk(i: number, ret: number): TradeOutcome {
  return {
    id: `t${i}`,
    tradeId: `t${i}`,
    assetName: `A${i}`,
    lotLabel: null,
    buyDate: day(i),
    closeDate: day(i) + 1000,
    stepKey: `s${i}`,
    sellId: `s${i}`,
    order: 0,
    returnPercent: ret,
    tradingProfit: (POS * ret) / 100,
    stopGap: null,
  }
}
const series = (n: number, retOf: (i: number) => number) => range(0, n).map((i) => mk(i, retOf(i)))
/** 총자산 고정 */
const ev = (list: TradeOutcome[], assets: number, limit = 10) => evaluate(list, [{ date: Number.NEGATIVE_INFINITY, assets }], limit)

const ILRYU = 3 // 일류
const JEOLJEONG = 4 // 절정

// 좋은 구간 — 승률 50%, +10% / −5% (손익비 2.0, 조정 손익비 2.0, 평균 손실 5%)
const good = (i: number) => (i % 2 === 0 ? 10 : -5)

describe('경지 판정 기본', () => {
  const four = [winPos(1), winPos(2), lossPos(3), lossPos(4)]
  it('승률: 2승 2패면 0.5', () => expect(close(winRate(outcomes(four)), 0.5)).toBe(true))
  it('손익비: 평균이익 ÷ 평균손실', () => expect(close(winLossRatio(outcomes(four)), 2)).toBe(true))
  it('조정 손익비 = 승률×평균수익 ÷ 패률×평균손실 (책 4장 예: 46%·14%/7% → 1.7)', () => {
    const rets = [...Array(46).fill(14), ...Array(54).fill(-7)]
    expect(close(adjustedRatioOf(rets), 1.7037, 0.001)).toBe(true)
    expect(close(adjustedRatioOf([10, -5]), 2)).toBe(true)
    expect(adjustedRatioOf([])).toBe(0)
    expect(adjustedRatioOf([-5, -3])).toBe(0)
    expect(adjustedRatioOf([5, 8])).toBe(99)
  })
  it('구간 통계 — 기준 넘은 손실 횟수와 대박 1건 제외 조정 손익비', () => {
    const rets = [70, 8, 8, 8, 8, 8, 8, 8, 8, 8, -7, -7, -7, -7, -7, -7, -7, -7, -7, -12]
    const s = windowStats(rets.map((r, i) => mk(i, r)), 10)
    expect(s.beyond).toBe(1) // −12%만 기준(10%)을 넘는다
    expect(close(s.avgWin, 14.2)).toBe(true)
    expect(s.adjusted).toBeGreaterThan(s.adjustedWithoutBest)
    expect(windowStats(rets.map((r, i) => mk(i, r)), 0).beyond).toBe(0) // 기준이 꺼져 있으면 0
  })
  it('완결 20건 미만이면 범인 + 진행률', () => {
    const r = evaluateClosedPositions(range(1, 6).map(winPos), 1_000_000)
    expect(r.currentTier).toBe(BEOMIN)
    expect(r.beominProgress).toEqual({ closed: 5, needed: WINDOW_SIZE })
    expect(r.promotion).toBeNull()
  })
  it('연패 횟수 — 매도 1회당 한 번, 순손익 기준', () => {
    expect(losingStreak(series(5, (i) => (i < 2 ? 10 : -5)))).toBe(3)
    expect(losingStreak(series(3, () => 10))).toBe(0)
  })
})

describe('경지 승급 — 총자산 + 조정 손익비 + 손익비 + 손실 통제 + 증거 구간', () => {
  it('20건 구간 1개를 통과하면 이류(총자산 3천만 이상)', () => {
    const r = ev(series(20, good), 30_000_000)
    expect(r.currentTier).toBe(IRYU)
    expect(r.juhwaipma.kind).toBe('normal')
  })
  it('총자산이 모자라면 삼류에 머문다', () => expect(ev(series(20, good), 1_000_000).currentTier).toBe(SAMRYU))
  it('일류는 구간 2개(40건) — 39건까지는 이류', () => {
    expect(ev(series(39, good), 100_000_000).currentTier).toBe(IRYU)
    expect(ev(series(40, good), 100_000_000).currentTier).toBe(ILRYU)
  })
  it('승률이 낮아도 손익비가 높아 기대값이 크면 오른다(승률 하한 없음 — 40%·손익비 3)', () => {
    // 10건 중 4승(+15%)·6패(−5%): 승률 40%, 손익비 3.0, 조정 손익비 2.0
    const list = series(40, (i) => (i % 5 < 2 ? 15 : -5))
    expect(ev(list, 100_000_000).currentTier).toBeGreaterThanOrEqual(ILRYU)
  })
  it('평균 손실이 크면 안 오른다(평균 −12% > 이류 한도 10%)', () => {
    // 승률 50%, +30% / −12% → 조정 손익비 2.5지만 평균 손실 12%
    expect(ev(series(20, (i) => (i % 2 === 0 ? 30 : -12)), 30_000_000, 0).currentTier).toBe(SAMRYU)
  })
  it('기준을 넘은 손실이 많으면 일류에 못 오른다(20건 중 2건까지 허용)', () => {
    // 손실 10건 중 3건이 −12%(기준 10% 초과), 나머지 −3%
    const bad = (i: number) => (i % 2 === 0 ? 14 : i % 6 === 1 ? -12 : -3)
    expect(ev(series(40, bad), 100_000_000, 10).currentTier).toBe(IRYU)
    expect(ev(series(40, bad), 100_000_000, 0).currentTier).toBeGreaterThanOrEqual(ILRYU) // 기준이 꺼지면 이 조건은 뺀다
  })
  it('절정부터는 대박 1건을 빼도 한 단계 아래 기준을 넘어야 한다', () => {
    // 20건마다 +70% 한 건 — 대박 포함 조정 손익비 2.03(절정 통과)이지만 빼면 1.03(일류 기준 1.3 미달)
    const lucky = (i: number) => (i % 2 === 0 ? (i % 20 === 0 ? 70 : 8) : -7)
    expect(ev(series(60, lucky), 300_000_000).currentTier).toBe(ILRYU)
    // 대박 없이 꾸준히 같은 평균(+14.2% / −7%)이면 절정
    const steady = (i: number) => (i % 2 === 0 ? 14.2 : -7)
    expect(ev(series(60, steady), 300_000_000).currentTier).toBe(JEOLJEONG)
  })
  it('총자산 한도가 경지 상한 — 3억이면 절정까지', () => {
    expect(ev(series(100, good), 300_000_000).currentTier).toBeLessThanOrEqual(JEOLJEONG)
    expect(assetCeiling(29_999_999)).toBe(SAMRYU)
    expect(assetCeiling(30_000_000)).toBe(IRYU)
    expect(assetCeiling(1_000_000_000_000)).toBe(8)
  })
  it('승급 심사 정보 — 막힌 조건과 구간별 통과', () => {
    const r = ev(series(30, good), 100_000_000)
    expect(tierName(r.currentTier)).toBe('이류')
    expect(r.promotion?.nextTier).toBe(ILRYU)
    expect(r.promotion?.windows).toEqual([null, true]) // 2구간 필요 — 20건 구간 1개만 있다
    expect(r.promotion?.conditions.every((c) => c.met)).toBe(true)
    expect(r.promotion?.ready).toBe(false)
  })
})

describe('경지 강등', () => {
  it('유지 기준(현재 경지의 90%) 미달 구간이 2개 연속이면 한 단계 강등', () => {
    const mediocre = (i: number) => (i % 2 === 0 ? 6 : -5) // 손익비 1.2 — 일류 유지 기준(1.8) 미달, 그래도 돈은 번다
    const list = (n: number) => series(n, (i) => (i < 40 ? good(i) : mediocre(i)))
    expect(ev(list(40), 100_000_000).currentTier).toBe(ILRYU)
    expect(ev(list(60), 100_000_000).currentTier).toBe(ILRYU) // 미달 구간이 아직 1개
    expect(ev(list(80), 100_000_000).currentTier).toBe(IRYU)
    expect(ev(list(80), 100_000_000).juhwaipma.kind).toBe('normal') // 돈은 벌고 있으니 주화입마는 아님
  })
  it('유지 심사 정보', () => {
    const list = series(60, (i) => (i < 40 ? good(i) : i % 2 === 0 ? 6 : -5))
    expect(ev(list, 100_000_000).keep).toEqual({ failedWindows: 1, needed: 2 })
  })
  it('총자산이 경지 최소 밑으로 떨어지면 즉시 강등 — 출금으로 줄어도 반영', () => {
    const list = series(40, good)
    const last = list[list.length - 1].closeDate
    expect(ev(list, 100_000_000).currentTier).toBe(ILRYU)
    const withdrawn = evaluate(list, [{ date: Number.NEGATIVE_INFINITY, assets: 100_000_000 }, { date: last + day(1), assets: 20_000_000 }], 10)
    expect(withdrawn.currentTier).toBe(SAMRYU)
    // 다시 입금해 자산이 돌아와도 증거 없이 되돌아오지는 않는다(마지막 점이 입금이면 경지 최소만 다시 넘을 뿐)
    const redeposit = evaluate(
      list,
      [
        { date: Number.NEGATIVE_INFINITY, assets: 100_000_000 },
        { date: last + day(1), assets: 20_000_000 },
        { date: last + day(2), assets: 120_000_000 },
      ],
      10,
    )
    expect(redeposit.currentTier).toBe(SAMRYU)
  })
  it('자산 여유 — 경지 최소 대비 몇 % 위인지', () => {
    const r = ev(series(20, good), 33_000_000)
    expect(r.assetFloor?.minAssets).toBe(30_000_000)
    expect(close(r.assetFloor?.margin, 0.1)).toBe(true)
  })
})

describe('주화입마 4단계', () => {
  // 좋은 구간 40건(일류) 뒤 연속 손절 −5%
  const crash = (n: number) => series(n, (i) => (i < 40 ? good(i) : -5))
  it('성적이 좋으면 정상', () => expect(ev(series(24, good), 30_000_000).juhwaipma.kind).toBe('normal'))
  it('7연패면 역류(miss 1) — 최근 20건·10건이 둘 다 마이너스가 돼야 시작', () => {
    expect(ev(crash(46), 100_000_000).juhwaipma.kind).toBe('normal')
    expect(ev(crash(47), 100_000_000).juhwaipma).toEqual({ kind: 'yeokryu', miss: 1 })
  })
  it('연속 미달 5~9회면 주화', () => expect(ev(crash(51), 100_000_000).juhwaipma.kind).toBe('juhwa'))
  it('연속 미달 10~14회면 입마', () => expect(ev(crash(56), 100_000_000).juhwaipma.kind).toBe('ipma'))
  it('15회가 되면 퇴보 — 한 단계 강등 + 운기조식 시작', () => {
    const r = ev(crash(61), 100_000_000)
    expect(r.currentTier).toBe(IRYU)
    expect(r.juhwaipma).toEqual({ kind: 'toebo', recover: 0 })
  })
  it('삼류 바닥에서는 퇴보해도 더 안 내려가고 입마에 머문다', () => {
    const r = ev(series(60, () => -5), 1_000_000)
    expect(r.currentTier).toBe(SAMRYU)
    expect(r.juhwaipma.kind).toBe('ipma')
  })
  it('리스크 제한은 평소 리스크율의 배수 — 주화 ×0.5, 입마·퇴보 ×0.25', () => {
    expect(lockedRiskPercent({ kind: 'juhwa', miss: 5, recover: 0 }, 1)).toBe(0.5)
    expect(lockedRiskPercent({ kind: 'ipma', miss: 10, recover: 0 }, 1)).toBe(0.25)
    expect(lockedRiskPercent({ kind: 'toebo', recover: 0 }, 2)).toBe(0.5)
    expect(lockedRiskPercent({ kind: 'juhwa', miss: 5, recover: 0 }, 0.5)).toBe(0.25) // 기본 리스크율(0.5%)도 실제로 줄어든다
    expect(lockedRiskPercent({ kind: 'yeokryu', miss: 2 }, 1)).toBeNull()
    expect(lockedRiskPercent({ kind: 'normal' }, 1)).toBeNull()
    expect(lockedRiskPercent({ kind: 'juhwa', miss: 5, recover: 0 }, 0)).toBeNull()
  })
  it('다음 단계 안내 — 남은 미달 횟수, 삼류 입마는 더 안 내려감', () => {
    expect(nextStepHint({ kind: 'yeokryu', miss: 3 }, SAMRYU)).toBe('2번 더 미달이면 주화(리스크를 평소의 절반으로 제한)')
    expect(nextStepHint({ kind: 'juhwa', miss: 9, recover: 0 }, IRYU)).toBe('1번 더 미달이면 입마(평소의 1/4로 제한)')
    expect(nextStepHint({ kind: 'ipma', miss: 12, recover: 0 }, IRYU)).toBe('3번 더 미달이면 퇴보(한 단계 강등)')
    expect(nextStepHint({ kind: 'ipma', miss: 20, recover: 0 }, SAMRYU)).toBe('삼류에선 더 내려가지 않아요')
    expect(nextStepHint({ kind: 'normal' }, IRYU)).toBeNull()
  })
  it('승급 심사는 주화입마 중에 멈춘다', () => {
    // 연패로 주화 단계에 들어가면, 자산이 충분해도 그 사이 승급하지 않는다
    const before = ev(crash(46), 1_000_000_000).currentTier
    const r = ev(crash(55), 1_000_000_000)
    expect(['juhwa', 'ipma']).toContain(r.juhwaipma.kind)
    expect(r.currentTier).toBe(before)
  })
})

describe('회복 중에는 옛 연패 때문에 강등되지 않는다(최근 10건도 마이너스여야 심해짐)', () => {
  // 40건 좋음 → 13연패 → 다시 평소 실력
  const recovering = (n: number) => series(n, (i) => (i < 40 ? good(i) : i < 53 ? -5 : good(i)))
  it('연패 직후 평소 실력으로 돌아오면 퇴보로 내려가지 않고 운기조식을 센다', () => {
    const r = ev(recovering(60), 100_000_000)
    expect(r.currentTier).toBe(ILRYU)
    expect(r.juhwaipma.kind).not.toBe('toebo')
  })
  it('운기조식 5회 연속 회복하면 정상', () => {
    const before = ev(recovering(58), 100_000_000)
    expect(['juhwa', 'ipma']).toContain(before.juhwaipma.kind)
    expect(recoverStreak(before.juhwaipma)).not.toBeNull()
    expect(ev(recovering(70), 100_000_000).juhwaipma.kind).toBe('normal')
  })
  it('소액 이익 몇 건으로는 유지', () => {
    const list = [...series(40, good), ...series(15, () => -5).map((_, k) => mk(40 + k, -5)), ...range(55, 58).map((i) => mk(i, 1))]
    expect(ev(list, 100_000_000).juhwaipma.kind).not.toBe('normal')
  })
})

describe('경지 연속 횟수는 매도 1회당 한 번', () => {
  it('매수 4건을 한 번에 팔아도 주화입마 사다리는 한 칸', () => {
    const singles = range(0, 20).map((i) => {
      const b = makeBuy({ tradeId: `s${i}`, date: day(i), qty: 1, price: 100 })
      const s = makeSell({ tradeId: `s${i}`, date: day(i + 0.5), qty: 1, price: 90, lots: [b] })
      return new TradePosition(`s${i}`, '종목', [b], [s])
    })
    expect(evaluateClosedPositions(singles, 30_000_000).juhwaipma).toEqual({ kind: 'yeokryu', miss: 1 })
    const lots = range(0, 4).map((i) => makeBuy({ tradeId: 'm', date: day(30 + i), qty: 1, price: 100 + i }))
    const sellAll = makeSell({ tradeId: 'm', date: day(40), qty: 4, price: 90, lots })
    const multi = new TradePosition('m', '종목', lots, [sellAll])
    expect(evaluateClosedPositions([...singles, multi], 30_000_000).juhwaipma).toEqual({ kind: 'yeokryu', miss: 2 })
  })
})
