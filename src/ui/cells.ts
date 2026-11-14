// 카드 4칸 격자 내용 — 현황·거래내역 공용(iOS riskRow·markCells).
import {
  entryPnlAtStop,
  entryRiskExceeded,
  entryStopLossPrice,
  entryStopPercent,
  entryStopTooWide,
  sellAmountKRW,
  stopGapWarns,
  TradePosition,
  type RatedBuy,
  type RatedSell,
} from '../core'
import type { Cell } from './components'
import { percent, price, relativeDay, signColor, wonCompact } from './format'

/**
 * 리스크 줄 — 손절가 | 손절률 | 리스크율(확보수익률) | 허용손실(확보이익).
 * 손절가가 매수가 이상이면 손절돼도 잃지 않으므로 "확보"로 이름·색(빨강)을 바꾼다(옛 기록·직접 고친 기록에만 생긴다).
 */
export function riskRow(o: {
  stopText: string | null
  stopPercent: number | null
  pnl: number | null
  pnlPercent: number | null
  riskWarn?: boolean
  stopWarn?: boolean
  blind: boolean
}): Cell[] {
  const secured = (o.pnl ?? -1) >= 0
  return [
    { label: '손절가', value: o.stopText ?? '-' },
    {
      label: '손절률',
      value: o.stopPercent === null ? '-' : percent(o.stopPercent, true),
      tone: o.stopWarn ? 'orange' : (o.stopPercent ?? -1) >= 0 ? 'red' : 'blue',
    },
    {
      label: secured ? '확보수익률' : '리스크율',
      value: o.pnlPercent === null ? '-' : secured ? percent(o.pnlPercent, true) : percent(-o.pnlPercent),
      tone: secured ? 'red' : o.riskWarn ? 'orange' : 'default',
    },
    {
      label: secured ? '확보이익' : '허용손실',
      value: o.pnl === null ? '-' : secured ? `+${wonCompact(o.pnl)}` : wonCompact(-o.pnl),
      tone: secured ? 'red' : 'default',
      blind: o.blind,
    },
  ]
}

/**
 * 현황 보유 매수 건 카드의 현재가 줄 — 현재가(같은 종목 공통, 기록 시점) | 수익률 | 손절 여유 | 현재수익.
 * 수익률·현재수익은 이 매수 건의 매수가·수량 기준, 손절 여유는 이 건의 손절가(진입 시 손절가) 기준. 7일 넘으면 라벨 주황(⑥).
 */
export function lotMarkCells(p: TradePosition, buy: RatedBuy, blind: boolean): Cell[] {
  const mark = p.mark
  const ret = mark ? p.lotReturn(buy, mark.price) : null
  const stop = entryStopLossPrice(buy)
  const room = mark && mark.price > 0 && stop > 0 ? ((stop - mark.price) / mark.price) * 100 : null
  const profit = mark ? p.lotProfit(buy, mark.price) : null
  return [
    {
      label: mark ? `현재가 · ${relativeDay(mark.date)}` : '현재가',
      value: mark ? price(mark.price, p.currency) : '-',
      labelTone: p.isMarkStale() ? 'orange' : 'muted',
    },
    { label: '수익률', value: ret === null ? '-' : percent(ret, true), tone: ret === null ? 'default' : ret >= 0 ? 'red' : 'blue' },
    { label: '손절 여유', value: room === null ? '-' : room >= 0 ? '손절가 도달' : percent(room, true), tone: (room ?? -1) >= 0 ? 'orange' : 'default' },
    {
      label: '현재수익',
      value: profit === null ? '-' : (profit >= 0 ? '+' : '') + wonCompact(profit),
      tone: profit === null ? 'default' : profit >= 0 ? 'red' : 'blue',
      blind,
    },
  ]
}

/** 매수별 결과 색 — 수익 빨강 · 손실 파랑 · 0 회색. */
export const lotTone = signColor

/**
 * 매수 카드 리스크 줄 — 이 매수를 저장할 때 정한 손절가(진입 시 손절가) 기준 = "그때의 계획".
 * 리스크율 칸은 허용손실 초과(①), 손절률 칸은 손절폭 한도 초과(②)면 주황.
 */
export function buyEntryCells(b: RatedBuy, blind: boolean, maxStopLossPercent: number): Cell[] {
  const pnl = entryPnlAtStop(b)
  return riskRow({
    stopText: price(entryStopLossPrice(b), b.currency),
    stopPercent: entryStopPercent(b),
    pnl,
    pnlPercent: b.totalAssetsAtEntry > 0 ? (pnl / b.totalAssetsAtEntry) * 100 : null,
    riskWarn: entryRiskExceeded(b),
    stopWarn: entryStopTooWide(b, maxStopLossPercent),
    blind,
  })
}

/**
 * 매도 카드 결과 줄 — 손절가대비 | 손익률 | 계좌기여율 | 실현손익(매수 카드 리스크 줄과 짝).
 * 원가는 그 매도 시점 이동평균. 손절가대비 1% 넘게 아래(⑧)·계좌기여율이 진입 리스크율보다 더 잃음(⑦)이면 주황.
 */
export function sellResultCells(p: TradePosition, s: RatedSell, blind: boolean): Cell[] {
  const cost = p.costBasis(s)
  const profit = sellAmountKRW(s) - cost
  const contribution = p.accountContribution(s)
  const gap = p.stopGap(s)
  const profitTone = profit >= 0 ? 'red' : 'blue'
  return [
    { label: '손절가대비', value: gap === null ? '-' : percent(gap, true), tone: gap === null ? 'default' : stopGapWarns(gap) ? 'orange' : gap >= 0 ? 'red' : 'blue' },
    { label: '손익률', value: cost > 0 ? percent((profit / cost) * 100, true) : '-', tone: profitTone },
    {
      label: '계좌기여율',
      value: contribution === null ? '-' : percent(contribution, true),
      tone: contribution === null ? 'default' : p.exceededEntryRisk(s) ? 'orange' : contribution >= 0 ? 'red' : 'blue',
    },
    { label: '실현손익', value: (profit >= 0 ? '+' : '') + wonCompact(profit), tone: profitTone, blind },
  ]
}
