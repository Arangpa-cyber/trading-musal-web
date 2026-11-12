// 탭하면 바로 뜨는 메뉴(iOS `Menu`) — 앱 전체 리스트 항목이 이 방식(롱프레스 아님).
// 매도 항목엔 destructive(빨강)를 쓰지 않는다 — 빨강은 "삭제"에만.
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem =
  | {
      label: string
      icon?: ComponentType<{ size?: number }>
      /** 항목 아래 작은 부제 */
      detail?: string
      disabled?: boolean
      destructive?: boolean
      onSelect: () => void
    }
  | 'divider'

export function Menu({ items, children, className = '', label }: { items: MenuItem[]; children: ReactNode; className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  // 누른 자리 — 메뉴를 그 근처에 띄운다(iOS처럼). 키보드로 열면 버튼 가운데.
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`menu-anchor ${className}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          setPoint(e.detail > 0 ? { x: e.clientX, y: e.clientY } : null)
          setOpen((o) => !o)
        }}
      >
        {children}
      </button>
      {open && anchor.current && <MenuPopover anchor={anchor.current} point={point} items={items} onClose={() => setOpen(false)} />}
    </>
  )
}

function MenuPopover({ anchor, point, items, onClose }: { anchor: HTMLElement; point: { x: number; y: number } | null; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // 누른 자리 바로 아래(공간이 없으면 위), 화면 밖으로 안 나가게.
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const a = anchor.getBoundingClientRect()
    const m = menu.getBoundingClientRect()
    const margin = 8
    const x = point?.x ?? a.left + a.width / 2
    const below = point ? point.y + 8 : a.bottom + 4
    const above = point ? point.y - m.height - 8 : a.top - m.height - 4
    const top = below + m.height <= window.innerHeight - margin ? below : Math.max(margin, above)
    const left = Math.max(margin, Math.min(x - m.width / 2, window.innerWidth - m.width - margin))
    setPos({ top, left })
  }, [anchor, point])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onScroll = () => onClose()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [anchor, onClose])

  return createPortal(
    <div ref={ref} className="menu" role="menu" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}>
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={i} className="menu-divider" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`menu-item ${item.destructive ? 'destructive' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            <span className="menu-text">
              <span>{item.label}</span>
              {item.detail && <span className="menu-detail">{item.detail}</span>}
            </span>
            {item.icon && <item.icon size={17} />}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}
