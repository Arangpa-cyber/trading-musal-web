// 카드 4칸 격자 내용 — 현황·거래내역 공용(iOS riskRow·markCells).
import { TradePosition } from '../core'
import type { Cell } from './components'
import { percent, price, relativeDay, signColor, wonCompact } from './format'

/**
 * 리스크 줄 — 손절가 | 손절률 | 리스크율(확보수익률) | 허용손실(확보이익).
 * 손절가가 평단 이상이면 손절돼도 잃지 않으므로 "확보"로 이름·색(빨강)을 바꾼다.
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

/** 현황 보유 카드 리스크 줄 — 지금 손절가 기준. 리스크율이 진입 리스크율을 넘으면 주황(⑤). */
export function positionRiskCells(p: TradePosition, blind: boolean): Cell[] {
  const stop = p.nativeStopLoss
  return riskRow({
    stopText: stop === null ? null : price(stop, p.currency),
    stopPercent: p.stopLossPercent,
    pnl: p.pnlAtStop,
    pnlPercent: p.pnlAtStopPercent,
    riskWarn: p.openRiskExceedsEntry,
    blind,
  })
}

/** 현재가 줄 — 현재가(기록 시점) | 수익률 | 손절 여유 | 현재수익. 7일 넘으면 라벨 주황(⑥). */
export function positionMarkCells(p: TradePosition, blind: boolean): Cell[] {
  const mark = p.mark
  const ret = p.markReturnPercent
  const room = p.stopRoomPercent
  const profit = p.markProfit
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
