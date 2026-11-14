// 경지(등급) 판정 — 완료 거래를 시간순으로 재생(fold)해 경지·주화입마 단계를 도출한다. 저장 상태 없음.
//
// 경지 요건(원서 기준 — Minervini):
//  · 조정 손익비 = 승률×평균수익 ÷ 패률×평균손실 (1 넘으면 양의 기대값). 승률 하한은 따로 두지 않는다.
//  · 손익비(평균수익 ÷ 평균손실) — 최소 2:1.
//  · 평균 손실 상한(5~7%) · 기준(최대 손절폭)을 넘은 손실 횟수 — 손실 통제.
//  · 증거 — 겹치지 않는 20건 구간이 연속으로 N개 통과해야 승급(한 철의 우연을 거른다).
//  · 절정 이상은 "가장 큰 수익 1건을 빼도" 한 단계 아래 경지 기준을 넘어야 한다(대박 한 건으로 오르지 못하게).
//  · 강등 — 현재 경지 기준의 90% 아래가 2구간 연속이면 한 단계 내려간다. 총자산이 경지 최소 밑이면 즉시(출금도 반영).
import { chronological, outcomeIsWin, TradePosition, type TradeOutcome } from './position'
import type { Millis } from './types'

/** 무협 테마 9단계 경지(0 = 범인 … 8 = 생사경). */
export const TIERS = ['범인', '삼류', '이류', '일류', '절정', '초절정', '화경', '현경', '생사경'] as const
export type SkillTier = number
export const BEOMIN = 0
export const SAMRYU = 1
export const IRYU = 2

export const tierName = (tier: SkillTier): string => TIERS[tier] ?? ''

export interface TierRequirements {
  minTotalAssets: number | null
  /** 조정 손익비 하한 */
  minAdjustedRatio: number | null
  /** 손익비(평균수익 ÷ 평균손실) 하한 */
  minWinLossRatio: number | null
  /** 평균 손실(%) 상한 */
  maxAvgLoss: number | null
  /** 20건 구간 안에서 기준(최대 손절폭)을 넘은 손실을 몇 번까지 봐주나 — null이면 제한 없음 */
  maxBeyond: number | null
  /** 겹치지 않는 20건 구간이 연속으로 몇 개 통과해야 하나 */
  windows: number
  /** 가장 큰 수익 1건을 빼도 한 단계 아래 경지의 조정 손익비 하한을 넘어야 하나 */
  bestTradeCheck: boolean
}

const NO_REQUIREMENT: TierRequirements = {
  minTotalAssets: null,
  minAdjustedRatio: null,
  minWinLossRatio: null,
  maxAvgLoss: null,
  maxBeyond: null,
  windows: 0,
  bestTradeCheck: false,
}

const REQUIREMENTS: TierRequirements[] = [
  NO_REQUIREMENT, // 범인 — 완료 거래 20건이 게이트
  NO_REQUIREMENT, // 삼류 — 20건을 채우면 바닥
  { minTotalAssets: 30_000_000, minAdjustedRatio: 1.0, minWinLossRatio: 1.5, maxAvgLoss: 10, maxBeyond: null, windows: 1, bestTradeCheck: false }, // 이류: 손익분기 돌파
  { minTotalAssets: 100_000_000, minAdjustedRatio: 1.3, minWinLossRatio: 2.0, maxAvgLoss: 8, maxBeyond: 2, windows: 2, bestTradeCheck: false }, // 일류: 저자의 최소 목표(2:1)
  { minTotalAssets: 300_000_000, minAdjustedRatio: 1.6, minWinLossRatio: 2.0, maxAvgLoss: 7, maxBeyond: 2, windows: 2, bestTradeCheck: true },
  { minTotalAssets: 1_000_000_000, minAdjustedRatio: 1.9, minWinLossRatio: 2.0, maxAvgLoss: 6, maxBeyond: 1, windows: 3, bestTradeCheck: true }, // 초절정: 미너비니 본인 수준
  { minTotalAssets: 3_000_000_000, minAdjustedRatio: 2.5, minWinLossRatio: 2.0, maxAvgLoss: 5.5, maxBeyond: 1, windows: 3, bestTradeCheck: true }, // 화경: 저자의 "기쁜 수준"의 문턱
  { minTotalAssets: 10_000_000_000, minAdjustedRatio: 3.0, minWinLossRatio: 2.0, maxAvgLoss: 5.5, maxBeyond: 1, windows: 4, bestTradeCheck: true }, // 현경: 3:1 @ 승률 50%
  { minTotalAssets: 30_000_000_000, minAdjustedRatio: 3.0, minWinLossRatio: 2.0, maxAvgLoss: 5, maxBeyond: 1, windows: 5, bestTradeCheck: true }, // 생사경: 같은 수준을 100건 동안
]

/** 승급 요건 — 범인·삼류는 요건 없음(완료 거래 20건이 게이트), 이류부터 자산 + 성과 + 증거. */
export const tierRequirements = (tier: SkillTier): TierRequirements => REQUIREMENTS[tier]
export const LAST_TIER = TIERS.length - 1

// MARK: 주화입마

/**
 * 주화입마 4단계 — 최근 20건과 최근 10건의 기대손익(순손익)이 둘 다 마이너스인 상태가 연속될수록 심해지고,
 * 5회 연속 플러스로 회복하면 운기조식으로 정상 복귀한다. (회복 중인 사람이 옛 연패 때문에 강등되지 않게 10건도 본다)
 */
export type JuhwaipmaPhase =
  | { kind: 'normal' }
  | { kind: 'yeokryu'; miss: number }
  | { kind: 'juhwa'; miss: number; recover: number }
  | { kind: 'ipma'; miss: number; recover: number }
  | { kind: 'toebo'; recover: number }

export const NORMAL: JuhwaipmaPhase = { kind: 'normal' }

export const WINDOW_SIZE = 20
/** 단기 창 — 주화입마가 심해지려면 이 창도 마이너스여야 한다. */
export const SHORT_WINDOW_SIZE = 10
/** 운기조식: 5회 연속 충족 시 정상 복귀 */
export const RECOVERY_CONFIRM = 5
/** 1~4 역류 */
export const YEOKRYU_MAX = 4
/** 5~9 주화 */
export const JUHWA_MAX = 9
/** 10~14 입마, 15부터 퇴보 */
export const IPMA_MAX = 14
/** 현재 경지 기준의 이 비율 아래면 "유지 기준 미달" */
export const KEEP_RATIO = 0.9
/** 유지 기준 미달 구간이 연속 이만큼이면 한 단계 강등 */
export const KEEP_FAIL_WINDOWS = 2
/** 연패가 이만큼 이어지면 "크기를 줄여 보세요" 안내 */
export const LOSING_STREAK_NOTICE = 3

/** 주화 ×0.5, 입마·퇴보 ×0.25 — 평소 리스크율에 곱하는 배수(책의 비례 축소). null = 제한 없음. */
export function riskLockFactor(phase: JuhwaipmaPhase): number | null {
  switch (phase.kind) {
    case 'normal':
    case 'yeokryu':
      return null
    case 'juhwa':
      return 0.5
    case 'ipma':
    case 'toebo':
      return 0.25
  }
}

/** 잠기는 리스크율(%) = 평소 리스크율 × 배수 — null이면 잠기지 않는다(평소 리스크율이 0 이하여도). */
export function lockedRiskPercent(phase: JuhwaipmaPhase, baseRiskPercent: number): number | null {
  const factor = riskLockFactor(phase)
  return factor === null || baseRiskPercent <= 0 ? null : baseRiskPercent * factor
}

export function phaseStatusText(phase: JuhwaipmaPhase): string {
  switch (phase.kind) {
    case 'normal':
      return '정상'
    case 'yeokryu':
      return '역류 — 기혈이 어긋나기 시작'
    case 'juhwa':
      return '주화 — 기가 폭주 (리스크를 평소의 절반으로 제한)'
    case 'ipma':
      return '입마 — 심마에 흔들림 (리스크를 평소의 1/4로 제한)'
    case 'toebo':
      return '퇴보 — 한 단계 강등, 운기조식 중'
  }
}

/** 운기조식 진행 횟수 — 경고/정상 단계는 null. */
export function recoverStreak(phase: JuhwaipmaPhase): number | null {
  switch (phase.kind) {
    case 'juhwa':
    case 'ipma':
    case 'toebo':
      return phase.recover
    default:
      return null
  }
}

/** 다음 단계까지 남은 미달 횟수 안내. 정상·퇴보는 null. 삼류에선 입마 다음이 없다. */
export function nextStepHint(phase: JuhwaipmaPhase, tier: SkillTier): string | null {
  switch (phase.kind) {
    case 'normal':
    case 'toebo':
      return null
    case 'yeokryu':
      return `${YEOKRYU_MAX + 1 - phase.miss}번 더 미달이면 주화(리스크를 평소의 절반으로 제한)`
    case 'juhwa':
      return `${JUHWA_MAX + 1 - phase.miss}번 더 미달이면 입마(평소의 1/4로 제한)`
    case 'ipma':
      if (tier <= SAMRYU) return '삼류에선 더 내려가지 않아요'
      return `${Math.max(IPMA_MAX + 1 - phase.miss, 1)}번 더 미달이면 퇴보(한 단계 강등)`
  }
}

/** 심한 정도(0 정상 … 4 퇴보) — "한 번만 알림"이 더 나빠졌을 때만 뜨게 비교한다. */
export function phaseSeverity(phase: JuhwaipmaPhase): number {
  return { normal: 0, yeokryu: 1, juhwa: 2, ipma: 3, toebo: 4 }[phase.kind]
}

export function samePhase(a: JuhwaipmaPhase, b: JuhwaipmaPhase): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// MARK: 기본 계산

/** 타율 — 거래 통화 기준 수익률이 플러스인 비율. */
export function winRate(window: TradeOutcome[]): number {
  if (!window.length) return 0
  return window.filter(outcomeIsWin).length / window.length
}

/** 1거래당 기대손익 = 순실현손익 ÷ 건수(환차 제외 매매손익). 주화입마 판정 기준. */
export function expectancy(window: TradeOutcome[]): number {
  if (!window.length) return 0
  return window.reduce((a, o) => a + o.tradingProfit, 0) / window.length
}

/** 손실이 하나도 없을 때 손익비·조정 손익비에 쓰는 상한. */
const RATIO_CAP = 99

/** 손익비 = 평균 수익률(%) ÷ 평균 손실률(%) — 앱 전체 %기준. */
export function winLossRatio(window: TradeOutcome[]): number {
  const rets = window.map((o) => o.returnPercent)
  const wins = rets.filter((r) => r > 0)
  const losses = rets.filter((r) => r < 0).map((r) => -r)
  if (!losses.length) return wins.length ? RATIO_CAP : 0
  const avgWin = wins.length ? wins.reduce((a, x) => a + x, 0) / wins.length : 0
  const avgLoss = losses.reduce((a, x) => a + x, 0) / losses.length
  if (avgLoss <= 0) return RATIO_CAP
  return avgWin / avgLoss
}

/** 조정 손익비 = 승률×평균수익 ÷ 패률×평균손실. 1 초과면 양의 기대값. */
export function adjustedRatioOf(returns: number[]): number {
  if (!returns.length) return 0
  const wins = returns.filter((r) => r > 0)
  const losses = returns.filter((r) => r < 0).map((r) => -r)
  if (!wins.length) return 0
  if (!losses.length) return RATIO_CAP
  const w = wins.length / returns.length
  const avgWin = wins.reduce((a, x) => a + x, 0) / wins.length
  const avgLoss = losses.reduce((a, x) => a + x, 0) / losses.length
  if (avgLoss <= 0) return RATIO_CAP
  return (w * avgWin) / ((1 - w) * avgLoss)
}

/** 한 구간(20건)의 통계. */
export interface WindowStats {
  count: number
  /** 0~1 */
  winRate: number
  /** 평균 수익률(%), 이긴 거래가 없으면 null */
  avgWin: number | null
  /** 평균 손실률(%, 양수), 진 거래가 없으면 null */
  avgLoss: number | null
  ratio: number
  adjusted: number
  /** 기준(최대 손절폭)을 넘은 손실 횟수 — 기준이 꺼져 있으면 0 */
  beyond: number
  /** 가장 큰 수익 1건을 뺀 조정 손익비 */
  adjustedWithoutBest: number
}

export function windowStats(window: TradeOutcome[], limitPercent: number): WindowStats {
  const rets = window.map((o) => o.returnPercent)
  const wins = rets.filter((r) => r > 0)
  const losses = rets.filter((r) => r < 0).map((r) => -r)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null)
  let withoutBest = rets
  const best = Math.max(...rets)
  if (best > 0) {
    const i = rets.indexOf(best)
    withoutBest = [...rets.slice(0, i), ...rets.slice(i + 1)]
  }
  return {
    count: window.length,
    winRate: window.length ? wins.length / window.length : 0,
    avgWin: avg(wins),
    avgLoss: avg(losses),
    ratio: winLossRatio(window),
    adjusted: adjustedRatioOf(rets),
    beyond: limitPercent > 0 ? losses.filter((l) => l > limitPercent).length : 0,
    adjustedWithoutBest: adjustedRatioOf(withoutBest),
  }
}

// MARK: 승급 조건

export type ConditionKey = 'assets' | 'adjusted' | 'ratio' | 'avgLoss' | 'beyond' | 'bestTrade'

export interface ConditionStatus {
  key: ConditionKey
  label: string
  /** 지금 값(없으면 null) */
  value: number | null
  limit: number
  /** min = 이 값 이상이어야, max = 이 값 이하여야 */
  kind: 'min' | 'max'
  met: boolean
  /** 0~1 채움 정도 — max 항목은 한도 이하면 1, 넘으면 한도 ÷ 값 */
  progress: number
}

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1)

function minCondition(key: ConditionKey, label: string, value: number | null, limit: number): ConditionStatus {
  const v = value ?? 0
  return { key, label, value, limit, kind: 'min', met: v >= limit, progress: limit > 0 ? clamp01(v / limit) : 1 }
}

function maxCondition(key: ConditionKey, label: string, value: number | null, limit: number): ConditionStatus {
  const v = value ?? 0
  return { key, label, value, limit, kind: 'max', met: v <= limit, progress: v <= limit ? 1 : clamp01(limit / v) }
}

/** 한 경지의 조건을 한 구간 통계·총자산에 대 본 결과. `assets`가 null이면 자산 항목은 뺀다(구간 증거용). */
export function conditionList(tier: SkillTier, stats: WindowStats, assets: number | null, limitPercent: number): ConditionStatus[] {
  const req = REQUIREMENTS[tier]
  const list: ConditionStatus[] = []
  if (assets !== null && req.minTotalAssets !== null) list.push(minCondition('assets', '총자산', assets, req.minTotalAssets))
  if (req.minAdjustedRatio !== null) list.push(minCondition('adjusted', '조정 손익비', stats.adjusted, req.minAdjustedRatio))
  if (req.minWinLossRatio !== null) list.push(minCondition('ratio', '손익비', stats.ratio, req.minWinLossRatio))
  if (req.maxAvgLoss !== null) list.push(maxCondition('avgLoss', '평균 손실', stats.avgLoss, req.maxAvgLoss))
  if (req.maxBeyond !== null && limitPercent > 0) list.push(maxCondition('beyond', '기준 넘은 손실', stats.beyond, req.maxBeyond))
  if (req.bestTradeCheck) {
    const lower = REQUIREMENTS[tier - 1].minAdjustedRatio
    if (lower !== null) list.push(minCondition('bestTrade', '대박 1건 제외 조정 손익비', stats.adjustedWithoutBest, lower))
  }
  return list
}

/** 구간 하나가 그 경지의 성과 조건(자산 제외)을 모두 넘었나. */
function windowPasses(tier: SkillTier, stats: WindowStats, limitPercent: number): boolean {
  return conditionList(tier, stats, null, limitPercent).every((c) => c.met)
}

/** 유지 기준 미달 — 현재 경지 기준의 90% 아래(조정 손익비·손익비) 또는 평균 손실이 한도의 1/0.9배 초과. */
function keepFails(tier: SkillTier, stats: WindowStats): boolean {
  const req = REQUIREMENTS[tier]
  if (req.minAdjustedRatio !== null && stats.adjusted < req.minAdjustedRatio * KEEP_RATIO) return true
  if (req.minWinLossRatio !== null && stats.ratio < req.minWinLossRatio * KEEP_RATIO) return true
  if (req.maxAvgLoss !== null && stats.avgLoss !== null && stats.avgLoss > req.maxAvgLoss / KEEP_RATIO) return true
  return false
}

/** 총자산만으로 허용되는 최고 경지(삼류 바닥) — 자산 강등. */
export function assetCeiling(totalAssets: number): SkillTier {
  let ceiling = SAMRYU
  for (let tier = IRYU; tier <= LAST_TIER; tier++) {
    const min = REQUIREMENTS[tier].minTotalAssets
    if (min !== null && totalAssets >= min) ceiling = tier
  }
  return ceiling
}

/** 뒤에서 k번째(0 = 가장 최근) 20건 구간 — 거래가 모자라면 null. */
function windowAt(sorted: TradeOutcome[], end: number, k: number): TradeOutcome[] | null {
  const to = end - WINDOW_SIZE * k
  const from = to - WINDOW_SIZE
  return from >= 0 ? sorted.slice(from, to) : null
}

function ladderPhase(missStreak: number): JuhwaipmaPhase {
  if (missStreak <= 0) return NORMAL
  if (missStreak <= YEOKRYU_MAX) return { kind: 'yeokryu', miss: missStreak }
  if (missStreak <= JUHWA_MAX) return { kind: 'juhwa', miss: missStreak, recover: 0 }
  return { kind: 'ipma', miss: missStreak, recover: 0 } // 삼류 바닥에서 15+도 입마로 캡
}

// MARK: 종합 판정

/** 승급 심사 — 다음 경지까지 무엇이 모자란지. */
export interface PromotionReview {
  nextTier: SkillTier
  /** 가장 최근 20건 구간 기준 조건(자산 포함) */
  conditions: ConditionStatus[]
  /** 겹치지 않는 20건 구간별 통과 여부(오래된 → 최근). 거래가 모자라 아직 없는 구간은 null. */
  windows: (boolean | null)[]
  /** 자산·모든 구간이 갖춰졌다 — 주화입마 중이면 심사가 멈춰 있다. */
  ready: boolean
}

/** 유지 심사 — 현재 경지 기준의 90% 아래였던 구간이 연속 몇 번인가. */
export interface KeepReview {
  failedWindows: number
  needed: number
}

export interface TierGradingResult {
  currentTier: SkillTier
  juhwaipma: JuhwaipmaPhase
  /** 범인 단계일 때만 */
  beominProgress: { closed: number; needed: number } | null
  /** 가장 최근 20건 구간 통계(범인이면 null) */
  recent: WindowStats | null
  /** 다음 경지 승급 심사(범인·최고 경지면 null) */
  promotion: PromotionReview | null
  /** 유지 심사(이류 이상) */
  keep: KeepReview | null
  /** 이 경지의 총자산 최소와 현재 여유(%) — 삼류 이하면 null */
  assetFloor: { minAssets: number; margin: number } | null
  /** 지금 이어지는 연패 횟수(매도 1회당 한 번, 순손익 기준) */
  losingStreak: number
}

/** 최근에 연속으로 순손실이었던 매도 횟수. */
export function losingStreak(outcomes: TradeOutcome[]): number {
  const sorted = chronological(outcomes)
  let streak = 0
  let i = sorted.length - 1
  while (i >= 0) {
    const key = sorted[i].stepKey
    let net = 0
    while (i >= 0 && sorted[i].stepKey === key) {
      net += sorted[i].tradingProfit
      i -= 1
    }
    if (net < 0) streak += 1
    else break
  }
  return streak
}

/** 시점별 총자산 점. */
export interface AssetPoint {
  date: Millis
  assets: number
}

/** 총자산이 고정값일 때(테스트·단순 계산)의 편의 함수. */
export function evaluateClosedPositions(closed: TradePosition[], totalAssets: number, limitPercent = 10): TierGradingResult {
  return evaluate(
    closed.flatMap((p) => p.outcomes),
    [{ date: Number.NEGATIVE_INFINITY, assets: totalAssets }],
    limitPercent,
  )
}

/**
 * `assetPoints`: 시점별 총자산(타임라인) — 각 매도 시점의 총자산으로 판정하므로 나중에 설정 환율이나 현재 총자산이
 * 바뀌어도 과거 판정이 흔들리지 않고, 입출금(출금 포함)으로 총자산이 경지 최소 밑이 되면 그 순간 강등된다.
 * 창(최근 20건)은 매수 단위로 채우지만 단계 진행은 **매도 1회당 한 번**.
 * `limitPercent`: 설정의 최대 손절폭(0 = 끔) — "기준 넘은 손실" 판정.
 */
export function evaluate(outcomes: TradeOutcome[], assetPoints: AssetPoint[], limitPercent = 10): TierGradingResult {
  const sorted = chronological(outcomes)
  const points = [...assetPoints].sort((a, b) => a.date - b.date)
  const streak = losingStreak(outcomes)
  const currentAssets = points.length ? points[points.length - 1].assets : 0
  if (sorted.length < WINDOW_SIZE) {
    return {
      currentTier: BEOMIN,
      juhwaipma: NORMAL,
      beominProgress: { closed: sorted.length, needed: WINDOW_SIZE },
      recent: null,
      promotion: null,
      keep: null,
      assetFloor: null,
      losingStreak: streak,
    }
  }

  const assetsAtDate = (date: Millis): number => {
    for (let i = points.length - 1; i >= 0; i--) if (points[i].date <= date) return points[i].assets
    return 0
  }

  let tier = SAMRYU
  let missStreak = 0
  let recover = 0
  let phase: JuhwaipmaPhase = NORMAL
  /** 이 거래 수 전에는 유지 심사를 하지 않는다(경지가 바뀐 직후 새 구간이 쌓일 때까지). */
  let keepFreeEnd = 0
  let pointIndex = 0
  let closedCount = 0

  const demoteToCeiling = (assets: number, end: number) => {
    const ceiling = assetCeiling(assets)
    if (tier > ceiling) {
      tier = ceiling
      missStreak = 0
      recover = 0
      phase = NORMAL
      keepFreeEnd = end + WINDOW_SIZE
    }
  }
  /** 이 시각까지의 입출금·기록 점마다 자산 강등을 본다(출금 포함). */
  const advanceAssets = (untilDate: Millis) => {
    while (pointIndex < points.length && points[pointIndex].date <= untilDate) {
      if (closedCount >= WINDOW_SIZE) demoteToCeiling(points[pointIndex].assets, closedCount)
      pointIndex += 1
    }
  }

  // 단계 = 매도 1회 — 같은 매도로 판 매수들의 마지막 위치(exclusive end)
  const stepEnds: number[] = []
  sorted.forEach((o, i) => {
    if (i === sorted.length - 1 || sorted[i + 1].stepKey !== o.stepKey) stepEnds.push(i + 1)
  })

  for (const end of stepEnds) {
    if (end < WINDOW_SIZE) continue
    const closeDate = sorted[end - 1].closeDate
    advanceAssets(closeDate)
    closedCount = end
    const assets = assetsAtDate(closeDate)

    // 1) 자산 강등 — 총자산이 현재 경지 최소 밑이면 즉시 하향(주화입마와 별개)
    demoteToCeiling(assets, end)

    const window20 = sorted.slice(end - WINDOW_SIZE, end)
    const window10 = sorted.slice(end - SHORT_WINDOW_SIZE, end)
    const e20 = expectancy(window20)

    if (e20 < 0 && expectancy(window10) < 0) {
      // 실제 손실 중(20건·10건 둘 다) → 주화입마 사다리 상승
      missStreak += 1
      recover = 0
      if (missStreak > IPMA_MAX && tier > SAMRYU) {
        tier -= 1 // 퇴보: 한 단계 강등 후 운기조식 시작
        missStreak = 0
        keepFreeEnd = end + WINDOW_SIZE
        phase = { kind: 'toebo', recover: 0 }
      } else {
        phase = ladderPhase(missStreak)
      }
      continue
    }

    switch (phase.kind) {
      case 'normal':
      case 'yeokryu': {
        // 역류는 한 번만 충족해도 즉시 해제
        missStreak = 0
        recover = 0
        phase = NORMAL
        let moved = false
        // 승급 — 다음 경지의 자산·겹치지 않는 20건 구간 증거를 모두 갖췄을 때(매도 1회에 한 단계)
        if (tier < LAST_TIER && e20 >= 0) {
          const next = tier + 1
          const req = REQUIREMENTS[next]
          let ok = req.minTotalAssets !== null && assets >= req.minTotalAssets && end >= WINDOW_SIZE * req.windows
          for (let k = 0; ok && k < req.windows; k++) {
            const w = windowAt(sorted, end, k)
            ok = w !== null && windowPasses(next, windowStats(w, limitPercent), limitPercent)
          }
          if (ok) {
            tier = next
            keepFreeEnd = end + WINDOW_SIZE
            moved = true
          }
        }
        // 유지 심사 — 현재 경지 기준 90% 아래가 2구간 연속이면 한 단계 강등
        if (!moved && tier >= IRYU && end >= keepFreeEnd && end >= WINDOW_SIZE * KEEP_FAIL_WINDOWS) {
          let fails = true
          for (let k = 0; fails && k < KEEP_FAIL_WINDOWS; k++) {
            const w = windowAt(sorted, end, k)
            fails = w !== null && keepFails(tier, windowStats(w, limitPercent))
          }
          if (fails) {
            tier -= 1
            keepFreeEnd = end + WINDOW_SIZE
          }
        }
        break
      }
      case 'juhwa':
      case 'ipma': {
        // 주화·입마는 운기조식(5회 연속 충족)으로만 해제
        const miss = phase.miss
        recover += 1
        if (recover >= RECOVERY_CONFIRM) {
          phase = NORMAL
          missStreak = 0
          recover = 0
        } else if (miss <= JUHWA_MAX) {
          phase = { kind: 'juhwa', miss, recover }
        } else {
          phase = { kind: 'ipma', miss, recover }
        }
        break
      }
      case 'toebo':
        recover += 1
        if (recover >= RECOVERY_CONFIRM) {
          phase = NORMAL
          missStreak = 0
          recover = 0
        } else {
          phase = { kind: 'toebo', recover }
        }
        break
    }
  }
  // 마지막 매도 뒤의 입출금도 반영(출금 포함)
  advanceAssets(Number.POSITIVE_INFINITY)

  const n = sorted.length
  const latest = windowAt(sorted, n, 0)
  const recent = latest ? windowStats(latest, limitPercent) : null

  let promotion: PromotionReview | null = null
  if (tier < LAST_TIER && recent) {
    const next = tier + 1
    const req = REQUIREMENTS[next]
    const conditions = conditionList(next, recent, currentAssets, limitPercent)
    const windows: (boolean | null)[] = []
    for (let i = req.windows - 1; i >= 0; i--) {
      const w = windowAt(sorted, n, i)
      windows.push(w === null ? null : windowPasses(next, windowStats(w, limitPercent), limitPercent))
    }
    const assetsOk = req.minTotalAssets !== null && currentAssets >= req.minTotalAssets
    promotion = { nextTier: next, conditions, windows, ready: assetsOk && windows.every((w) => w === true) }
  }

  let keep: KeepReview | null = null
  if (tier >= IRYU) {
    let failed = 0
    for (let k = 0; k < KEEP_FAIL_WINDOWS; k++) {
      const w = windowAt(sorted, n, k)
      if (w !== null && keepFails(tier, windowStats(w, limitPercent))) failed += 1
      else break
    }
    keep = { failedWindows: failed, needed: KEEP_FAIL_WINDOWS }
  }

  const floorMin = tier >= IRYU ? REQUIREMENTS[tier].minTotalAssets : null
  return {
    currentTier: tier,
    juhwaipma: phase,
    beominProgress: null,
    recent,
    promotion,
    keep,
    assetFloor: floorMin !== null ? { minAssets: floorMin, margin: currentAssets / floorMin - 1 } : null,
    losingStreak: streak,
  }
}
