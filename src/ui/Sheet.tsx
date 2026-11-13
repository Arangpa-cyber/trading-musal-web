// 시트(iOS 모달) — 폰에선 아래에서 올라오는 시트, PC에선 가운데 창. 툴바: 왼쪽 위 닫기/취소, 오른쪽 위 확인·보조.
// `blockDismiss`면 바깥 누르기·Esc로 닫지 않고 `onAttemptDismiss`를 부른다(쓰던 내용 보호).
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  })
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
