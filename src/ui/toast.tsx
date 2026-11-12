// 저장 확인 알림 — 저장 순간 화면 아래에 1.8초 떴다 사라진다(반복 배너가 아니라 그 순간의 확인).
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current)
    setMessage(text)
    timer.current = setTimeout(() => setMessage(null), 1800)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message &&
        createPortal(
          <div className="toast" role="status">
            {message}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

export function useToast(): (message: string) => void {
  return useContext(ToastContext)
}
