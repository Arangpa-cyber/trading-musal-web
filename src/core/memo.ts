// 메모 위치 — 메모는 작성 날짜(일 단위)의 기록 카드 한 장에만 붙는다.
import { startOfDay } from './dates'
import type { JournalContext, JournalEntry, Millis } from './types'

export interface DatedRecord {
  id: string
  date: Millis
}

/**
 * 메모를 붙일 기록 — 메모 작성 날짜 이전의 가장 최근 기록. 같은 날이면 그날 마지막 것,
 * 첫 기록보다 이르면 첫 기록.
 */
export function memoAnchorId(memoDate: Millis, records: DatedRecord[]): string | null {
  const day = startOfDay(memoDate)
  const ordered = [...records].sort((a, b) => a.date - b.date)
  const anchor = [...ordered].reverse().find((r) => startOfDay(r.date) <= day) ?? ordered[0]
  return anchor?.id ?? null
}

/** 기록 ID → 그 카드에 보여줄 메모(그 기록에 붙은 `context` 메모 중 가장 최근 것). */
export function memoPreviews(
  entries: JournalEntry[],
  context: JournalContext,
  recordsByTrade: Map<string, DatedRecord[]>,
): Map<string, JournalEntry> {
  const result = new Map<string, JournalEntry>()
  for (const entry of entries) {
    if (entry.context !== context) continue
    const records = recordsByTrade.get(entry.tradeId)
    const anchor = records ? memoAnchorId(entry.date, records) : null
    if (anchor === null) continue
    const current = result.get(anchor)
    if (current && current.date >= entry.date) continue
    result.set(anchor, entry)
  }
  return result
}

/** 그 거래의 "보유" 메모 중 가장 최근 것 — 매도 직전 확인 화면. */
export function holdingMemo(entries: JournalEntry[], tradeId: string): JournalEntry | null {
  let best: JournalEntry | null = null
  for (const e of entries) {
    if (e.tradeId !== tradeId || e.context !== 'holding') continue
    if (best === null || e.date > best.date) best = e
  }
  return best
}
