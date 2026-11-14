// 보유 자산 카드 — 총 오픈 리스크, 예수금(메뉴: 입출금·배당·환전), 종목 머리글 + 보유 중인 매수 건 카드(1-1·1-2…).
// 같은 종목에 비중을 더해도 매수 건마다 카드가 따로다 — 손절가·리스크는 그 건을 기록할 때 쓴 값 그대로(여기서 못 고친다).
// 현재가만 같은 종목 공통(어느 카드에서 고쳐도 모든 건에 같은 값). 매도는 카드(매수 건) 단위, 가장 최근 매수부터.
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  ClipboardPen,
  Gift,
  Layers,
  MinusCircle,
  NotebookPen,
  PlusCircle,
  Wallet,
} from 'lucide-react'
import {
  BUY_REASON_LABEL,
  buyCostKRW,
  defaultTradeDate,
  exceedsMaxWeight,
  holdingMemo,
  LONG_HOLD_WARN_DAYS,
  tradingDays,
  type RatedBuy,
  type TradePosition,
} from '../../core'
import type { OpenEntry } from '../../state/entry'
import { useSheets, type SheetActions } from '../../state/sheets'
import { useJournal } from '../../state/journal'
import { buyEntryCells, lotMarkCells } from '../../ui/cells'
import { Blind, Card, Pill, PlanGrid, SectionHeader, Text } from '../../ui/components'
import { dollar, percent, price, rate, shortDate, weightText, won, wonCompact } from '../../ui/format'
import { useBlind } from '../../ui/hooks'
import { Menu, type MenuItem } from '../../ui/Menu'

export function HoldingsCard() {
  const { snapshot: s, data } = useJournal()
  const sheets = useSheets()
  const openEntry = sheets.openEntry
  const [blind] = useBlind()
  const open = [...s.openPositions].sort((a, b) => b.positionCost - a.positionCost)
  const cash = s.cash

  // 총 오픈 리스크 — 보유 중인 매수 건이 각자 손절가에 닿으면 잃는 금액의 합 ÷ 총자산.
  const riskAmount = open.reduce((a, p) => a + p.openRiskKRW, 0)

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
          const memo = holdingMemo(data.journals, p.id)
          // 판 매수 구분이 없는 옛 기록이 섞인 포지션은 전체 매수를 보여 주고 전량만 판다.
          const lots = p.hasLegacySells ? p.orderedBuys : p.availableLots()
          return (
            <div key={p.id}>
              <hr />
              <Menu items={positionMenu(p, sheets)} className="row-button" label={`${p.assetName} 메뉴`}>
                <PositionHeader position={p} totalAssets={s.totalAssets} maxWeight={data.settings.maxWeightPercent} blind={blind} memo={memo?.text} />
              </Menu>
              <div className="lots">
                {lots.map((buy) => (
                  <LotCard
                    key={buy.id}
                    position={p}
                    buy={buy}
                    totalAssets={s.totalAssets}
                    maxStop={data.settings.maxStopLossPercent}
                    blind={blind}
                    sheets={sheets}
                    openEntry={openEntry}
                  />
                ))}
              </div>
            </div>
          )
        })
      )}
    </Card>
  )
}

/** 종목 머리글 메뉴 — 추가 매수·매도·메모·현재가 기록·모아보기. */
function positionMenu(p: TradePosition, sheets: SheetActions): MenuItem[] {
  return [
    { label: '추가 매수', icon: ArrowUpCircle, detail: '새 매수 건(N-n)으로 따로 기록돼요', onSelect: () => sheets.openEntry({ kind: 'add', positionId: p.id }) },
    { label: '매도', icon: ArrowDownCircle, onSelect: () => sheets.openEntry({ kind: 'sell', positionId: p.id }) },
    { label: '메모', icon: NotebookPen, onSelect: () => sheets.openMemos(p.id, p.assetName, 'holding') },
    { label: '현재가 기록', icon: ClipboardPen, onSelect: () => sheets.openMark(p.id) },
    { label: '이 종목 모아보기', icon: Layers, onSelect: () => sheets.openAsset(p.assetName) },
  ]
}

/** 종목 머리글 — 이름 · 합계 비중(최대 비중 넘으면 주황) · 합계 수량·평균단가·매수금액. */
function PositionHeader({
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
  return (
    <div className="position-card">
      <div className="row-between">
        <strong className="ellipsis">{p.assetName}</strong>
        <span className="pills">
          <Pill text={weightText(weight)} tone={exceedsMaxWeight(weight, maxWeight) ? 'orange' : 'accent'} />
        </span>
      </div>
      <div className="trade-header small muted">
        <Blind text={`합계 ${p.remainingQuantity}주`} blind={blind} />
        <span>평균단가 {price(p.nativeAverageBuyPrice, p.currency)}</span>
        <Blind
          blind={blind}
          text={`매수금액 ${p.isForeign ? dollar(p.nativeAverageBuyPrice * p.remainingQuantity) : wonCompact(p.positionCost)}`}
        />
      </div>
      {memo && <p className="memo-preview">{memo}</p>}
    </div>
  )
}

/**
 * 매수 건 카드 — 1-1·1-2…마다 따로: 그 건의 매수가·수량, 손절가·손절률·리스크율·허용손실(기록할 때 쓴 값), 현재가·수익률·손절 여유·현재수익.
 * 탭하면 메뉴 "N-n 매도" / "N-n까지 매도"(최근 매수부터 판다 — 이 건과 그보다 최근 건이 같이 팔린다), "현재가 기록"(같은 종목 공통).
 */
function LotCard({
  position: p,
  buy,
  totalAssets,
  maxStop,
  blind,
  sheets,
  openEntry,
}: {
  position: TradePosition
  buy: RatedBuy
  totalAssets: number
  maxStop: number
  blind: boolean
  sheets: SheetActions
  openEntry: OpenEntry
}) {
  const label = p.lotLabel(buy)
  // 보유일 = 거래일. 달러 종목의 "오늘"은 뉴욕 날짜.
  const today = defaultTradeDate(p.currency)
  const days = tradingDays(buy.date, today)
  const weight = totalAssets > 0 ? (buyCostKRW(buy) / totalAssets) * 100 : 0
  const items: MenuItem[] = [
    p.hasLegacySells
      ? { label: '전량 매도', detail: '옛 기록이라 전량만 팔 수 있어요', icon: ArrowDownCircle, onSelect: () => openEntry({ kind: 'sell', positionId: p.id }) }
      : (() => {
          const menu = p.sellMenuText(buy)
          return { label: menu.title, detail: menu.detail, icon: ArrowDownCircle, onSelect: () => openEntry({ kind: 'sell', positionId: p.id, lotId: buy.id }) }
        })(),
    { label: '현재가 기록', detail: `${p.assetName} 모든 매수 건에 같은 값`, icon: ClipboardPen, onSelect: () => sheets.openMark(p.id) },
  ]
  return (
    <Menu items={items} className="row-button lot-card" label={`${label} 메뉴`}>
      <div className="position-card">
        <div className="row-between">
          <span className="ellipsis">
            <strong>{label}</strong> <span className="muted small">{shortDate(buy.date)} 매수</span>
          </span>
          <span className="pills">
            <Pill text={`보유 ${days}일`} tone={days > LONG_HOLD_WARN_DAYS ? 'orange' : 'muted'} />
            <Pill text={weightText(weight)} />
          </span>
        </div>
        <div className="trade-header small muted">
          <Pill text={BUY_REASON_LABEL[buy.buyReason]} tone="red" prominent />
          <Blind text={`${buy.quantity}주`} blind={blind} />
          <span>매수가 {price(buy.unitPrice, buy.currency)}</span>
          <Blind blind={blind} text={`매수금액 ${buy.currency === 'KRW' ? wonCompact(buyCostKRW(buy)) : dollar(buy.unitPrice * buy.quantity)}`} />
        </div>
        <PlanGrid rows={[buyEntryCells(buy, blind, maxStop), lotMarkCells(p, buy, blind)]} />
      </div>
    </Menu>
  )
}
