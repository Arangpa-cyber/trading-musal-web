// 확인표(미너비니 Monthly Tracker) — 완료 거래를 매도일 기준 달력 기간(1·2·3·6·12개월)으로 나눈 %기준 성과.
import { chronological, outcomeHoldDays, outcomeIsWin, type TradeOutcome } from './position'
import type { Millis } from './types'

export interface ChecklistBlock {
  /** "2026-10", "2026 7–9월" … 통산 요약은 null. */
  label: string | null
  count: number
  periodStart: Millis | null
  periodEnd: Millis | null
  /** 평균 수익률(%) */
  avgWin: number | null
  /** 평균 손실률(%), 음수 */
  avgLoss: number | null
  /** 승률(%) */
  winRate: number
  maxWin: number | null
  maxLoss: number | null
  avgWinHoldDays: number | null
  avgLossHoldDays: number | null
  /** 손실 거래 평균 손절가대비(%) */
  avgLossStopGap: number | null
}

/** 손익비 = 평균 수익률 ÷ |평균 손실률|. */
export function blockWinLossRatio(b: ChecklistBlock): number | null {
  if (b.avgWin === null || b.avgLoss === null || b.avgLoss === 0) return null
  return b.avgWin / Math.abs(b.avgLoss)
}

/** 조정 손익비 = (승률 × 평균 수익) ÷ (패률 × 평균 손실) — 1 초과면 통계적 우위. */
export function blockAdjustedRatio(b: ChecklistBlock): number | null {
  if (b.avgWin === null || b.avgLoss === null || b.avgLoss === 0) return null
  const lossRate = (100 - b.winRate) / 100
  if (lossRate <= 0) return null
  return ((b.winRate / 100) * b.avgWin) / (lossRate * Math.abs(b.avgLoss))
}

/** 손실 거래 평균 보유일이 수익 거래보다 길면 경고(처분효과). */
export function blockHoldWarning(b: ChecklistBlock): boolean {
  return b.avgWinHoldDays !== null && b.avgLossHoldDays !== null && b.avgLossHoldDays > b.avgWinHoldDays
}

/** 기간 단위 선택지 — 12의 약수만(1월부터 달력에 맞게 나뉜다). */
export const PERIOD_OPTIONS = [1, 2, 3, 6, 12]

/** 저장값 해석 — 선택지에 없으면 1개월. */
export function periodMonths(stored: number): number {
  return PERIOD_OPTIONS.includes(stored) ? stored : 1
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null)

/** 그 날짜가 속한 기간의 첫날(그 달 1일 0시). */
export function periodStart(date: Millis, months: number): Millis {
  const d = new Date(date)
  const month = Math.floor(d.getMonth() / months) * months
  return new Date(d.getFullYear(), month, 1).getTime()
}

/** 기간 라벨 — 1개월 "2026-10", 2·3개월 "2026 7–9월", 6개월 "2026 상반기", 12개월 "2026". */
export function periodLabel(start: Millis, months: number): string {
  const d = new Date(start)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  if (months === 1) return `${year}-${String(month).padStart(2, '0')}`
  if (months === 6) return `${year} ${month === 1 ? '상반기' : '하반기'}`
  if (months === 12) return `${year}`
  return `${year} ${month}–${month + months - 1}월`
}

/** 한 블록의 %기준 성과. */
export function summarize(block: TradeOutcome[], label: string | null = null): ChecklistBlock {
  const sorted = chronological(block)
  const wins = sorted.filter(outcomeIsWin)
  const losses = sorted.filter((o) => o.returnPercent < 0)
  const winRets = wins.map((o) => o.returnPercent)
  const lossRets = losses.map((o) => o.returnPercent)
  return {
    label,
    count: sorted.length,
    periodStart: sorted[0]?.closeDate ?? null,
    periodEnd: sorted.at(-1)?.closeDate ?? null,
    avgWin: avg(winRets),
    avgLoss: avg(lossRets),
    winRate: sorted.length ? (wins.length / sorted.length) * 100 : 0,
    maxWin: winRets.length ? Math.max(...winRets) : null,
    maxLoss: lossRets.length ? Math.min(...lossRets) : null,
    avgWinHoldDays: avg(wins.map(outcomeHoldDays)),
    avgLossHoldDays: avg(losses.map(outcomeHoldDays)),
    avgLossStopGap: avg(losses.flatMap((o) => (o.stopGap === null ? [] : [o.stopGap]))),
  }
}

/** 기간별 블록 — 첫 거래 기간부터 지금 기간까지 거래 없는 기간도 넣는다. 최신이 맨 앞. */
export function periods(outcomes: TradeOutcome[], months: number, now: Millis = Date.now()): ChecklistBlock[] {
  const m = periodMonths(months)
  if (!outcomes.length) return []
  const dates = outcomes.map((o) => o.closeDate)
  const first = Math.min(...dates)
  const last = Math.max(...dates, now)
  const buckets = new Map<Millis, TradeOutcome[]>()
  for (const o of outcomes) {
    const key = periodStart(o.closeDate, m)
    const list = buckets.get(key)
    if (list) list.push(o)
    else buckets.set(key, [o])
  }
  const result: ChecklistBlock[] = []
  const lastStart = periodStart(last, m)
  let start = periodStart(first, m)
  while (start <= lastStart) {
    result.push(summarize(buckets.get(start) ?? [], periodLabel(start, m)))
    const d = new Date(start)
    start = new Date(d.getFullYear(), d.getMonth() + m, 1).getTime()
  }
  return result.reverse()
}

/** 올해(YTD) 합계 — 올해 판 매수 전부를 한 번에 집계(기간 평균의 평균 아님). */
export function yearToDate(outcomes: TradeOutcome[], now: Millis = Date.now()): ChecklistBlock {
  const year = new Date(now).getFullYear()
  return summarize(
    outcomes.filter((o) => new Date(o.closeDate).getFullYear() === year),
    `${year} YTD`,
  )
}

/** 현황 카드 기간 — 지금 기간에 거래가 있으면 그 기간, 없으면 거래가 있는 가장 최근 기간. */
export function cardPeriod(blocks: ChecklistBlock[]): { block: ChecklistBlock; isCurrent: boolean } | null {
  const current = blocks[0]
  if (!current) return null
  if (current.count > 0) return { block: current, isCurrent: true }
  const found = blocks.find((b) => b.count > 0)
  return found ? { block: found, isCurrent: false } : null
}

/** ⑨ 손실 매도 "오래 버팀" 기준 — 수익 거래 평균 보유일. 수익 거래 5건 미만이면 null. */
export function winHoldDaysBaseline(outcomes: TradeOutcome[]): number | null {
  const wins = outcomes.filter(outcomeIsWin)
  if (wins.length < 5) return null
  return avg(wins.map(outcomeHoldDays))
}
