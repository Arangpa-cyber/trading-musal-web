// 경지 카드 — 지금까지 모든 거래의 통산 성적표: 경지 히어로(큰 한자·낙관)·죽간 띠 + 통산 지표 9칸(조정 손익비는 금색 띠). 주화입마 알약만 곁들인다
// (완료 거래 진행·승급 조건·주화입마 상태는 승급 심사 카드). 누적수익률은 총자산 추이 카드에 있다.
import { Trophy } from 'lucide-react'
import { blockAvgLossWarn, blockBeyondWarn, blockHoldWarning, phaseSeverity, summarize, type JuhwaipmaPhase } from '../../core'
import { useJournal } from '../../state/journal'
import { Card, Pill, SectionHeader, StatCell } from '../../ui/components'
import { percent, percentOrDash } from '../../ui/format'
import { adjustedText, adjustedTone, beyondLabel, beyondText, days, ratioText } from './Checklist'
import { TierHero, TierSlips } from './TierArt'

const PHASE_PILL: Record<Exclude<JuhwaipmaPhase['kind'], 'normal'>, string> = { yeokryu: '역류', juhwa: '주화', ipma: '입마', toebo: '퇴보' }

export function TierCard() {
  const { data, snapshot: s } = useJournal()
  const limit = data.settings.maxStopLossPercent
  const result = s.grading
  const all = summarize(s.outcomes, null, limit)
  const phase = result.juhwaipma
  return (
    <Card highlighted>
      <SectionHeader
        title="경지"
        icon={Trophy}
        trailing={phase.kind !== 'normal' ? <Pill text={PHASE_PILL[phase.kind]} tone="orange" prominent={phaseSeverity(phase) >= 2} /> : undefined}
      />
      <TierHero tier={result.currentTier} />
      <TierSlips tier={result.currentTier} />

      <div className="stat-grid">
        <StatCell label="승률" value={all.count ? percent(all.winRate) : '-'} />
        <StatCell label="평균수익률" value={percentOrDash(all.avgWin)} tone="red" />
        <StatCell label="평균손실률" value={percentOrDash(all.avgLoss)} tone={blockAvgLossWarn(all) ? 'orange' : 'blue'} />

        <StatCell label="손익비" value={all.count ? ratioText(all) : '-'} />
        <StatCell label="조정 손익비" value={adjustedText(all)} tone={adjustedTone(all)} highlight />
        <StatCell label={beyondLabel(limit)} value={beyondText(all)} tone={blockBeyondWarn(all) ? 'orange' : 'default'} compact />

        <StatCell label="수익 보유 평균" value={days(all.avgWinHoldDays)} />
        <StatCell label="손실 보유 평균" value={days(all.avgLossHoldDays)} tone={blockHoldWarning(all) ? 'orange' : 'default'} />
        <StatCell label="완료 거래" value={`${all.count}건`} />
      </div>
    </Card>
  )
}
