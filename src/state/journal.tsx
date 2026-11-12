// 로그인한 사용자의 데이터와 계산 스냅샷 — 모든 화면이 이 하나를 같이 쓴다(화면마다 다시 계산하지 않는다).
// 저장·삭제도 여기 `persist`·`remove`로만 한다(실제 앱 = Supabase, 개발 미리보기 = 메모리).
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { buildSnapshot, type Buy, type CashTx, type JournalData, type JournalEntry, type PortfolioSnapshot, type Profile, type Sell, type Settings } from '../core'

/** 새로 넣거나 고칠 기록(같은 id면 덮어씀). */
export interface Changes {
  buys?: Buy[]
  sells?: Sell[]
  cash?: CashTx[]
  journals?: JournalEntry[]
  profile?: Pick<Profile, 'nickname' | 'tradingRules'>
  settings?: Settings
}

/** 지울 기록 id. */
export interface Removals {
  buys?: string[]
  sells?: string[]
  cash?: string[]
  journals?: string[]
}

export interface JournalState {
  data: JournalData
  snapshot: PortfolioSnapshot
  /** 서버에서 다시 불러오기 */
  reload: () => Promise<void>
  /** 저장 — 환전 → 매수 → 매도 → 메모 순으로 넣고 다시 불러온다. */
  persist: (changes: Changes) => Promise<void>
  remove: (removals: Removals) => Promise<void>
}

const JournalContext = createContext<JournalState | null>(null)

export function JournalProvider({
  data,
  reload,
  persist,
  remove,
  children,
}: {
  data: JournalData
  reload: () => Promise<void>
  persist: (changes: Changes) => Promise<void>
  remove: (removals: Removals) => Promise<void>
  children: ReactNode
}) {
  const snapshot = useMemo(() => buildSnapshot(data), [data])
  const value = useMemo(() => ({ data, snapshot, reload, persist, remove }), [data, snapshot, reload, persist, remove])
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>
}

export function useJournal(): JournalState {
  const value = useContext(JournalContext)
  if (!value) throw new Error('JournalProvider 밖에서 useJournal을 불렀어요')
  return value
}

/** 메모리 데이터에 바로 반영(개발 미리보기). 같은 id는 덮어쓴다. */
export function applyChanges(data: JournalData, changes: Changes, removals: Removals = {}): JournalData {
  const merge = <T extends { id: string }>(list: T[], add: T[] = [], drop: string[] = []) => {
    const map = new Map(list.map((x) => [x.id, x]))
    for (const id of drop) map.delete(id)
    for (const x of add) map.set(x.id, x)
    return [...map.values()]
  }
  return {
    buys: merge(data.buys, changes.buys, removals.buys),
    sells: merge(data.sells, changes.sells, removals.sells),
    cash: merge(data.cash, changes.cash, removals.cash),
    journals: merge(data.journals, changes.journals, removals.journals),
    profile: changes.profile ? { createdAt: data.profile?.createdAt ?? Date.now(), ...changes.profile } : data.profile,
    settings: changes.settings ?? data.settings,
  }
}
