// 앱 틀 — 탭(현황·거래내역·설정) 전환, 상세 화면(확인표), 시트(입력·수정·메모·모아보기·현재가)를 한곳에서 띄운다.
import { CalendarDays, List } from 'lucide-react'
import { useMemo, useState } from 'react'
import { fixedDateText, holdingMemo, type JournalContext } from '../core'
import type { EntryRequest } from '../state/entry'
import { useJournal } from '../state/journal'
import { SheetContext, type EditTarget, type SheetActions } from '../state/sheets'
import { useHashRoute } from '../ui/hooks'
import { Page, TabBar, TopBar } from '../ui/layout'
import { Sheet } from '../ui/Sheet'
import { ToastProvider } from '../ui/toast'
import { AssetDetailSheet } from './AssetDetailSheet'
import { EditSheet } from './edit/EditSheets'
import { EntrySheet } from './entry/EntrySheet'
import { HistoryScreen } from './history/HistoryScreen'
import { ChecklistDetail } from './home/Checklist'
import { HomeScreen } from './home/HomeScreen'
import { BulkMarkSheet, MarkPriceSheet } from './home/MarkSheets'
import { MemoThreadSheet } from './memo/MemoSheets'
import { GuideScreen } from './guide/GuideScreen'
import { FxRateSheet } from './settings/FxRateSheet'
import { SettingsScreen } from './settings/SettingsScreen'

const TITLES: Record<string, string> = { '/home': '현황', '/history': '거래내역', '/settings': '설정', '/checklist': '확인표', '/guide': '가이드' }

export function AppShell({ email }: { email?: string }) {
  return (
    <ToastProvider>
      <Shell email={email} />
    </ToastProvider>
  )
}

function Shell({ email }: { email?: string }) {
  const [path, navigate, replace] = useHashRoute()
  const { data, snapshot } = useJournal()
  const [entry, setEntry] = useState<EntryRequest | null>(null)
  // 매도 전 확인 — 그 거래에 보유 메모가 있으면 먼저 보여주고, "그래도 매도할게요"면 입력 시트를 연다.
  const [pendingSell, setPendingSell] = useState<EntryRequest | null>(null)
  const [edit, setEdit] = useState<EditTarget | null>(null)
  const [memos, setMemos] = useState<{ tradeId: string; assetName: string; context: JournalContext } | null>(null)
  const [asset, setAsset] = useState<string | null>(null)
  const [markId, setMarkId] = useState<string | null>(null)
  const [bulkMark, setBulkMark] = useState(false)
  const [fxSheet, setFxSheet] = useState(false)
  const [calendar, setCalendar] = useState(false)
  const [routePath, query] = path.split('?')
  const route = routePath in TITLES ? routePath : '/home'
  const focus = new URLSearchParams(query ?? '').get('focus')
  const isTab = route === '/home' || route === '/history' || route === '/settings'

  const actions = useMemo<SheetActions>(
    () => ({
      openEntry: (request) => {
        if (request.kind === 'sell' && holdingMemo(data.journals, request.positionId)) setPendingSell(request)
        else setEntry(request)
      },
      openEdit: setEdit,
      openMemos: (tradeId, assetName, context) => setMemos({ tradeId, assetName, context }),
      openAsset: setAsset,
      openMark: setMarkId,
      openBulkMark: () => setBulkMark(true),
      openFxRate: () => setFxSheet(true),
      showRecord: (recordId) => {
        setMemos(null)
        setAsset(null)
        setCalendar(false)
        navigate(`/history?focus=${recordId}`)
      },
    }),
    [data.journals, navigate],
  )
  const memo = pendingSell?.kind === 'sell' ? holdingMemo(data.journals, pendingSell.positionId) : null
  const markPosition = snapshot.openPositions.find((p) => p.id === markId)

  return (
    <SheetContext.Provider value={actions}>
      <div className="app">
        <TopBar
          title={TITLES[route]}
          onAdd={route === '/home' || route === '/history' ? () => setEntry({ kind: 'new' }) : undefined}
          onBack={isTab ? undefined : () => history.back()}
          extra={
            route === '/history' && (
              <button type="button" className="icon-button tone-accent" aria-label={calendar ? '목록 보기' : '캘린더 보기'} onClick={() => setCalendar((c) => !c)}>
                {calendar ? <List size={22} /> : <CalendarDays size={22} />}
              </button>
            )
          }
        />
        <Page>
          {route === '/home' && <HomeScreen onOpenChecklist={() => navigate('/checklist')} />}
          {route === '/history' && <HistoryScreen calendar={calendar} focus={focus} onFocused={() => replace('/history')} />}
          {route === '/settings' && <SettingsScreen email={email} onOpenGuide={() => navigate('/guide')} />}
          {route === '/guide' && <GuideScreen />}
          {route === '/checklist' && <ChecklistDetail />}
        </Page>
        {isTab && <TabBar current={route} onSelect={navigate} />}

        {entry && <EntrySheet request={entry} onClose={() => setEntry(null)} />}
        {edit && <EditSheet target={edit} onClose={() => setEdit(null)} />}
        {memos && <MemoThreadSheet {...memos} onClose={() => setMemos(null)} />}
        {asset && <AssetDetailSheet assetName={asset} onClose={() => setAsset(null)} />}
        {markPosition && <MarkPriceSheet position={markPosition} onClose={() => setMarkId(null)} />}
        {fxSheet && <FxRateSheet onClose={() => setFxSheet(false)} />}
        {bulkMark && <BulkMarkSheet positions={[...snapshot.openPositions].sort((a, b) => b.positionCost - a.positionCost)} onClose={() => setBulkMark(false)} />}
        {pendingSell && memo && (
          // 보유 중일 때 남겨둔 생각을 매도 직전에 한 번 더 — 감정적으로 급하게 파는 걸 되돌아보게.
          <Sheet title="매도 전 확인" onClose={() => setPendingSell(null)}>
            <div className="memo-confirm">
              <strong>보유 중일 때 남겨둔 생각이 있어요</strong>
              <div className="memo-confirm-text">
                <span className="muted small block">{fixedDateText(memo.date)}</span>
                {memo.text}
              </div>
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
              <button type="button" className="link" onClick={() => setPendingSell(null)}>
                다시 생각해볼게요
              </button>
            </div>
          </Sheet>
        )}
      </div>
    </SheetContext.Provider>
  )
}
