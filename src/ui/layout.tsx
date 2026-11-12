// 앱 틀 — 위쪽 막대(왼쪽 블라인드·가운데 제목·오른쪽 +) + 아래쪽 3탭.
import { ChevronLeft, Eye, EyeOff, LayoutDashboard, Plus, ReceiptText, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { useBlind } from './hooks'

export const TABS = [
  { path: '/home', label: '현황', icon: LayoutDashboard },
  { path: '/history', label: '거래내역', icon: ReceiptText },
  { path: '/settings', label: '설정', icon: Settings },
] as const

/** 탭 화면 위쪽 막대 — 앱 공통 배치: 왼쪽 위 블라인드, 오른쪽 위 +(입력). */
export function TopBar({ title, onAdd, onBack }: { title: string; onAdd?: () => void; onBack?: () => void }) {
  const [blind, setBlind] = useBlind()
  return (
    <header className="top-bar">
      <div className="bar-side">
        {onBack ? (
          <button type="button" className="icon-button" onClick={onBack} aria-label="뒤로">
            <ChevronLeft size={24} />
          </button>
        ) : (
          <button
            type="button"
            className={`icon-button ${blind ? 'tone-orange' : 'tone-muted'}`}
            onClick={() => setBlind(!blind)}
            aria-label={blind ? '블라인드 끄기' : '블라인드 켜기'}
            aria-pressed={blind}
          >
            {blind ? <EyeOff size={21} /> : <Eye size={21} />}
          </button>
        )}
      </div>
      <h1 className="bar-title">{title}</h1>
      <div className="bar-side end">
        {onAdd && (
          <button type="button" className="icon-button tone-accent" onClick={onAdd} aria-label="입력">
            <Plus size={24} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </header>
  )
}

export function TabBar({ current, onSelect }: { current: string; onSelect: (path: string) => void }) {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.path}
          type="button"
          className={`tab ${current === t.path ? 'active' : ''}`}
          onClick={() => onSelect(t.path)}
          aria-current={current === t.path ? 'page' : undefined}
        >
          <t.icon size={22} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

/** 화면 본문 — 가운데 한 줄(폭 720px). */
export function Page({ children }: { children: ReactNode }) {
  return <main className="page">{children}</main>
}
