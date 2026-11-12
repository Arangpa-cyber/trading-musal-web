// 경지 카드 — 현재 경지·주화입마·다음 경지 게이지·경지 띠 + 통산 지표.
import { Trophy } from 'lucide-react'
import {
  annualizedReturnPercent,
  firstDepositDate,
  nextStepHint,
  nextTierProgress,
  phaseSeverity,
  PROMOTE_CONFIRM,
  RECOVERY_CONFIRM,
  tierName,
  tierRequirements,
  TIERS,
  timeWeightedReturnPercent,
  winLossRatio,
  winRate,
  type JuhwaipmaPhase,
  type TierGradingResult,
} from '../../core'
import { useJournal } from '../../state/journal'
import { Card, Gauge, InkDivider, SectionHeader, StatCell, Text } from '../../ui/components'
import { percentOrDash, percent, ratio } from '../../ui/format'
import { useBlind } from '../../ui/hooks'

export function TierCard() {
  const { snapshot: s } = useJournal()
  const [blind] = useBlind()
  const outcomes = s.outcomes
  const twr = timeWeightedReturnPercent(s.timeline)
  const start = firstDepositDate(s.cashTxs)
  const annualized = twr !== null && start !== null ? annualizedReturnPercent(twr, Math.floor((Date.now() - start) / 86_400_000)) : null
  const returns = outcomes.map((o) => o.returnPercent)
  const wins = returns.filter((r) => r > 0)
  const losses = returns.filter((r) => r < 0)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null)

  return (
    <Card highlighted>
      <SectionHeader title="경지" icon={Trophy} />
      <TierProgress result={s.grading} totalAssets={s.totalAssets} blind={blind} />
      <InkDivider />
      <Text tone="muted" size="small">통산 완료 거래 {outcomes.length}건</Text>
      <div className="stat-grid">
        <StatCell label="누적수익률" value={percentOrDash(twr)} />
        <StatCell label="연환산수익률" value={percentOrDash(annualized)} />
        <StatCell label="통산 승률" value={percent(winRate(outcomes) * 100)} />
        <StatCell label="평균수익률" value={percentOrDash(avg(wins))} tone="red" />
        <StatCell label="평균손실률" value={percentOrDash(avg(losses))} tone="blue" />
        <StatCell label="통산 손익비" value={ratio(winLossRatio(outcomes))} />
      </div>
    </Card>
  )
}

function TierProgress({ result, totalAssets, blind }: { result: TierGradingResult; totalAssets: number; blind: boolean }) {
  const info = nextTierProgress(result.currentTier, totalAssets, result.recentWinRate, result.recentWinLossRatio)
  return (
    <div className="stack">
      <div className="row-between top">
        <strong className="tier-title">현재 경지: {tierName(result.currentTier)}</strong>
        <JuhwaipmaBadge phase={result.juhwaipma} tier={result.currentTier} />
      </div>

      {result.beominProgress ? (
        <div className="stack-tight">
          <Text tone="muted">다음 경지: 삼류 까지</Text>
          <Gauge
            label="완료 거래"
            progress={result.beominProgress.closed / Math.max(result.beominProgress.needed, 1)}
            valueText={`${result.beominProgress.closed}건 / ${result.beominProgress.needed}건`}
          />
        </div>
      ) : info ? (
        <div className="stack-tight">
          <Text tone="muted">다음 경지: {tierName(info.nextTier)} 까지</Text>
          <NextGauges result={result} info={info} totalAssets={totalAssets} blind={blind} />
        </div>
      ) : (
        <Text tone="muted">이미 최고 경지(생사경)에 도달했습니다</Text>
      )}

      <div className="tier-strip">
        {TIERS.map((name, tier) => (
          <span key={name} className={`tier-badge ${tier === result.currentTier ? 'current' : tier < result.currentTier ? 'passed' : ''}`}>
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

function NextGauges({
  result,
  info,
  totalAssets,
  blind,
}: {
  result: TierGradingResult
  info: NonNullable<ReturnType<typeof nextTierProgress>>
  totalAssets: number
  blind: boolean
}) {
  const req = tierRequirements(info.nextTier)
  const all = info.assetsProgress >= 1 && info.winRateProgress >= 1 && info.ratioProgress >= 1
  const items: [string, number][] = [
    ['총자산', info.assetsProgress],
    ['타율', info.winRateProgress],
    ['손익비', info.ratioProgress],
  ]
  const bottleneck = items.reduce((a, b) => (b[1] < a[1] ? b : a))[0]
  return (
    <>
      <Gauge
        label="총자산"
        progress={info.assetsProgress}
        valueText={`${blind ? '•••' : `${Math.trunc(totalAssets).toLocaleString('ko-KR')}원`} / ${(req.minTotalAssets ?? 0).toLocaleString('ko-KR')}원`}
      />
      <Gauge
        label="타율"
        progress={info.winRateProgress}
        valueText={`${Math.trunc((result.recentWinRate ?? 0) * 100)}% / ${Math.trunc((req.minWinRate ?? 0) * 100)}%`}
      />
      <Gauge
        label="손익비"
        progress={info.ratioProgress}
        valueText={`${ratio(result.recentWinLossRatio ?? 0)} / ${ratio(req.minWinLossRatio ?? 0)}`}
      />
      {all ? (
        phaseSeverity(result.juhwaipma) >= 2 ? (
          <Text tone="orange" size="small">조건은 채웠지만 주화입마 중엔 승급 심사가 멈춰요 — 운기조식부터.</Text>
        ) : (
          <Text tone="green" size="small" bold>
            승급 심사 {result.promoteStreak}/{PROMOTE_CONFIRM} — 다음 매도 {PROMOTE_CONFIRM - result.promoteStreak}번도 조건을 지키면 {tierName(info.nextTier)}(으)로 승급
          </Text>
        )
      ) : (
        <Text tone="orange" size="small">가장 뒤처진 조건: {bottleneck}</Text>
      )}
    </>
  )
}

function JuhwaipmaBadge({ phase, tier }: { phase: JuhwaipmaPhase; tier: number }) {
  if (phase.kind === 'normal') return null
  const hint = nextStepHint(phase, tier)
  const title =
    phase.kind === 'yeokryu'
      ? '역류 — 최근 성과 마이너스 주의'
      : phase.kind === 'juhwa'
        ? '주화 (리스크 0.5% 제한)'
        : phase.kind === 'ipma'
          ? '입마 (리스크 0.25% 제한)'
          : '퇴보 — 한 단계 강등'
  return (
    <div className="juhwa-badge">
      <Text tone={phase.kind === 'yeokryu' ? 'orange' : 'red'} size="small" bold={phase.kind === 'ipma' || phase.kind === 'toebo'}>
        {title}
      </Text>
      {phase.kind !== 'yeokryu' && <Text tone="muted" size="tiny">운기조식 {phase.recover}/{RECOVERY_CONFIRM}</Text>}
      {hint && <Text tone="muted" size="tiny">{hint}</Text>}
    </div>
  )
}
