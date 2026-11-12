import { describe, expect, it } from 'vitest'
import { TradePosition } from '../position'
import {
  BEOMIN,
  IRYU,
  SAMRYU,
  WINDOW_SIZE,
  evaluateClosedPositions,
  lockedRiskPercent,
  nextStepHint,
  recoverStreak,
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
const winPos = (i: number) => closedPos(i, 100, 200) // +100
const lossPos = (i: number) => closedPos(i, 100, 50) // −50
const bigLossPos = (i: number) => closedPos(i, 100_000, 100)
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i)
const outcomes = (ps: TradePosition[]) => ps.flatMap((p) => p.outcomes)

describe('경지 판정 기본', () => {
  const four = [winPos(1), winPos(2), lossPos(3), lossPos(4)]
  it('승률: 2승 2패면 0.5', () => expect(close(winRate(outcomes(four)), 0.5)).toBe(true))
  it('손익비: 평균이익 ÷ 평균손실', () => expect(close(winLossRatio(outcomes(four)), 2)).toBe(true))
  it('완결 20건 미만이면 범인 + 진행률', () => {
    const r = evaluateClosedPositions(range(1, 6).map(winPos), 1_000_000)
    expect(r.currentTier).toBe(BEOMIN)
    expect(r.beominProgress).toEqual({ closed: 5, needed: WINDOW_SIZE })
  })
})

describe('경지 승급·강등', () => {
  const good = () => range(0, 24).map((i) => (i % 2 === 0 ? winPos(i) : lossPos(i)))
  it('총자산 3천만·승률50%·손익비2.0을 3회 연속 충족하면 이류', () => {
    const r = evaluateClosedPositions(good(), 30_000_000)
    expect(r.currentTier).toBe(IRYU)
    expect(r.juhwaipma.kind).toBe('normal')
  })
  it('총자산이 낮으면 삼류에 머문다', () => expect(evaluateClosedPositions(good(), 1_000_000).currentTier).toBe(SAMRYU))
  it('총자산이 3천만 → 1천만이면 삼류로 강등', () => {
    expect(evaluateClosedPositions(good(), 30_000_000).currentTier).toBe(IRYU)
    expect(evaluateClosedPositions(good(), 10_000_000).currentTier).toBe(SAMRYU)
  })
  it('승급 심사 — 2번 연속이면 2/3, 3번째에 승급하고 0으로', () => {
    const history = range(0, 21).map((i) => (i % 2 === 0 ? winPos(i) : lossPos(i)))
    const r = evaluateClosedPositions(history, 30_000_000)
    expect(r.currentTier).toBe(SAMRYU)
    expect(r.promoteStreak).toBe(2)
    const promoted = evaluateClosedPositions([...history, lossPos(21)], 30_000_000)
    expect(promoted.currentTier).toBe(IRYU)
    expect(promoted.promoteStreak).toBe(0)
  })
})

describe('주화입마 4단계', () => {
  it('성적이 좋으면 정상', () => {
    const r = evaluateClosedPositions(range(0, 24).map((i) => (i % 2 === 0 ? winPos(i) : lossPos(i))), 30_000_000)
    expect(r.juhwaipma.kind).toBe('normal')
  })
  it('딱 한 번 미달이면 역류(miss 1)', () => {
    const r = evaluateClosedPositions([...range(0, 23).map(winPos), bigLossPos(23)], 30_000_000)
    expect(r.juhwaipma).toEqual({ kind: 'yeokryu', miss: 1 })
  })
  it('연속 미달 5~9회면 주화(0.5% 제한)', () => {
    const r = evaluateClosedPositions(range(0, 25).map(lossPos), 30_000_000)
    expect(r.juhwaipma.kind).toBe('juhwa')
    expect(lockedRiskPercent(r.juhwaipma)).toBe(0.5)
  })
  it('연속 미달 10~14회면 입마(0.25% 제한)', () => {
    const r = evaluateClosedPositions(range(0, 30).map(lossPos), 30_000_000)
    expect(r.juhwaipma.kind).toBe('ipma')
    expect(lockedRiskPercent(r.juhwaipma)).toBe(0.25)
  })
  it('상위 경지에서 오래 무너지면 퇴보(한 단계 강등)', () => {
    const good = range(0, 24).map((i) => (i % 2 === 0 ? winPos(i) : lossPos(i)))
    const r = evaluateClosedPositions([...good, ...range(24, 69).map(lossPos)], 30_000_000)
    expect(r.currentTier).toBe(SAMRYU)
  })
  it('다음 단계 안내 — 남은 미달 횟수, 삼류 입마는 더 안 내려감', () => {
    expect(nextStepHint({ kind: 'yeokryu', miss: 3 }, SAMRYU)).toBe('2번 더 미달이면 주화(리스크 0.5% 제한)')
    expect(nextStepHint({ kind: 'juhwa', miss: 9, recover: 0 }, IRYU)).toBe('1번 더 미달이면 입마(리스크 0.25% 제한)')
    expect(nextStepHint({ kind: 'ipma', miss: 12, recover: 0 }, IRYU)).toBe('3번 더 미달이면 퇴보(한 단계 강등)')
    expect(nextStepHint({ kind: 'ipma', miss: 20, recover: 0 }, SAMRYU)).toBe('삼류에선 더 내려가지 않아요')
    expect(nextStepHint({ kind: 'normal' }, IRYU)).toBeNull()
  })
})

describe('운기조식(회복)', () => {
  it('5회 연속 회복하면 정상', () => {
    const before = range(0, 25).map(lossPos)
    expect(evaluateClosedPositions(before, 30_000_000).juhwaipma.kind).toBe('juhwa')
    const r = evaluateClosedPositions([...before, ...range(25, 45).map(winPos)], 30_000_000)
    expect(r.juhwaipma.kind).toBe('normal')
  })
  it('소액 이익 몇 건으로는 유지', () => {
    const r = evaluateClosedPositions([...range(0, 25).map(lossPos), ...range(25, 28).map((i) => closedPos(i, 100, 110))], 30_000_000)
    expect(r.juhwaipma.kind).not.toBe('normal')
  })
  it('운기조식 진행 중이면 회복 카운트가 올라간다', () => {
    const r = evaluateClosedPositions([...range(0, 25).map(lossPos), ...range(25, 34).map(winPos)], 30_000_000)
    expect(recoverStreak(r.juhwaipma)).toBe(3)
    expect(r.juhwaipma.kind).not.toBe('normal')
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
