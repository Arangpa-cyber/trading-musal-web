// 경지(등급) 판정 — 완료 거래를 시간순으로 재생(fold)해 경지·주화입마 단계를 도출한다. 저장 상태 없음.
import { chronological, outcomeIsWin, TradePosition, type TradeOutcome } from './position'

/** 무협 테마 9단계 경지(0 = 범인 … 8 = 생사경). */
export const TIERS = ['범인', '삼류', '이류', '일류', '절정', '초절정', '화경', '현경', '생사경'] as const
export type SkillTier = number
export const BEOMIN = 0
export const SAMRYU = 1
export const IRYU = 2

export const tierName = (tier: SkillTier): string => TIERS[tier] ?? ''

export interface TierRequirements {
  minTotalAssets: number | null
  /** 0.0~1.0 */
  minWinRate: number | null
  /** 예: 2.5 = 손익비 1:2.5 */
  minWinLossRatio: number | null
}

const REQUIREMENTS: TierRequirements[] = [
  { minTotalAssets: null, minWinRate: null, minWinLossRatio: null },
  { minTotalAssets: 10_000_000, minWinRate: 0.3, minWinLossRatio: 1.0 },
  { minTotalAssets: 30_000_000, minWinRate: 0.35, minWinLossRatio: 1.5 },
  { minTotalAssets: 100_000_000, minWinRate: 0.4, minWinLossRatio: 2.0 },
  { minTotalAssets: 300_000_000, minWinRate: 0.45, minWinLossRatio: 2.5 },
  { minTotalAssets: 1_000_000_000, minWinRate: 0.5, minWinLossRatio: 3.0 },
  { minTotalAssets: 3_000_000_000, minWinRate: 0.5, minWinLossRatio: 3.5 },
  { minTotalAssets: 10_000_000_000, minWinRate: 0.5, minWinLossRatio: 4.0 },
  { minTotalAssets: 30_000_000_000, minWinRate: 0.5, minWinLossRatio: 5.0 },
]

/** 승급 요건 — 범인은 요건 없음(완료 거래 20건이 게이트), 나머지는 총자산+타율+손익비. */
export const tierRequirements = (tier: SkillTier): TierRequirements => REQUIREMENTS[tier]
export const LAST_TIER = TIERS.length - 1

// MARK: 주화입마

/**
 * 주화입마 4단계 — 최근 20창의 기대손익(순손익)이 마이너스인 상태가 연속될수록 심해지고,
 * 5회 연속 플러스로 회복하면 운기조식으로 정상 복귀한다.
 */
export type JuhwaipmaPhase =
  | { kind: 'normal' }
  | { kind: 'yeokryu'; miss: number }
  | { kind: 'juhwa'; miss: number; recover: number }
  | { kind: 'ipma'; miss: number; recover: number }
  | { kind: 'toebo'; recover: number }

export const NORMAL: JuhwaipmaPhase = { kind: 'normal' }

export const WINDOW_SIZE = 20
/** 운기조식: 5회 연속 충족 시 정상 복귀 */
export const RECOVERY_CONFIRM = 5
/** 승급: 다음 경지 자격을 3회 연속 충족해야 확정 */
export const PROMOTE_CONFIRM = 3
/** 1~4 역류 */
export const YEOKRYU_MAX = 4
/** 5~9 주화 */
export const JUHWA_MAX = 9
/** 10~14 입마, 15부터 퇴보 */
export const IPMA_MAX = 14

/** 잠기는 리스크율(%) — null이면 잠기지 않음. */
export function lockedRiskPercent(phase: JuhwaipmaPhase): number | null {
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

export function phaseStatusText(phase: JuhwaipmaPhase): string {
  switch (phase.kind) {
    case 'normal':
      return '정상'
    case 'yeokryu':
      return '역류 — 기혈이 어긋나기 시작'
    case 'juhwa':
      return '주화 — 기가 폭주 (리스크 0.5% 제한)'
    case 'ipma':
      return '입마 — 심마에 흔들림 (리스크 0.25% 제한)'
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
      return `${YEOKRYU_MAX + 1 - phase.miss}번 더 미달이면 주화(리스크 0.5% 제한)`
    case 'juhwa':
      return `${JUHWA_MAX + 1 - phase.miss}번 더 미달이면 입마(리스크 0.25% 제한)`
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

export interface TierGradingResult {
  currentTier: SkillTier
  juhwaipma: JuhwaipmaPhase
  /** 최근 20건 타율(범인이면 null) */
  recentWinRate: number | null
  /** 최근 20건 손익비 */
  recentWinLossRatio: number | null
  /** 범인 단계일 때만 */
  beominProgress: { closed: number; needed: number } | null
  /** 승급 심사 — 다음 경지 자격을 연속으로 충족한 횟수 */
  promoteStreak: number
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

/** 손익비 = 평균 수익률(%) ÷ 평균 손실률(%) — 앱 전체 %기준. */
export function winLossRatio(window: TradeOutcome[]): number {
  const rets = window.map((o) => o.returnPercent)
  const wins = rets.filter((r) => r > 0)
  const losses = rets.filter((r) => r < 0).map((r) => -r)
  if (!losses.length) return wins.length ? 99 : 0
  const avgWin = wins.length ? wins.reduce((a, x) => a + x, 0) / wins.length : 0
  const avgLoss = losses.reduce((a, x) => a + x, 0) / losses.length
  if (avgLoss <= 0) return 99
  return avgWin / avgLoss
}

/** 타율·손익비·총자산으로 도달 가능한 가장 높은 경지(삼류 바닥). */
function achievedTier(rate: number, ratio: number, totalAssets: number): SkillTier {
  let achieved = SAMRYU
  for (let tier = SAMRYU; tier <= LAST_TIER; tier++) {
    const req = REQUIREMENTS[tier]
    if (req.minTotalAssets === null || req.minWinRate === null || req.minWinLossRatio === null) continue
    if (totalAssets >= req.minTotalAssets && rate >= req.minWinRate && ratio >= req.minWinLossRatio) achieved = tier
  }
  return achieved
}

/** 총자산만으로 허용되는 최고 경지(삼류 바닥) — 자산 강등. */
function assetCeiling(totalAssets: number): SkillTier {
  let ceiling = SAMRYU
  for (let tier = SAMRYU; tier <= LAST_TIER; tier++) {
    const min = REQUIREMENTS[tier].minTotalAssets
    if (min !== null && totalAssets >= min) ceiling = tier
  }
  return ceiling
}

function ladderPhase(missStreak: number): JuhwaipmaPhase {
  if (missStreak <= 0) return NORMAL
  if (missStreak <= YEOKRYU_MAX) return { kind: 'yeokryu', miss: missStreak }
  if (missStreak <= JUHWA_MAX) return { kind: 'juhwa', miss: missStreak, recover: 0 }
  return { kind: 'ipma', miss: missStreak, recover: 0 } // 삼류 바닥에서 15+도 입마로 캡
}

// MARK: 종합 판정

/** 총자산이 고정값일 때(테스트·단순 계산)의 편의 함수. */
export function evaluateClosedPositions(closed: TradePosition[], totalAssets: number): TierGradingResult {
  return evaluate(
    closed.flatMap((p) => p.outcomes),
    () => totalAssets,
  )
}

/**
 * `totalAssetsAtClose`: 각 완료 거래가 팔린 시점의 총자산 스냅샷 — 나중에 설정 환율이나 현재 총자산이 바뀌어도
 * 과거 판정이 흔들리지 않는다. 창(최근 20건)은 매수 단위로 채우지만 단계 진행은 **매도 1회당 한 번**.
 */
export function evaluate(outcomes: TradeOutcome[], totalAssetsAtClose: (o: TradeOutcome) => number): TierGradingResult {
  const sorted = chronological(outcomes)
  if (sorted.length < WINDOW_SIZE) {
    return {
      currentTier: BEOMIN,
      juhwaipma: NORMAL,
      recentWinRate: null,
      recentWinLossRatio: null,
      beominProgress: { closed: sorted.length, needed: WINDOW_SIZE },
      promoteStreak: 0,
    }
  }

  let tier = SAMRYU
  let missStreak = 0
  let recover = 0
  let promoteStreak = 0
  let phase: JuhwaipmaPhase = NORMAL
  let lastRate = 0
  let lastRatio = 0

  // 단계 = 매도 1회 — 같은 매도로 판 매수들의 마지막 위치(exclusive end)
  const stepEnds: number[] = []
  sorted.forEach((o, i) => {
    if (i === sorted.length - 1 || sorted[i + 1].stepKey !== o.stepKey) stepEnds.push(i + 1)
  })

  for (const end of stepEnds) {
    if (end < WINDOW_SIZE) continue
    const window = sorted.slice(end - WINDOW_SIZE, end)
    const totalAssets = totalAssetsAtClose(sorted[end - 1])
    const rate = winRate(window)
    const ratio = winLossRatio(window)
    lastRate = rate
    lastRatio = ratio

    // 1) 자산 강등 — 총자산이 현재 경지 최소 밑이면 즉시 하향(주화입마와 별개)
    const ceiling = assetCeiling(totalAssets)
    if (tier > ceiling) {
      tier = ceiling
      missStreak = 0
      recover = 0
      promoteStreak = 0
      phase = NORMAL
    }

    if (expectancy(window) < 0) {
      // 실제 손실 중 → 주화입마 사다리 상승
      missStreak += 1
      recover = 0
      if (missStreak > IPMA_MAX && tier > SAMRYU) {
        tier -= 1 // 퇴보: 한 단계 강등 후 운기조식 시작
        missStreak = 0
        promoteStreak = 0
        phase = { kind: 'toebo', recover: 0 }
      } else {
        phase = ladderPhase(missStreak)
      }
    } else {
      switch (phase.kind) {
        case 'normal':
        case 'yeokryu': {
          // 역류는 한 번만 충족해도 즉시 해제
          missStreak = 0
          recover = 0
          phase = NORMAL
          const eligible = achievedTier(rate, ratio, totalAssets)
          if (eligible > tier) {
            promoteStreak += 1
            if (promoteStreak >= PROMOTE_CONFIRM) {
              tier = Math.min(tier + 1, LAST_TIER)
              promoteStreak = 0
            }
          } else {
            promoteStreak = 0
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
            promoteStreak = 0
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
            promoteStreak = 0
          } else {
            phase = { kind: 'toebo', recover }
          }
          break
      }
    }
  }

  return {
    currentTier: tier,
    juhwaipma: phase,
    recentWinRate: lastRate,
    recentWinLossRatio: lastRatio,
    beominProgress: null,
    promoteStreak,
  }
}

/** 다음 경지 진행률(퀘스트 카드). 마지막 경지면 null. */
export function nextTierProgress(
  current: SkillTier,
  totalAssets: number,
  rate: number | null,
  ratio: number | null,
): { nextTier: SkillTier; assetsProgress: number; winRateProgress: number; ratioProgress: number } | null {
  if (current >= LAST_TIER) return null
  const next = current + 1
  const req = REQUIREMENTS[next]
  if (req.minTotalAssets === null || req.minWinRate === null || req.minWinLossRatio === null) return null
  return {
    nextTier: next,
    assetsProgress: Math.min(totalAssets / req.minTotalAssets, 1),
    winRateProgress: Math.min((rate ?? 0) / req.minWinRate, 1),
    ratioProgress: Math.min((ratio ?? 0) / req.minWinLossRatio, 1),
  }
}
