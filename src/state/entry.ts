// 입력 시트를 여는 요청 — 현황·거래내역의 +·메뉴에서 만들고, 앱 틀(AppShell)이 시트를 띄운다.
import type { CashTxType } from '../core'

export type EntryRequest =
  | { kind: 'new' }
  | { kind: 'cash'; type: CashTxType }
  | { kind: 'sell'; positionId: string; lotId?: string }
  | { kind: 'add'; positionId: string }

export type OpenEntry = (request: EntryRequest) => void
