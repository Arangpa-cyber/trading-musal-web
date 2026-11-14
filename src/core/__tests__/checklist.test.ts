import { describe, expect, it } from 'vitest'
import {
  AVG_LOSS_WARN_PERCENT,
  blockAvgLossWarn,
  blockStubbornWarn,
  checkupMessage,
  deviations,
  summarize,
} from '../checklist'
import type { TradeOutcome } from '../position'
import { day } from './helpers'

// 수익 거래는 길게(20일), 손실 거래는 짧게(1일) 들고 있었다고 둔다 — 보유일 경고가 끼어들지 않게.
function mk(i: number, ret: number, buyDay = i, closeDay = i + (ret > 0 ? 20 : 1)): TradeOutcome {
  return {
    id: `t${i}`,
    tradeId: `t${i}`,
    assetName: `A${i}`,
    lotLabel: null,
    buyDate: day(buyDay),
    closeDate: day(closeDay),
    stepKey: `s${i}`,
    sellId: `s${i}`,
    order: 0,
    returnPercent: ret,
    tradingProfit: ret * 1000,
    stopGap: null,
  }
}
const list = (rets: number[]) => rets.map((r, i) => mk(i, r))

describe('확인표 — 기준 넘은 손실·경고', () => {
  it('기준(최대 손절폭)을 넘은 손실 횟수 — 기준이 꺼져 있으면 null', () => {
    const rets = [10, -3, -12, -11, 5, -10]
    expect(summarize(list(rets), null, 10).beyondCount).toBe(2) // −10%는 "넘은" 게 아니다
    expect(summarize(list(rets)).beyondCount).toBeNull()
  })
  it('평균 손실이 7%를 넘으면 주의', () => {
    expect(blockAvgLossWarn(summarize(list([10, -7])))).toBe(false)
    expect(blockAvgLossWarn(summarize(list([10, -AVG_LOSS_WARN_PERCENT - 0.5])))).toBe(true)
  })
  it('고집쟁이 — 최대 수익 < 최대 손실, 표본이 충분할 때만', () => {
    const rets = [8, ...Array(9).fill(-2), -15]
    expect(blockStubbornWarn(summarize(list(rets)))).toBe(true)
    expect(blockStubbornWarn(summarize(list([8, -15])))).toBe(false) // 표본 적음
  })
})

describe('확인표 — 통산 대비·점검 한 줄', () => {
  const overall = summarize(list([...Array(12).fill(10), ...Array(12).fill(-5)])) // 승률 50%, +10/−5
  it('눈에 띄게 달라진 칸만 나온다 — 평균 손실이 1%p 이상 커지면 worse', () => {
    const b = summarize(list([...Array(5).fill(10), ...Array(5).fill(-7)]))
    const dev = deviations(b, overall)
    expect(dev.avgLoss?.worse).toBe(true)
    expect(dev.winRate).toBeUndefined() // 승률은 그대로
  })
  it('표본이 적으면 비교하지 않는다', () => {
    expect(deviations(summarize(list([10, -9])), overall)).toEqual({})
  })
  it('점검 한 줄 — 기준 넘은 손실이 가장 먼저', () => {
    const b = summarize(list([...Array(5).fill(10), ...Array(4).fill(-3), -14]), '2026-11', 10)
    expect(checkupMessage(b, overall, 10)).toContain('기준(−10%)을 1회 넘었어요')
  })
  it('다음은 평균 손실 악화', () => {
    const b = summarize(list([...Array(5).fill(10), ...Array(5).fill(-7)]), '2026-11', 10)
    expect(checkupMessage(b, overall, 10)).toContain('평균 손실이 평소')
  })
  it('문제가 없으면 null', () => {
    expect(checkupMessage(summarize(list([10, -5, 10, -5, 10, -5, 10, -5, 10, -5]), 'x', 10), overall, 10)).toBeNull()
    expect(checkupMessage(summarize([]), overall, 10)).toBeNull()
  })
  it('승률이 크게 떨어지면 장세 안내', () => {
    // 승률 20%(+10/−5) — 평균 손실은 그대로
    const b = summarize(list([10, 10, ...Array(8).fill(-5)]), 'x', 10)
    expect(checkupMessage(b, overall, 10)).toContain('승률이 평소보다')
  })
})
