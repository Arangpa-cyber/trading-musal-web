// 앱 틀 — 탭(현황·거래내역·설정) 전환, 상세 화면(확인표), 입력 시트.
import { useState } from 'react'
import { holdingMemo } from '../core'
import type { EntryRequest } from '../state/entry'
import { useJournal } from '../state/journal'
import { shortDate } from '../ui/format'
import { useHashRoute } from '../ui/hooks'
import { Page, TabBar, TopBar } from '../ui/layout'
import { Sheet } from '../ui/Sheet'
import { EntrySheet } from './entry/EntrySheet'
import { ChecklistDetail } from './home/Checklist'
import { HomeScreen } from './home/HomeScreen'
import { SettingsScreen } from './SettingsScreen'

const TITLES: Record<string, string> = { '/home': '현황', '/history': '거래내역', '/settings': '설정', '/checklist': '확인표' }

export function AppShell({ email }: { email?: string }) {
  const [path, navigate] = useHashRoute()
  const { data } = useJournal()
  const [entry, setEntry] = useState<EntryRequest | null>(null)
  // 매도 전 확인 — 그 거래에 보유 메모가 있으면 먼저 보여주고, "그래도 매도할게요"면 입력 시트를 연다.
  const [pendingSell, setPendingSell] = useState<EntryRequest | null>(null)
  const route = path in TITLES ? path : '/home'
  const isTab = route === '/home' || route === '/history' || route === '/settings'
  const openEntry = (request: EntryRequest) => {
    if (request.kind === 'sell' && holdingMemo(data.journals, request.positionId)) setPendingSell(request)
    else setEntry(request)
  }
  const memo = pendingSell?.kind === 'sell' ? holdingMemo(data.journals, pendingSell.positionId) : null

  return (
    <div className="app">
      <TopBar
        title={TITLES[route]}
        onAdd={route === '/home' || route === '/history' ? () => openEntry({ kind: 'new' }) : undefined}
        onBack={isTab ? undefined : () => history.back()}
      />
      <Page>
        {route === '/home' && <HomeScreen openEntry={openEntry} onOpenChecklist={() => navigate('/checklist')} />}
        {route === '/history' && <p className="empty">거래내역은 다음 단계(4-3)에서 만들어요.</p>}
        {route === '/settings' && <SettingsScreen email={email} />}
        {route === '/checklist' && <ChecklistDetail />}
      </Page>
      {isTab && <TabBar current={route} onSelect={navigate} />}

      {entry && <EntrySheet request={entry} onClose={() => setEntry(null)} />}
      {pendingSell && memo && (
        <Sheet title="매도 전 확인" onClose={() => setPendingSell(null)} leading={<button type="button" className="bar-button" onClick={() => setPendingSell(null)}>취소</button>}>
          <div className="memo-confirm">
            <p className="muted small">보유하면서 남긴 메모예요 ({shortDate(memo.date)}). 다시 읽고 매도하세요.</p>
            <div className="memo-confirm-text">{memo.text}</div>
            <button
              type="button"
              className="primary wide"
              onClick={() => {
                setEntry(pendingSell)
                setPendingSell(null)
              }}
            >
              그래도 매도할게요
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
