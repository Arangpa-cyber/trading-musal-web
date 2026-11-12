import { useCallback, useEffect, useState } from 'react'

/** 기기에 저장되는 값(localStorage) — 블라인드 모드처럼 백업에 넣지 않는 기기별 설정. */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  // 다른 탭·같은 화면의 다른 부분에서 바꾼 값도 따라간다.
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; value: T }>).detail
      if (detail?.key === key) setValue(detail.value)
    }
    window.addEventListener('local-storage', onChange)
    return () => window.removeEventListener('local-storage', onChange)
  }, [key])
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
        localStorage.setItem(key, JSON.stringify(next))
        queueMicrotask(() => window.dispatchEvent(new CustomEvent('local-storage', { detail: { key, value: next } })))
        return next
      })
    },
    [key],
  )
  return [value, set]
}

/** 블라인드 모드 — 금액만 •••(비율은 보임). 기기별. */
export function useBlind(): [boolean, (v: boolean) => void] {
  return useLocalStorage('blindMode', false)
}

/** 주소 뒤 #/경로 — 브라우저 뒤로 가기·새로고침에도 화면이 유지된다. */
export function useHashRoute(): [string, (path: string) => void, (path: string) => void] {
  const read = () => window.location.hash.replace(/^#/, '') || '/home'
  const [path, setPath] = useState(read)
  useEffect(() => {
    const onChange = () => setPath(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const navigate = useCallback((next: string) => {
    window.location.hash = next
  }, [])
  /** 뒤로 가기 기록을 남기지 않고 주소만 바꾼다(예: 한 번 쓰고 버리는 ?focus=). */
  const replace = useCallback((next: string) => {
    history.replaceState(null, '', `#${next}`)
    setPath(next)
  }, [])
  return [path, navigate, replace]
}
