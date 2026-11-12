import { useCallback, useRef } from 'react'

/**
 * 쓰던 내용 판단 — 처음 값(프리필·자동 채움 포함)과 지금 값을 비교한다. 글자로 입력한 칸만 넘긴다(세그먼트·피커 제외).
 * `rebase`: 자동으로 채운 칸(피라미딩 계획 등)은 "작성 중"으로 치지 않게 기준값을 바꾼다.
 */
export function useDraft(values: Record<string, string>) {
  const baseline = useRef<Record<string, string> | null>(null)
  if (baseline.current === null) baseline.current = { ...values }
  const dirty = Object.keys(values).some((k) => values[k] !== baseline.current![k])
  const rebase = useCallback((next: Record<string, string>) => {
    baseline.current = { ...baseline.current, ...next }
  }, [])
  return { dirty, rebase }
}
