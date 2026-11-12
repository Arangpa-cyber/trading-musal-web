// 현황 — 프로필 헤더(고정) → 경지(고정) → (기록이 없으면 첫 안내) → 보유 자산 → 확인표.
// 수익분포·파이차트·총자산 추이·카드 순서는 4-4단계에서 더한다.
import { PlusCircle, UserSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { lockedRiskPercent, phaseSeverity, phaseStatusText, tierName, BEOMIN } from '../../core'
import type { OpenEntry } from '../../state/entry'
import { useJournal } from '../../state/journal'
import { Card, SectionHeader, Text } from '../../ui/components'
import { useLocalStorage } from '../../ui/hooks'
import { Alert } from '../../ui/Sheet'
import { ChecklistCard } from './Checklist'
import { HoldingsCard } from './HoldingsCard'
import { TierCard } from './TierCard'

export function HomeScreen({ openEntry, onOpenChecklist }: { openEntry: OpenEntry; onOpenChecklist: () => void }) {
  const { data, snapshot } = useJournal()
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

      <HoldingsCard openEntry={openEntry} />
      <ChecklistCard onOpen={onOpenChecklist} />

      {notice.alert && <Alert title={notice.alert.title} message={notice.alert.message} actions={[{ label: '확인', primary: true, onSelect: notice.dismiss }]} />}
    </div>
  )
}

/**
 * 경지 변화 알림 — 지난번보다 경지가 오르면 축하, 내려가면(강등) 한 번, 주화입마가 리스크 제한 단계(주화·입마·퇴보)로
 * 더 나빠진 순간 한 번. 반복 배너가 아니라 그 순간의 사건 알림(기기별로 마지막 본 상태를 기억).
 */
function useTierNotice() {
  const { snapshot } = useJournal()
  const result = snapshot.grading
  const [lastTier, setLastTier] = useLocalStorage('lastSeenTier', BEOMIN)
  const [lastSeverity, setLastSeverity] = useLocalStorage('lastSeenJuhwaipmaSeverity', 0)
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null)
  const tier = result.currentTier
  const severity = phaseSeverity(result.juhwaipma)

  useEffect(() => {
    if (tier > lastTier) {
      setAlert({ title: `${tierName(tier)} 경지에 올랐어요!`, message: '최근 20건의 승률·손익비와 총자산이 다음 경지 기준을 3번 연속 넘었어요.' })
    } else if (tier < lastTier && tier > BEOMIN) {
      setAlert({
        title: `${tierName(tier)}(으)로 강등됐어요`,
        message:
          severity === 4
            ? '최근 20건 기대손익이 오래 마이너스라 경지가 한 단계 내려갔어요. 운기조식(5회 연속 플러스)으로 회복하세요.'
            : '총자산이 이전 경지 기준 아래로 내려갔어요.',
      })
    } else if (severity > lastSeverity && severity >= 2) {
      const lock = lockedRiskPercent(result.juhwaipma)
      setAlert({
        title: phaseStatusText(result.juhwaipma),
        message: `최근 20건 기대손익이 계속 마이너스예요. 리스크율이 최대 ${lock ?? '-'}%로 제한돼요 — 운기조식(5회 연속 플러스)으로 풀려요.`,
      })
    }
    if (tier !== lastTier) setLastTier(tier)
    if (severity !== lastSeverity) setLastSeverity(severity)
  }, [tier, severity, lastTier, lastSeverity, result.juhwaipma, setLastTier, setLastSeverity])

  return { alert, dismiss: () => setAlert(null) }
}
