// 옛 데이터 보정 — iOS 백업을 가져올 때 한 번만 돌린다(설계 결정 2). 넘겨받은 기록 객체를 그 자리에서 고치고
// 고친 개수를 돌려준다. 여러 번 불러도 같은 결과(멱등).
import { TradePosition, groupBy, maxBy } from './position'
import type { RatedBuy, RatedSell } from './records'
import type { Buy, JournalEntry, Sell } from './types'

/** 보정 판정용 포지션 — 거래 통화 값만 쓰므로 환율은 1로 둔다. */
function positionsOf(buys: Buy[], sells: Sell[]): TradePosition[] {
  const rb: RatedBuy[] = buys.map((b) => ({ ...b, rate: 1 }))
  const rs: RatedSell[] = sells.map((s) => ({ ...s, rate: 1 }))
  return TradePosition.aggregate(rb, rs)
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((x) => [x.id, x]))
}

/** 손절가를 새 값(거래 통화)으로 끌어올린다 — 이미 그 이상인 기록은 건드리지 않는다(올리기만). */
export function raiseStopLoss(buys: Buy[], nativeStop: number): void {
  for (const b of buys) if (b.stopLossPrice < nativeStop - 1e-6) b.stopLossPrice = nativeStop
}

/**
 * 같은 거래(tradeId)의 매도·메모 자산명을 그 거래의 첫 매수 자산명으로 맞춘다.
 * (매수만 이름을 바꿔 "달바글로벌2"처럼 갈린 옛 매도·메모)
 */
export function syncAssetNames(buys: Buy[], sells: Sell[], journals: JournalEntry[]): number {
  const nameByTrade = new Map<string, string>()
  for (const b of [...buys].sort((a, c) => a.date - c.date)) {
    if (!nameByTrade.has(b.tradeId)) nameByTrade.set(b.tradeId, b.assetName)
  }
  let changed = 0
  for (const r of [...sells, ...journals]) {
    const name = nameByTrade.get(r.tradeId)
    if (name !== undefined && r.assetName !== name) {
      r.assetName = name
      changed++
    }
  }
  return changed
}

/**
 * 다 판 거래 중 같은 자산명·통화이고 보유 기간이 겹친 것을 먼저 산 거래 하나로 합친다.
 * 다 판 뒤 다시 산 거래는 그대로. 판 매수 정보 없는 옛 매도가 있으면 합치지 않는다.
 */
export function mergeOverlappingClosedPositions(buys: Buy[], sells: Sell[], journals: JournalEntry[]): number {
  const buyById = byId(buys)
  const sellById = byId(sells)
  const closed = positionsOf(buys, sells).filter((p) => p.isClosed && !p.hasLegacySells)
  let merged = 0
  for (const group of groupBy(closed, (p) => `${p.assetName}|${p.currency}`).values()) {
    if (group.length <= 1) continue
    const ordered = [...group].sort((a, b) => (a.firstBuyDate ?? -Infinity) - (b.firstBuyDate ?? -Infinity))
    let target = ordered[0]
    let end = target.lastSellDate ?? -Infinity
    for (const position of ordered.slice(1)) {
      const start = position.firstBuyDate
      if (start === null || !(start < end)) {
        target = position
        end = position.lastSellDate ?? -Infinity
        continue
      }
      for (const b of position.buys) buyById.get(b.id)!.tradeId = target.id
      for (const s of position.sells) sellById.get(s.id)!.tradeId = target.id
      for (const j of journals) if (j.tradeId === position.id) j.tradeId = target.id
      end = Math.max(end, position.lastSellDate ?? end)
      merged++
    }
  }
  return merged
}

/**
 * 같은 종목·통화로 따로 보유 중인 포지션을 가장 먼저 산 포지션 하나로 합친다(같은 종목 = 항상 한 포지션).
 * 부분 매도가 있으면 합치지 않는다(확정된 실현손익이 바뀌므로). 합친 뒤 손절가는 가장 최근 매수건 손절가로 올린다.
 */
export function mergeDuplicateOpenPositions(buys: Buy[], sells: Sell[], journals: JournalEntry[]): number {
  const buyById = byId(buys)
  const open = positionsOf(buys, sells).filter((p) => !p.isClosed)
  let merged = 0
  for (const group of groupBy(open, (p) => `${p.assetName}|${p.currency}`).values()) {
    if (group.length <= 1) continue
    const ordered = [...group].sort((a, b) => (a.firstBuyDate ?? -Infinity) - (b.firstBuyDate ?? -Infinity))
    const target = ordered.find((p) => p.sells.length === 0)
    if (!target) continue
    for (const source of ordered) {
      if (!source.canMerge(target)) continue
      for (const b of source.buys) buyById.get(b.id)!.tradeId = target.id
      for (const j of journals) if (j.tradeId === source.id) j.tradeId = target.id
      const all = [...source.buys, ...target.buys].map((b) => buyById.get(b.id)!)
      const latest = maxBy(all, (b) => b.date)
      if (latest) raiseStopLoss(all, latest.stopLossPrice)
      merged++
    }
  }
  return merged
}

/**
 * 다 판 포지션의 마지막 매도만 보정 — ① 매도 시점 손절가가 없으면 지금 손절가로(다 판 뒤엔 안 바뀌니 정확),
 * ② 매도가 한 건뿐이고 판 매수 정보가 없으면 판 매수 = 모든 매수. 고친 매도 수를 돌려준다.
 */
export function backfillClosedSells(buys: Buy[], sells: Sell[]): number {
  const sellById = byId(sells)
  let changed = 0
  for (const position of positionsOf(buys, sells)) {
    if (!position.isClosed) continue
    const lastView = maxBy(position.sells, (s) => s.date)
    if (!lastView) continue
    const last = sellById.get(lastView.id)!
    let touched = false
    const stop = position.nativeStopLoss
    if (last.stopLossAtSell <= 0 && stop !== null && stop > 0) {
      last.stopLossAtSell = stop
      touched = true
    }
    if (position.sells.length === 1 && last.soldBuyIds.length === 0) {
      last.soldBuyIds = position.orderedBuys.map((b) => b.id)
      touched = true
    }
    if (touched) changed++
  }
  return changed
}
