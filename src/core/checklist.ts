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
  /** 기준(설정의 최대 손절폭)을 넘은 손실 횟수 — 기준이 꺼져 있으면(0) null. */
  beyondCount: number | null
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
export function summarize(block: TradeOutcome[], label: string | null = null, limitPercent = 0): ChecklistBlock {
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
    beyondCount: limitPercent > 0 ? losses.filter((o) => -o.returnPercent > limitPercent).length : null,
  }
}

/** 기간별 블록 — 첫 거래 기간부터 지금 기간까지 거래 없는 기간도 넣는다. 최신이 맨 앞. */
export function periods(outcomes: TradeOutcome[], months: number, now: Millis = Date.now(), limitPercent = 0): ChecklistBlock[] {
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
    result.push(summarize(buckets.get(start) ?? [], periodLabel(start, m), limitPercent))
    const d = new Date(start)
    start = new Date(d.getFullYear(), d.getMonth() + m, 1).getTime()
  }
  return result.reverse()
}

/** 올해(YTD) 합계 — 올해 판 매수 전부를 한 번에 집계(기간 평균의 평균 아님). */
export function yearToDate(outcomes: TradeOutcome[], now: Millis = Date.now(), limitPercent = 0): ChecklistBlock {
  const year = new Date(now).getFullYear()
  return summarize(
    outcomes.filter((o) => new Date(o.closeDate).getFullYear() === year),
    `${year} YTD`,
    limitPercent,
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

// MARK: 확인표 보강 — 경고·통산 대비·점검 한 줄 (미너비니 "Know the Truth About Your Trading")

/** 통산 대비 ▲▼·고집쟁이 경고는 거래가 이보다 적으면 하지 않는다(한 달 결과에 휘둘리지 말고 6~12개월 평균을 보라는 취지). */
export const SAMPLE_MIN = 10
/** 평균 손실 주의선(%) — 미너비니 권장 평균 손실 5~7%의 위쪽. */
export const AVG_LOSS_WARN_PERCENT = 7

/** 평균 손실(%)이 주의선보다 크다. */
export const blockAvgLossWarn = (b: ChecklistBlock): boolean => b.avgLoss !== null && -b.avgLoss > AVG_LOSS_WARN_PERCENT

/** 기준(최대 손절폭)을 넘은 손실이 있다. */
export const blockBeyondWarn = (b: ChecklistBlock): boolean => (b.beyondCount ?? 0) > 0

/** 고집쟁이 지표 — 최대 수익이 최대 손실(절대값)보다 작다(손실을 끌어안고 수익은 빨리 판다). 표본이 충분할 때만. */
export function blockStubbornWarn(b: ChecklistBlock): boolean {
  return b.count >= SAMPLE_MIN && b.maxWin !== null && b.maxLoss !== null && b.maxWin < -b.maxLoss
}

export type DeviationKey = 'winRate' | 'avgWin' | 'avgLoss' | 'adjusted'

export interface Deviation {
  /** 이 블록 − 통산 (승률·평균수익·평균손실은 %p, 조정 손익비는 차이값). 손실은 음수라 더 나쁘면 더 작다. */
  delta: number
  /** 통산보다 나빠졌나. */
  worse: boolean
}

/** 눈에 띌 만큼 달라졌다고 보는 차이 — 승률 8%p, 평균수익 3%p, 평균손실 1%p, 조정 손익비 0.3. */
const DEVIATION_MIN: Record<DeviationKey, number> = { winRate: 8, avgWin: 3, avgLoss: 1, adjusted: 0.3 }

/**
 * 통산 대비 눈에 띄게 달라진 칸 — 표본이 적거나 통산이 없으면 비운다(잡음).
 * 화면은 여기 있는 칸에만 ▲▼를 단다.
 */
export function deviations(b: ChecklistBlock, overall: ChecklistBlock): Partial<Record<DeviationKey, Deviation>> {
  if (b.count < SAMPLE_MIN || overall.count < SAMPLE_MIN) return {}
  const result: Partial<Record<DeviationKey, Deviation>> = {}
  const put = (key: DeviationKey, delta: number | null, lowerIsWorse = true) => {
    if (delta === null || Math.abs(delta) < DEVIATION_MIN[key]) return
    result[key] = { delta, worse: lowerIsWorse ? delta < 0 : delta > 0 }
  }
  put('winRate', b.winRate - overall.winRate)
  put('avgWin', b.avgWin !== null && overall.avgWin !== null ? b.avgWin - overall.avgWin : null)
  // 평균 손실은 음수 — 더 작아질수록(더 크게 잃을수록) 나쁘다.
  put('avgLoss', b.avgLoss !== null && overall.avgLoss !== null ? b.avgLoss - overall.avgLoss : null)
  const adj = blockAdjustedRatio(b)
  const adjAll = blockAdjustedRatio(overall)
  put('adjusted', adj !== null && adjAll !== null ? adj - adjAll : null)
  return result
}

/**
 * 점검 한 줄 — 가장 먼저 해당하는 한 가지만. (원서: 평균 손실은 내가 통제하는 변수, 고집쟁이 지표, 어려운 장세엔 조여라)
 * `limitPercent` = 설정의 최대 손절폭.
 */
export function checkupMessage(b: ChecklistBlock, overall: ChecklistBlock, limitPercent: number): string | null {
  if (b.count === 0) return null
  if (blockBeyondWarn(b)) return `손실이 기준(−${limitPercent}%)을 ${b.beyondCount}회 넘었어요. 손절을 지켰는지 확인해 보세요.`
  const dev = deviations(b, overall)
  if (dev.avgLoss?.worse && overall.avgLoss !== null && b.avgLoss !== null) {
    return `평균 손실이 평소(통산 ${overall.avgLoss.toFixed(1)}%)보다 ${Math.abs(dev.avgLoss.delta).toFixed(1)}%p 커졌어요. 손절 규칙을 지켰는지 확인해 보세요.`
  }
  if (blockHoldWarning(b)) return '손실 거래를 수익 거래보다 오래 들고 있어요. 손절이 늦어지고 있진 않은지 보세요.'
  if (blockStubbornWarn(b)) return '큰 수익이 큰 손실보다 작아요. 손실은 끌어안고 수익은 빨리 파는 건 아닌지 보세요.'
  if (dev.winRate?.worse) {
    return `승률이 평소보다 ${Math.abs(dev.winRate.delta).toFixed(0)}%p 낮아요. 장세가 어려울 수 있어요 — 손절과 크기를 줄이는 걸 고려해 보세요.`
  }
  return null
}
