// 시트 열기 — 현황·거래내역·자산 상세 어디서든 같은 시트(입력·수정·메모·모아보기·현재가)를 연다. AppShell이 띄운다.
import { createContext, useContext } from 'react'
import type { JournalContext } from '../core'
import type { EntryRequest } from './entry'

/** 수정 대상 기록. */
export type EditTarget = { kind: 'buy'; id: string } | { kind: 'sell'; id: string } | { kind: 'cash'; id: string }

export interface SheetActions {
  openEntry: (request: EntryRequest) => void
  openEdit: (target: EditTarget) => void
  /** 메모 목록 — 연 위치(매수·보유·매도)가 새 메모의 시점이 된다. */
  openMemos: (tradeId: string, assetName: string, context: JournalContext) => void
  openAsset: (assetName: string) => void
  openMark: (positionId: string) => void
  openBulkMark: () => void
  /** 설정 환율 입력(현황 총자산 숫자를 누르면) */
  openFxRate: () => void
  /** 시트를 다 닫고 거래내역에서 그 기록 카드로 이동(메모 "거래 보기"). */
  showRecord: (recordId: string) => void
}

export const SheetContext = createContext<SheetActions | null>(null)

export function useSheets(): SheetActions {
  const value = useContext(SheetContext)
  if (!value) throw new Error('SheetContext 밖에서 useSheets를 불렀어요')
  return value
}
