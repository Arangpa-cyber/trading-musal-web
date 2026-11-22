// 시트(iOS 모달) — 폰에선 아래에서 올라오는 시트, PC에선 가운데 창. 툴바: 왼쪽 위 닫기/취소, 오른쪽 위 확인·보조.
// `blockDismiss`면 바깥 누르기·Esc로 닫지 않고 `onAttemptDismiss`를 부른다(쓰던 내용 보호).
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

let lockCount = 0

export function Sheet({
  title,
  onClose,
  leading,
  trailing,
  children,
  blockDismiss,
  onAttemptDismiss,
}: {
  title: string
  onClose: () => void
  leading?: ReactNode
  trailing?: ReactNode
  children: ReactNode
  blockDismiss?: boolean
  onAttemptDismiss?: () => void
}) {
  const dismiss = () => (blockDismiss ? onAttemptDismiss?.() : onClose())
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissRef.current()
    document.addEventListener('keydown', onKey)
    // 스크롤 잠금은 열린 시트 개수로 센다 — 겹친 시트가 어떤 순서로 닫혀도 마지막이 닫힐 때 푼다.
    lockCount += 1
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      lockCount -= 1
      if (lockCount === 0) document.body.style.overflow = ''
    }
  }, [])
  return createPortal(
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div className="sheet" role="dialog" aria-modal aria-label={title}>
        <header className="sheet-bar">
          <div className="bar-side">{leading ?? <button type="button" className="bar-button" onClick={dismiss}>닫기</button>}</div>
          <h1 className="bar-title">{title}</h1>
          <div className="bar-side end">{trailing}</div>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** 확인 창(iOS alert) — 버튼 1~2개. */
export function Alert({
  title,
  message,
  actions,
  children,
}: {
  title: string
  message?: string
  actions: { label: string; onSelect: () => void; destructive?: boolean; primary?: boolean; disabled?: boolean }[]
  /** 입력 칸 등(별호 바꾸기) */
  children?: ReactNode
}) {
  return createPortal(
    <div className="sheet-backdrop alert-backdrop">
      <div className="alert" role="alertdialog" aria-modal aria-label={title}>
        <h2>{title}</h2>
        {message && <p>{message}</p>}
        {children && <div className="alert-body">{children}</div>}
        <div className={`alert-actions ${actions.length > 2 ? 'vertical' : ''}`}>
          {actions.map((a) => (
            <button key={a.label} type="button" disabled={a.disabled} className={`${a.destructive ? 'destructive' : ''} ${a.primary ? 'bold' : ''}`} onClick={a.onSelect}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
