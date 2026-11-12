// 매수 삭제 — 매수별 매도 규칙에 맞춰 같이 지울 것을 정한다(거래내역 "삭제"·매수 수정 "삭제" 공용).
import type { Buy, JournalEntry, Sell } from './types'

export interface BuyDeletePlan {
  buy: Buy
  /** 같이 지울 매도 */
  sells: Sell[]
  /** 같이 지울 메모(거래 전체를 지울 때만) */
  memos: JournalEntry[]
  deletesTrade: boolean
  /** 지울 수 없는 이유(있으면 막는다) */
  blockedReason: string | null
}

/**
 * - 그 거래의 마지막 매수 → 거래 전체(매도·메모까지).
 * - 이미 판 매수 → 그 매수를 판 매도도 같이.
 * - 아직 안 판 매수 → 그 매수만.
 * 지운 뒤 판 수량이 산 수량보다 많아지면(판 매수 정보 없는 옛 매도) 막는다.
 */
export function buyDeletePlan(buy: Buy, buys: Buy[], sells: Sell[], journals: JournalEntry[]): BuyDeletePlan {
  const tradeBuys = buys.filter((b) => b.tradeId === buy.tradeId)
  const tradeSells = sells.filter((s) => s.tradeId === buy.tradeId)
  if (tradeBuys.every((b) => b.id === buy.id)) {
    return {
      buy,
      sells: tradeSells,
      memos: journals.filter((j) => j.tradeId === buy.tradeId),
      deletesTrade: true,
      blockedReason: null,
    }
  }
  const linked = tradeSells.filter((s) => s.soldBuyIds.includes(buy.id))
  const keptSold = tradeSells.filter((s) => !s.soldBuyIds.includes(buy.id)).reduce((a, s) => a + s.quantity, 0)
  const keptBought = tradeBuys.filter((b) => b.id !== buy.id).reduce((a, b) => a + b.quantity, 0)
  return {
    buy,
    sells: linked,
    memos: [],
    deletesTrade: false,
    blockedReason:
      keptSold > keptBought
        ? `이 매수를 지우면 판 수량(${keptSold}주)이 산 수량(${keptBought}주)보다 많아져요. 매도 기록을 먼저 고쳐 주세요.`
        : null,
  }
}

/** 확인 alert 문구. */
export function deletePlanMessage(plan: BuyDeletePlan): string {
  if (plan.blockedReason) return plan.blockedReason
  const parts: string[] = []
  if (plan.sells.length) {
    parts.push(plan.deletesTrade ? `연결된 매도 기록 ${plan.sells.length}건` : `이 매수를 판 매도 기록 ${plan.sells.length}건`)
  }
  if (plan.memos.length) parts.push(`메모 ${plan.memos.length}개`)
  const lead = parts.length ? parts.join('과 ') + '도 함께 삭제돼요. ' : ''
  return lead + '되돌릴 수 없어요.'
}
