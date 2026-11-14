// 현황 — 프로필 헤더(고정) → 경지(고정) → (기록이 없으면 첫 안내) → 나머지 카드(설정의 카드 순서대로).
import { PlusCircle, UserSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { lockedRiskPercent, phaseSeverity, phaseStatusText, tierName, BEOMIN } from '../../core'
import { useJournal } from '../../state/journal'
import { useSheets } from '../../state/sheets'
import { Card, SectionHeader, Text } from '../../ui/components'
import { useLocalStorage } from '../../ui/hooks'
import { cardOrder } from './cardOrder'
import { ChecklistCard } from './Checklist'
import { HoldingsCard } from './HoldingsCard'
import { PortfolioCard } from './PortfolioCard'
import { ReturnDistributionCard } from './ReturnDistributionCard'
import { TierEventModal } from './TierArt'
import { TierCard } from './TierCard'
import { TierReviewCard } from './TierReviewCard'
import { TrendCard } from './TrendCard'

export function HomeScreen({ onOpenChecklist }: { onOpenChecklist: () => void }) {
  const { data, snapshot } = useJournal()
  const { openEntry } = useSheets()
  const notice = useTierNotice()
  const empty = data.cash.length === 0 && data.buys.length === 0

  return (
    <div className="stack">
      <div className="profile-header">
        <UserSquare size={40} className="tone-gold" strokeWidth={2.2} />
        <div>
          <div className="nickname">{data.profile?.nickname ?? '이름 없는 자'}</div>
          <Text tone="muted" size="small">{tierName(snapshot.grading.currentTier)} 경지</Text>
        </div>
      </div>

      <TierCard />

      {/* 처음 — 기록이 없으면 입금부터(총자산이 0이면 허용손실·추천 수량을 못 구한다). 데이터를 대신 넣지 않는다. */}
      {empty && (
        <Card>
          <SectionHeader title="먼저 입금을 기록하세요" icon={PlusCircle} />
          <Text tone="muted" size="small">
            계좌에 넣은 돈(입금)을 먼저 적어야 총자산이 잡히고, 매수할 때 리스크율로 허용손실·추천 수량이 계산돼요.
          </Text>
          <button type="button" className="primary wide" onClick={() => openEntry({ kind: 'cash', type: 'deposit' })}>
            입금 기록하기
          </button>
        </Card>
      )}

      {cardOrder(data.settings.homeCardOrder).map((card) =>
        card === 'tierReview' ? (
          <TierReviewCard key={card} />
        ) : card === 'holdings' ? (
          <HoldingsCard key={card} />
        ) : card === 'portfolio' ? (
          <PortfolioCard key={card} />
        ) : card === 'returnDistribution' ? (
          <ReturnDistributionCard key={card} />
        ) : card === 'trend' ? (
          <TrendCard key={card} />
        ) : (
          <ChecklistCard key={card} onOpen={onOpenChecklist} />
        ),
      )}

      {notice.alert && <TierEventModal kind={notice.alert.kind} tier={notice.alert.tier} title={notice.alert.title} message={notice.alert.message} onClose={notice.dismiss} />}
    </div>
  )
}

/**
 * 경지 변화 알림 — 지난번보다 경지가 오르면 축하(금빛 낙관 연출), 내려가면(강등) 한 번, 주화입마가 리스크 제한 단계(주화·입마·퇴보)로
 * 더 나빠진 순간 한 번(주황 낙관이 흔들리는 연출). 반복 배너가 아니라 그 순간의 사건 알림(기기별로 마지막 본 상태를 기억).
 */
function useTierNotice() {
  const { data, snapshot } = useJournal()
  const result = snapshot.grading
  const [lastTier, setLastTier] = useLocalStorage('lastSeenTier', BEOMIN)
  const [lastSeverity, setLastSeverity] = useLocalStorage('lastSeenJuhwaipmaSeverity', 0)
  const [alert, setAlert] = useState<{ kind: 'up' | 'warn'; tier: number; title: string; message: string } | null>(null)
  const tier = result.currentTier
  const severity = phaseSeverity(result.juhwaipma)

  useEffect(() => {
    if (tier > lastTier) {
      setAlert({ kind: 'up', tier, title: `${tierName(tier)} 경지에 올랐어요!`, message: '총자산과 최근 성과(조정 손익비·손익비·손실 통제)가 다음 경지 기준을 겹치지 않는 20건 구간마다 넘었어요.' })
    } else if (tier < lastTier && tier > BEOMIN) {
      setAlert({
        kind: 'warn',
        tier,
        title: `${tierName(tier)}(으)로 강등됐어요`,
        message:
          severity === 4
            ? '최근 20건 기대손익이 오래 마이너스라 경지가 한 단계 내려갔어요. 운기조식(5회 연속 플러스)으로 회복하세요.'
            : '총자산이 이전 경지 최소 아래로 내려갔거나(출금 포함), 최근 성과가 이전 경지 유지 기준에 2구간 연속 못 미쳤어요.',
      })
    } else if (severity > lastSeverity && severity >= 2) {
      const base = data.settings.defaultRiskPercent
      const lock = lockedRiskPercent(result.juhwaipma, base)
      setAlert({
        kind: 'warn',
        tier,
        title: phaseStatusText(result.juhwaipma),
        message: `최근 20건·10건 기대손익이 계속 마이너스예요. 평소 리스크율 ${base}%가 최대 ${lock ?? '-'}%로 제한돼요 — 운기조식(5회 연속 플러스)으로 풀려요.`,
      })
    }
    if (tier !== lastTier) setLastTier(tier)
    if (severity !== lastSeverity) setLastSeverity(severity)
  }, [tier, severity, lastTier, lastSeverity, result.juhwaipma, data.settings.defaultRiskPercent, setLastTier, setLastSeverity])

  return { alert, dismiss: () => setAlert(null) }
}
