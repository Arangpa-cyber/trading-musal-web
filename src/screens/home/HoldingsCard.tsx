// 보유 자산 카드 — 총 오픈 리스크, 예수금(메뉴: 입출금·배당·환전), 종목 카드(탭 = 메뉴, "펼치기"로 매수별 내역).
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  ClipboardPen,
  Gift,
  Layers,
  MinusCircle,
  NotebookPen,
  PlusCircle,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import {
  BUY_REASON_LABEL,
  defaultTradeDate,
  exceedsMaxWeight,
  holdingMemo,
  LONG_HOLD_WARN_DAYS,
  tradingDays,
  type RatedBuy,
  type RatedSell,
  type TradePosition,
} from '../../core'
import type { OpenEntry } from '../../state/entry'
import { useSheets, type SheetActions } from '../../state/sheets'
import { useJournal } from '../../state/journal'
import { positionMarkCells, positionRiskCells } from '../../ui/cells'
import { Blind, Card, Pill, PlanGrid, SectionHeader, Text } from '../../ui/components'
import { dollar, percent, price, rate, shortDate, signColor, weightText, won, wonCompact } from '../../ui/format'
import { useBlind } from '../../ui/hooks'
import { Menu, type MenuItem } from '../../ui/Menu'

export function HoldingsCard() {
  const { snapshot: s, data } = useJournal()
  const sheets = useSheets()
  const openEntry = sheets.openEntry
  const [blind] = useBlind()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const open = [...s.openPositions].sort((a, b) => b.positionCost - a.positionCost)
  const cash = s.cash

  // 총 오픈 리스크 — 모든 보유 포지션이 동시에 손절가에 닿으면 잃는 금액(본전 확보는 0) ÷ 총자산.
  const riskAmount = open.reduce((a, p) => a + Math.max(-(p.pnlAtStop ?? 0), 0), 0)
  const secured = open.filter((p) => p.isBreakevenSecured).length
  const exceeded = open.filter((p) => p.openRiskExceedsEntry).length

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const cashItems: MenuItem[] = [
    { label: '입금', icon: PlusCircle, onSelect: () => openEntry({ kind: 'cash', type: 'deposit' }) },
    { label: '출금', icon: MinusCircle, onSelect: () => openEntry({ kind: 'cash', type: 'withdrawal' }) },
    { label: '배당·이자', icon: Gift, onSelect: () => openEntry({ kind: 'cash', type: 'dividend' }) },
    { label: '환전', icon: ArrowLeftRight, onSelect: () => openEntry({ kind: 'cash', type: 'exchange' }) },
  ]

  return (
    <Card>
      <SectionHeader
        title="보유 자산"
        icon={Wallet}
        trailing={
          open.length > 0 && (
            <button type="button" className="text-button small" onClick={sheets.openBulkMark}>
              <ClipboardPen size={14} /> 현재가 기록
            </button>
          )
        }
      />
      {open.length > 0 && (
        <div className="one-line small">
          <Text tone="muted">총 오픈 리스크 </Text>
          <Text bold>{percent(s.totalAssets > 0 ? (riskAmount / s.totalAssets) * 100 : 0)}</Text>{' '}
          <Text tone="muted">({blind ? '•••' : wonCompact(riskAmount)})</Text>
          {secured > 0 && <Text tone="red"> · 본전 확보 {secured}종목</Text>}
          {exceeded > 0 && <Text tone="orange"> · 리스크 초과 {exceeded}종목</Text>}
        </div>
      )}

      <Menu items={cashItems} className="row-button" label="예수금 메뉴">
        <div className="row-between">
          <strong>예수금</strong>
          <Pill text={weightText(s.totalAssets > 0 ? (cash.totalKRW / s.totalAssets) * 100 : 0)} tone="accent" prominent />
        </div>
        <Blind text={won(cash.krw)} blind={blind} className="muted small block" />
        {cash.usd !== 0 && (
          <Blind
            className="muted small block"
            blind={blind}
            text={`${dollar(cash.usd)} (원가 ${wonCompact(cash.usdBookKRW)}${cash.usdAverageRate !== null ? ` · 평균 ${rate(cash.usdAverageRate)}` : ''})`}
          />
        )}
      </Menu>

      {open.length === 0 ? (
        <>
          <hr />
          <Text tone="muted">보유 중인 포지션이 없습니다</Text>
        </>
      ) : (
        open.map((p) => {
          const isOpen = expanded.has(p.id)
          const memo = holdingMemo(data.journals, p.id)
          return (
            <div key={p.id}>
              <hr />
              <Menu items={positionMenu(p, isOpen, () => toggle(p.id), sheets)} className="row-button" label={`${p.assetName} 메뉴`}>
                <PositionCard position={p} totalAssets={s.totalAssets} maxWeight={data.settings.maxWeightPercent} blind={blind} memo={memo?.text} />
              </Menu>
              {isOpen && <LotBreakdown position={p} blind={blind} openEntry={openEntry} />}
            </div>
          )
        })
      )}
    </Card>
  )
}

/** 보유 카드 메뉴 — 피라미딩·매도·메모·현재가 · 손절가 기록·모아보기, 구분선 아래 펼치기/접기. */
function positionMenu(p: TradePosition, isOpen: boolean, toggle: () => void, sheets: SheetActions): MenuItem[] {
  return [
    {
      label: '피라미딩',
      icon: ArrowUpCircle,
      // 피라미딩 쿠션 = 확보이익(손절가 ≥ 평단) — 본전 확보 전엔 비활성.
      detail: p.isBreakevenSecured ? undefined : '손절가를 평단 위로 올린 뒤 가능',
      disabled: !p.isBreakevenSecured,
      onSelect: () => sheets.openEntry({ kind: 'pyramid', positionId: p.id }),
    },
    { label: '매도', icon: ArrowDownCircle, onSelect: () => sheets.openEntry({ kind: 'sell', positionId: p.id }) },
    { label: '메모', icon: NotebookPen, onSelect: () => sheets.openMemos(p.id, p.assetName, 'holding') },
    { label: '현재가 · 손절가 기록', icon: ClipboardPen, onSelect: () => sheets.openMark(p.id) },
    { label: '이 종목 모아보기', icon: Layers, onSelect: () => sheets.openAsset(p.assetName) },
    'divider',
    { label: isOpen ? '접기' : '펼치기', icon: isOpen ? ChevronUp : ChevronDown, onSelect: toggle },
  ]
}

function PositionCard({
  position: p,
  totalAssets,
  maxWeight,
  blind,
  memo,
}: {
  position: TradePosition
  totalAssets: number
  maxWeight: number
  blind: boolean
  memo?: string
}) {
  const weight = totalAssets > 0 ? (p.positionCost / totalAssets) * 100 : 0
  const plan = p.plan
  // 보유일 = 거래일. 달러 종목의 "오늘"은 뉴욕 날짜.
  const today = defaultTradeDate(p.currency)
  const days = tradingDays(p.firstBuyDate ?? today, today)
  const lot = p.nextLotLabel
  return (
    <div className="position-card">
      <div className="row-between">
        <strong className="ellipsis">{p.assetName}</strong>
        <span className="pills">
          <Pill text={`보유 ${days}일`} tone={days > LONG_HOLD_WARN_DAYS ? 'orange' : 'muted'} />
          {lot && <Pill text={lot} />}
          <Pill text={weightText(weight)} tone={exceedsMaxWeight(weight, maxWeight) ? 'orange' : 'accent'} />
        </span>
      </div>
      <div className="trade-header small muted">
        <Pill text={plan ? BUY_REASON_LABEL[plan.buyReason] : '-'} tone="red" prominent />
        <Blind text={`${p.remainingQuantity}주`} blind={blind} />
        <span>평균단가 {price(p.nativeAverageBuyPrice, p.currency)}</span>
        <Blind
          blind={blind}
          text={`매수금액 ${p.isForeign ? dollar(p.nativeAverageBuyPrice * p.remainingQuantity) : wonCompact(p.positionCost)}`}
        />
      </div>
      {plan && <PlanGrid rows={[positionRiskCells(p, blind), positionMarkCells(p, blind)]} />}
      {memo && <p className="memo-preview">{memo}</p>}
    </div>
  )
}

/**
 * 펼친 카드 — 매수(N-1·N-2…)별 내역. 매수 하나 = 경지 1건이라 지금(현재가)·손절가에서 몇 %인지 보여준다.
 * 보유 매수를 누르면 메뉴 "N-n 매도" / "N-n까지 매도"(최근 매수부터 판다), 판 매수는 회색.
 */
function LotBreakdown({ position: p, blind, openEntry }: { position: TradePosition; blind: boolean; openEntry: OpenEntry }) {
  const stop = p.nativeStopLoss
  const mark = p.mark?.price ?? null
  const openLots = p.availableLots()
  const stopReturns = stop === null ? [] : openLots.flatMap((l) => {
    const r = p.lotReturn(l, stop)
    return r === null ? [] : [r]
  })
  const winsAtStop = stopReturns.filter((r) => r > 0).length

  return (
    <div className="lots">
      {p.orderedBuys.map((buy, index) => {
        const label = p.trancheLabel(index)
        const sold = p.sellOfLot(buy)
        if (sold) return <SoldLotRow key={buy.id} position={p} buy={buy} label={label} sell={sold} />
        if (p.hasLegacySells) return <LotRow key={buy.id} label={label} buy={buy} markReturn={null} stopReturn={null} blind={blind} />
        const menu = p.sellMenuText(buy)
        return (
          <Menu
            key={buy.id}
            className="row-button"
            label={`${label} 메뉴`}
            items={[{ label: menu.title, detail: menu.detail, icon: ArrowDownCircle, onSelect: () => openEntry({ kind: 'sell', positionId: p.id, lotId: buy.id }) }]}
          >
            <LotRow
              label={label}
              buy={buy}
              markReturn={mark === null ? null : p.lotReturn(buy, mark)}
              stopReturn={stop === null ? null : p.lotReturn(buy, stop)}
              blind={blind}
            />
          </Menu>
        )
      })}
      {stop !== null && !p.hasLegacySells && openLots.length > 0 && (
        <Text size="tiny" tone={stopReturns.length > winsAtStop ? 'orange' : 'muted'}>
          손절가에서 모두 팔리면: {winsAtStop}승 {stopReturns.length - winsAtStop}패
        </Text>
      )}
    </div>
  )
}

/** 보유 매수 한 줄 — 이름·매수일 ··· 수량·매수가 | 현재 ±X% | 손절 시 ±Y%(≤0이면 주황 ⑩). */
function LotRow({ label, buy, markReturn, stopReturn, blind }: { label: string; buy: RatedBuy; markReturn: number | null; stopReturn: number | null; blind: boolean }) {
  return (
    <div className="lot-row">
      <strong>{label}</strong>
      <span className="muted">{shortDate(buy.date)}</span>
      <span className="spacer" />
      <Blind text={`${buy.quantity}주 · ${price(buy.unitPrice, buy.currency)}`} blind={blind} />
      <Text tone={markReturn === null ? 'muted' : signColor(markReturn)}>현재 {markReturn === null ? '-' : percent(markReturn, true)}</Text>
      <Text bold tone={stopReturn === null ? 'muted' : stopReturn <= 0 ? 'orange' : 'red'}>
        손절 시 {stopReturn === null ? '-' : percent(stopReturn, true)}
      </Text>
    </div>
  )
}

/** 판 매수 한 줄(회색) — 이름·매수일 [매도됨] ··· M/d 매도 · 가격 · ±X%. */
function SoldLotRow({ position: p, buy, label, sell }: { position: TradePosition; buy: RatedBuy; label: string; sell: RatedSell }) {
  const result = p.lotReturn(buy, sell.unitPrice)
  return (
    <div className="lot-row sold">
      <strong className="muted">{label}</strong>
      <span className="muted">{shortDate(buy.date)}</span>
      <Pill text="매도됨" />
      <span className="spacer" />
      <span className="muted">
        {shortDate(sell.date)} 매도 · {price(sell.unitPrice, sell.currency)}
      </span>
      {result !== null && <Text bold tone={signColor(result)}>{percent(result, true)}</Text>}
    </div>
  )
}
