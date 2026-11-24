// 추세 대시보드(같은 주소 arangpa-cyber.github.io의 나스닥100 대시보드)의 종목 티커·이름 — 매수 화면 자산명 자동완성용.
// 대시보드는 무살 매수 기록을 자산명 = 티커로 맞춰 차트에 그린다. 대시보드 저장소의 tickers.json(대시보드 종목 목록에서 만든 파일)을 읽고
// 하루 동안 이 기기에 저장해 둔다. 못 읽으면 저장해 둔 것, 그것도 없으면 빈 목록(자동완성만 빠지고 입력은 그대로).
import { useEffect, useState } from 'react'

const SOURCE = 'https://arangpa-cyber.github.io/trend-dashboard/tickers.json'
const KEY = 'dashTickers'
const DAY = 86_400_000

/** [티커, 회사 이름] */
export type DashTicker = [string, string]

function cached(): { at: number; items: DashTicker[] } | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { at?: unknown; items?: unknown } | null
    return v && typeof v.at === 'number' && Array.isArray(v.items) ? { at: v.at, items: v.items as DashTicker[] } : null
  } catch {
    return null
  }
}

let pending: Promise<DashTicker[]> | null = null
function load(): Promise<DashTicker[]> {
  const c = cached()
  if (c && Date.now() - c.at < DAY) return Promise.resolve(c.items)
  pending ??= fetch(SOURCE)
    .then((r) => (r.ok ? (r.json() as Promise<{ items?: unknown }>) : Promise.reject(new Error(String(r.status)))))
    .then((j) => {
      const items = (Array.isArray(j.items) ? j.items : []).filter(
        (x): x is DashTicker => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string',
      )
      try {
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), items }))
      } catch {
        // 저장을 못 해도 이번에는 쓴다
      }
      return items
    })
    .catch(() => c?.items ?? [])
    .finally(() => {
      pending = null
    })
  return pending
}

/** 대시보드 티커 목록(처음엔 저장해 둔 것, 받으면 바뀜). */
export function useDashTickers(): DashTicker[] {
  const [items, setItems] = useState<DashTicker[]>(() => cached()?.items ?? [])
  useEffect(() => {
    let alive = true
    load().then((v) => {
      if (alive) setItems(v)
    })
    return () => {
      alive = false
    }
  }, [])
  return items
}
