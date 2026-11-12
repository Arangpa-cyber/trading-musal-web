// 앱 틀 — 탭(현황·거래내역·설정) 전환, 상세 화면(확인표), 입력 시트.
import { useState } from 'react'
import type { EntryRequest } from '../state/entry'
import { useHashRoute } from '../ui/hooks'
import { Page, TabBar, TopBar } from '../ui/layout'
import { Sheet } from '../ui/Sheet'
import { ChecklistDetail } from './home/Checklist'
import { HomeScreen } from './home/HomeScreen'
import { SettingsScreen } from './SettingsScreen'

const TITLES: Record<string, string> = { '/home': '현황', '/history': '거래내역', '/settings': '설정', '/checklist': '확인표' }

export function AppShell({ email }: { email?: string }) {
  const [path, navigate] = useHashRoute()
  const [entry, setEntry] = useState<EntryRequest | null>(null)
  const route = path in TITLES ? path : '/home'
  const isTab = route === '/home' || route === '/history' || route === '/settings'
  const openEntry = (request: EntryRequest) => setEntry(request)

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

      {entry && (
        <Sheet title="입력" onClose={() => setEntry(null)}>
          <p className="empty">입력 화면(예수금·매수·매도)은 다음 단계(4-2)에서 만들어요.</p>
        </Sheet>
      )}
    </div>
  )
}
