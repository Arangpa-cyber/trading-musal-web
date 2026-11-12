// 로그인한 사용자의 데이터와 계산 스냅샷 — 모든 화면이 이 하나를 같이 쓴다(화면마다 다시 계산하지 않는다).
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { buildSnapshot, type JournalData, type PortfolioSnapshot } from '../core'

export interface JournalState {
  data: JournalData
  snapshot: PortfolioSnapshot
  /** 서버에서 다시 불러오기 */
  reload: () => Promise<void>
}

const JournalContext = createContext<JournalState | null>(null)

export function JournalProvider({ data, reload, children }: { data: JournalData; reload: () => Promise<void>; children: ReactNode }) {
  const snapshot = useMemo(() => buildSnapshot(data), [data])
  const value = useMemo(() => ({ data, snapshot, reload }), [data, snapshot, reload])
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>
}

export function useJournal(): JournalState {
  const value = useContext(JournalContext)
  if (!value) throw new Error('JournalProvider 밖에서 useJournal을 불렀어요')
  return value
}
