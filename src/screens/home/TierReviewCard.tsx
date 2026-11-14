// 승급 심사 카드 — 경지 판정의 근거(최근 20건 구간 기준): 주화입마 상태·승급 조건·증거 구간·유지 심사·자산 여유.
// 경지 카드는 통산 성적표이고, 이 카드는 "지금 승급·강등·리스크 제한이 어떻게 되고 있나"를 보여 준다. 범인이면 숨긴다.
import { AlertTriangle, Target } from 'lucide-react'
import {
  assetCeiling,
  BEOMIN,
  LAST_TIER,
  LOSING_STREAK_NOTICE,
  lockedRiskPercent,
  nextStepHint,
  phaseSeverity,
  RECOVERY_CONFIRM,
  recoverStreak,
  tierName,
  type ConditionStatus,
  type JuhwaipmaPhase,
  type TierGradingResult,
} from '../../core'
import { useJournal } from '../../state/journal'
import { Card, Gauge, SectionHeader, Text } from '../../ui/components'
import { wonCompact } from '../../ui/format'
import { useBlind } from '../../ui/hooks'

const PHASE_TITLE: Record<Exclude<JuhwaipmaPhase['kind'], 'normal'>, string> = {
  yeokryu: '역류 · 연패 주의',
  juhwa: '주화 · 리스크 제한 중',
  ipma: '입마 · 리스크 더 제한 중',
  toebo: '퇴보 · 경지 한 단계 하락',
}

export function TierReviewCard() {
  const { data, snapshot: s } = useJournal()
  const [blind] = useBlind()
  const g = s.grading
  if (g.currentTier === BEOMIN) return null
  const base = data.settings.defaultRiskPercent
  const paused = phaseSeverity(g.juhwaipma) >= 2
  return (
    <Card>
      <SectionHeader title="승급 심사" icon={Target} trailing={<Text tone="muted" size="tiny">최근 20건 구간 기준</Text>} />
      <PhasePanel phase={g.juhwaipma} tier={g.currentTier} streak={g.losingStreak} totalAssets={s.totalAssets} base={base} blind={blind} />
      <PromotionSection g={g} paused={paused} blind={blind} />
      <KeepSection g={g} blind={blind} />
    </Card>
  )
}

/** 주화입마 패널 — 걸렸을 때만. 아니면 연패 안내만(3연패부터). */
function PhasePanel({ phase, tier, streak, totalAssets, base, blind }: { phase: JuhwaipmaPhase; tier: number; streak: number; totalAssets: number; base: number; blind: boolean }) {
  if (phase.kind === 'normal') {
    return streak >= LOSING_STREAK_NOTICE ? (
      <div className="juhwa-panel">
        <Text tone="orange" bold size="small"><AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> 최근 {streak}연패예요</Text>
        <Text tone="orange" size="small">크기를 줄여 보세요 — 연패에 같은 크기로 계속 가면 손실이 커져요.</Text>
      </div>
    ) : null
  }
  const lock = lockedRiskPercent(phase, base)
  const hint = nextStepHint(phase, tier)
  const recover = recoverStreak(phase)
  const money = (pct: number) => (blind ? '•••' : wonCompact((totalAssets * pct) / 100))
  return (
    <div className={`juhwa-panel sev${phaseSeverity(phase)}`}>
      <Text tone="orange" bold><AlertTriangle size={14} style={{ verticalAlign: '-2px' }} /> {PHASE_TITLE[phase.kind]}</Text>
      {lock !== null ? (
        <>
          <Text size="small">허용손실 {money(base)} → <strong>{money(lock)}</strong></Text>
          <Text tone="muted" size="tiny">평소 리스크율 {base}% → {lock}%</Text>
        </>
      ) : (
        <Text size="small">아직 리스크 제한은 없어요. 최근 20건·10건이 계속 마이너스면 제한이 걸려요.
          {streak >= LOSING_STREAK_NOTICE ? ` (최근 ${streak}연패 — 크기를 줄여 보세요)` : ''}
        </Text>
      )}
      {hint && <Text tone="muted" size="tiny">{hint}</Text>}
      {recover !== null && (
        <Text tone="muted" size="tiny">
          운기조식 <span className="recover-dots">{'●'.repeat(recover)}{'○'.repeat(Math.max(RECOVERY_CONFIRM - recover, 0))}</span> {recover}/{RECOVERY_CONFIRM}
        </Text>
      )}
    </div>
  )
}

function conditionValue(c: ConditionStatus, blind: boolean): string {
  const v = c.value
  switch (c.key) {
    case 'assets':
      return `${blind ? '•••' : wonCompact(v ?? 0)} / ${wonCompact(c.limit)}`
    case 'adjusted':
    case 'bestTrade':
      return `${(v ?? 0).toFixed(2)} / ${c.limit.toFixed(2)}`
    case 'ratio':
      return `1:${(v ?? 0).toFixed(1)} / 1:${c.limit.toFixed(1)}`
    case 'avgLoss':
      return `${(v ?? 0).toFixed(1)}% / ${c.limit}% 이하`
    case 'beyond':
      return `${v ?? 0}회 / ${c.limit}회 이하`
  }
}

function PromotionSection({ g, paused, blind }: { g: TierGradingResult; paused: boolean; blind: boolean }) {
  const p = g.promotion
  if (!p) {
    return <Text tone="muted" size="small">{g.currentTier >= LAST_TIER ? '최고 경지(생사경)예요 — 유지 심사만 이어져요.' : ''}</Text>
  }
  const unmet = p.conditions.filter((c) => !c.met).sort((a, b) => a.progress - b.progress)
  const met = p.conditions.filter((c) => c.met)
  const shown = unmet.slice(0, 3)
  return (
    <div className={`stack-tight ${paused ? 'dim-section' : ''}`} style={paused ? { opacity: 0.55 } : undefined}>
      <Text bold>
        {tierName(p.nextTier)}까지{unmet.length > 0 ? ` · 막힌 조건 ${unmet.length}개` : ' · 조건을 모두 갖췄어요'}
      </Text>
      {shown.map((c, i) => (
        <Gauge key={c.key} label={c.label} progress={c.progress} valueText={conditionValue(c, blind)} warn={i === 0} />
      ))}
      {unmet.length > shown.length && <Text tone="muted" size="tiny">그 밖에 {unmet.length - shown.length}개가 더 모자라요.</Text>}
      {met.length > 0 && (
        <details className="review-met">
          <summary>충족 {met.length}개 보기</summary>
          <ul>
            {met.map((c) => (
              <li key={c.key} className="row-between">
                <span>✓ {c.label}</span>
                <span className="muted small">{conditionValue(c, blind)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="review-windows">
        <Text tone="muted" size="small">증거 구간(20건씩)</Text>
        {p.windows.map((w, i) => (
          <span key={i} className={`review-dot ${w === true ? 'pass' : w === false ? 'fail' : ''}`}>
            {w === true ? '✓' : w === false ? '✗' : '·'}
          </span>
        ))}
      </div>
      {paused ? (
        <Text tone="orange" size="small">주화입마 중엔 승급 심사가 멈춰요 — 운기조식부터.</Text>
      ) : p.ready ? (
        <Text tone="green" size="small" bold>승급 조건을 모두 갖췄어요 — 다음 매도 때 {tierName(p.nextTier)}(으)로 올라요.</Text>
      ) : null}
    </div>
  )
}

/** 유지 심사(강등 경고)와 자산 여유. */
function KeepSection({ g, blind }: { g: TierGradingResult; blind: boolean }) {
  const lines: { tone: 'orange' | 'muted'; text: string }[] = []
  if (g.keep && g.keep.failedWindows > 0) {
    lines.push({
      tone: 'orange',
      text: `${tierName(g.currentTier)} 유지 기준 미달 ${g.keep.failedWindows}/${g.keep.needed}구간 — 다음 구간도 미달이면 ${tierName(g.currentTier - 1)}(으)로 내려가요.`,
    })
  }
  if (g.assetFloor && g.assetFloor.margin <= 0.1) {
    const fallsTo = tierName(assetCeiling(g.assetFloor.minAssets - 1))
    lines.push({
      tone: g.assetFloor.margin <= 0.03 ? 'orange' : 'muted',
      text: `총자산이 ${wonCompact(g.assetFloor.minAssets)} 아래로 내려가면(출금 포함) 즉시 ${fallsTo}(으)로 내려가요.${blind ? '' : ` 지금 여유 ${(g.assetFloor.margin * 100).toFixed(0)}%`}`,
    })
  }
  if (!lines.length) return null
  return (
    <div className="stack-tight">
      {lines.map((l, i) => (
        <Text key={i} tone={l.tone} size="small">{l.tone === 'orange' ? '⚠ ' : ''}{l.text}</Text>
      ))}
    </div>
  )
}
