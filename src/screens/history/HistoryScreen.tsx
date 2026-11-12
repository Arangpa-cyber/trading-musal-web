// 거래내역 — 검색 + 종류/통화 세그먼트, 목록↔캘린더, 월별 머리(그달 실현손익), 카드를 누르면 바로 메뉴.
import { ArrowDownCircle, Layers, NotebookPen, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BUY_REASON_LABEL,
  CASH_TX_LABEL,
  exceedsMaxWeight,
  impliedExchangeRate,
  increasesCash,
  isSameDay,
  memoPreviews,
  recordWeights,
  replayFx,
  sellAmountKRW,
  sellReasonText,
  tradingDays,
  winHoldDaysBaseline,
  fixedDateText,
  type CashTx,
  type JournalEntry,
  type RatedBuy,
  type RatedSell,
  type RecordWeights,
  type TradePosition,
} from '../../core'
import { useJournal } from '../../state/journal'
import { useSheets } from '../../state/sheets'
import { buyEntryCells, sellResultCells } from '../../ui/cells'
import { Blind, Pill, PlanGrid, Text } from '../../ui/components'
import { Segmented } from '../../ui/form'
import { dollar, percent, price, rate, signColor, weightText, won, wonCompact } from '../../ui/format'
import { useBlind } from '../../ui/hooks'
import { Menu, type MenuItem } from '../../ui/Menu'
import { useDeleteFlow } from './deleteFlow'
import { TradeCalendar } from './TradeCalendar'

type Item = { kind: 'buy'; r: RatedBuy } | { kind: 'sell'; r: RatedSell } | { kind: 'cash'; r: CashTx }
type TypeFilter = 'all' | 'buy' | 'sell' | 'cash'
type CurrencyFilter = 'all' | 'KRW' | 'USD'

const monthKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 처음 보여줄 기간(개월)과 최소 건수 — 기록이 수백 건이어도 한 번에 다 그리지 않는다. 아래로 내리면 더. */
const PAGE_MONTHS = 3
const MIN_ROWS = 30

export function HistoryScreen({ calendar, focus, onFocused }: { calendar: boolean; focus?: string | null; onFocused?: () => void }) {
  const { data, snapshot } = useJournal()
  const [blind] = useBlind()
  const sheets = useSheets()
  const del = useDeleteFlow()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>('all')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const positions = useMemo(() => new Map(snapshot.positions.map((p) => [p.id, p])), [snapshot])
  const weights = useMemo(() => recordWeights(snapshot), [snapshot])
  // 손실 매도 "오래 버팀"(⑨) 기준 — 수익 거래 평균 보유일(수익 5건 미만이면 판정 안 함).
  const winHoldDays = useMemo(() => winHoldDaysBaseline(snapshot.outcomes), [snapshot])
  // 달러 → 원화 환전별 확정 환차손익 — 화면당 한 번 재생.
  const exchangeFx = useMemo(() => replayFx(snapshot.buys, snapshot.sells, snapshot.cashTxs).exchangeFx, [snapshot])
  // 카드 메모 — 작성 날짜의 기록 한 장에만(매수 메모 = 매수 카드, 매도 메모 = 매도 카드).
  const memos = useMemo(() => {
    const group = <T extends { tradeId: string; id: string; date: number }>(list: T[]) => {
      const map = new Map<string, { id: string; date: number }[]>()
      for (const r of list) map.set(r.tradeId, [...(map.get(r.tradeId) ?? []), { id: r.id, date: r.date }])
      return map
    }
    return new Map([...memoPreviews(data.journals, 'buy', group(data.buys)), ...memoPreviews(data.journals, 'sell', group(data.sells))])
  }, [data])
  const hasForeign = data.buys.some((b) => b.currency !== 'KRW') || data.sells.some((s) => s.currency !== 'KRW')

  const items = useMemo(() => {
    const all: Item[] = [
      ...(typeFilter === 'all' || typeFilter === 'buy' ? snapshot.buys.map((r) => ({ kind: 'buy' as const, r })) : []),
      ...(typeFilter === 'all' || typeFilter === 'sell' ? snapshot.sells.map((r) => ({ kind: 'sell' as const, r })) : []),
      ...(typeFilter === 'all' || typeFilter === 'cash' ? snapshot.cashTxs.map((r) => ({ kind: 'cash' as const, r })) : []),
    ]
    // 검색 — 자산명 · 예수금 메모 · 매도 이유(옛 직접 입력 글 포함) · 그 기록 메모(매수 = 매수 메모, 매도 = 매도 메모).
    const q = query.trim().toLowerCase()
    const memoText = new Map<string, string>()
    for (const j of data.journals) memoText.set(`${j.tradeId}|${j.context}`, `${memoText.get(`${j.tradeId}|${j.context}`) ?? ''}\n${j.text}`)
    const matches = (item: Item) => {
      if (!q) return true
      const hay =
        item.kind === 'cash'
          ? [item.r.memo]
          : item.kind === 'buy'
            ? [item.r.assetName, memoText.get(`${item.r.tradeId}|buy`) ?? '']
            : [item.r.assetName, sellReasonText(item.r), item.r.reasonNote, memoText.get(`${item.r.tradeId}|sell`) ?? '']
      return hay.some((h) => h.toLowerCase().includes(q))
    }
    // 통화 — 환전은 달러가 오가므로 달러 쪽.
    const currencyOf = (item: Item) => (item.kind === 'cash' ? (item.r.type === 'exchange' ? 'USD' : item.r.currency) : item.r.currency)
    return all
      .filter(matches)
      .filter((item) => currencyFilter === 'all' || currencyOf(item) === currencyFilter)
      .sort((a, b) => b.r.date - a.r.date)
  }, [snapshot, data.journals, typeFilter, query, currencyFilter])

  // 무한 스크롤 — 최근 3개월(적어도 30건)부터, 바닥에 닿으면 3개월씩 더. 검색 중이면 전부.
  const [months, setMonths] = useState(PAGE_MONTHS)
  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1).getTime()
  const windowed = query.trim() ? items : items.filter((i, index) => i.r.date >= cutoff || index < MIN_ROWS)
  const hasMore = !calendar && windowed.length < items.length
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setMonths((m) => m + PAGE_MONTHS), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, windowed.length])

  // 메모 "거래 보기"로 들어오면 — 그 카드 날짜까지 목록을 넓히고, 그린 뒤 스크롤해서 잠깐 강조한다.
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  useEffect(() => {
    if (!focus) return
    const target = [...snapshot.buys, ...snapshot.sells].find((r) => r.id === focus)
    if (target) {
      const d = new Date(target.date)
      const need = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth() + 1
      setMonths((m) => Math.max(m, need))
      setTypeFilter('all')
      setCurrencyFilter('all')
      setQuery('')
      setPendingFocus(focus)
    }
    onFocused?.()
  }, [focus])
  useEffect(() => {
    if (!pendingFocus) return
    const el = document.getElementById(`record-${pendingFocus}`)
    if (!el) return
    setPendingFocus(null)
    el.scrollIntoView({ block: 'center' })
    el.classList.add('flash')
    setTimeout(() => el.classList.remove('flash'), 1600)
  })

  const shown = calendar ? (selectedDay === null ? [] : items.filter((i) => isSameDay(i.r.date, selectedDay))) : windowed
  const groups: { month: string; items: Item[] }[] = []
  for (const item of shown) {
    const m = monthKey(item.r.date)
    if (groups.at(-1)?.month === m) groups.at(-1)!.items.push(item)
    else groups.push({ month: m, items: [item] })
  }

  function menuFor(item: Item): MenuItem[] {
    const out: MenuItem[] = []
    if (item.kind !== 'cash') out.push({ label: '이 종목 모아보기', icon: Layers, onSelect: () => sheets.openAsset(item.r.assetName) })
    if (item.kind === 'buy') {
      const p = positions.get(item.r.tradeId)
      const action = p && sellLotAction(item.r, p)
      if (p && action) {
        out.push({
          label: action.title,
          detail: action.detail,
          icon: ArrowDownCircle,
          disabled: !action.enabled,
          onSelect: () => sheets.openEntry({ kind: 'sell', positionId: p.id, lotId: item.r.id }),
        })
      }
    }
    if (item.kind !== 'cash') {
      out.push({ label: '메모', icon: NotebookPen, onSelect: () => sheets.openMemos(item.r.tradeId, item.r.assetName, item.kind === 'buy' ? 'buy' : 'sell') })
    }
    out.push({ label: '수정', icon: Pencil, onSelect: () => sheets.openEdit({ kind: item.kind, id: item.r.id }) })
    out.push({ label: '삭제', icon: Trash2, destructive: true, onSelect: () => del.ask({ kind: item.kind, id: item.r.id }) })
    return out
  }

  return (
    <div className="stack">
      <input className="search" type="search" placeholder="자산명·메모·매도 이유 검색" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="검색" />
      <Segmented
        options={[
          { value: 'all', label: '전체' },
          { value: 'buy', label: '매수' },
          { value: 'sell', label: '매도' },
          { value: 'cash', label: '예수금' },
        ]}
        value={typeFilter}
        onChange={setTypeFilter}
        label="종류"
      />
      {hasForeign && (
        <Segmented
          options={[
            { value: 'all', label: '전체' },
            { value: 'KRW', label: '₩' },
            { value: 'USD', label: '$' },
          ]}
          value={currencyFilter}
          onChange={setCurrencyFilter}
          label="통화"
        />
      )}

      {calendar && <TradeCalendar selectedDay={selectedDay} onSelect={setSelectedDay} />}

      {calendar && selectedDay === null ? (
        <p className="muted small center-text">날짜를 누르면 그날 기록이 아래에 나와요</p>
      ) : shown.length === 0 ? (
        <p className="empty">{calendar ? '이 날은 기록이 없어요' : '표시할 거래 기록이 없습니다'}</p>
      ) : (
        groups.map((g) => (
          <section key={g.month} className="history-month">
            {!calendar && <MonthHeader month={g.month} items={g.items} positions={positions} blind={blind} />}
            <div className="group">
              {g.items.map((item) => (
                <Menu key={`${item.kind}-${item.r.id}`} anchorId={`record-${item.r.id}`} items={menuFor(item)} className={`history-row row-${item.kind}`} label={`${rowLabel(item)} 메뉴`}>
                  {item.kind === 'buy' ? (
                    <BuyRow r={item.r} position={positions.get(item.r.tradeId)} weights={weights} memo={memos.get(item.r.id)} maxWeight={data.settings.maxWeightPercent} maxStop={data.settings.maxStopLossPercent} blind={blind} />
                  ) : item.kind === 'sell' ? (
                    <SellRow r={item.r} position={positions.get(item.r.tradeId)} weights={weights} winHoldDays={winHoldDays} memo={memos.get(item.r.id)} blind={blind} />
                  ) : (
                    <CashRow r={item.r} fx={exchangeFx.get(item.r.id)} blind={blind} />
                  )}
                </Menu>
              ))}
            </div>
          </section>
        ))
      )}
      {hasMore && (
        <div ref={sentinel} className="load-more">
          <button type="button" className="text-button" onClick={() => setMonths((m) => m + PAGE_MONTHS)}>
            이전 기록 더 보기
          </button>
        </div>
      )}
      {del.alert}
    </div>
  )
}

const rowLabel = (item: Item) => (item.kind === 'cash' ? CASH_TX_LABEL[item.r.type] : `${item.r.assetName} ${item.kind === 'buy' ? '매수' : '매도'}`)

/** 매수 카드 메뉴 "N-n 매도" — 안 보임(null) / 비활성(부제 = 사유) / 활성. 더 오래된 매수면 "N-n까지 매도". */
function sellLotAction(buy: RatedBuy, p: TradePosition): { enabled: boolean; title: string; detail: string } | null {
  if (p.isClosed) return null
  const name = p.lotLabel(buy)
  const sold = p.sellOfLot(buy)
  if (sold) return { enabled: false, title: `${name} 매도`, detail: `${fixedDateText(sold.date)} 매도됨` }
  if (p.hasLegacySells) return { enabled: false, title: `${name} 매도`, detail: '전량만 매도 가능' }
  const t = p.sellMenuText(buy)
  return { enabled: true, title: t.title, detail: t.detail }
}

/** 월 머리 — "2026-10 · 실현손익 +120만원"(그달 매도가 없으면 월만). */
function MonthHeader({ month, items, positions, blind }: { month: string; items: Item[]; positions: Map<string, TradePosition>; blind: boolean }) {
  const sells = items.flatMap((i) => (i.kind === 'sell' ? [i.r] : []))
  const realized = sells.reduce((a, s) => a + sellAmountKRW(s) - (positions.get(s.tradeId)?.costBasis(s) ?? sellAmountKRW(s)), 0)
  return (
    <div className="group-title bold">
      {month}
      {sells.length > 0 && (
        <>
          <span className="muted"> · 실현손익 </span>
          <Text tone={realized >= 0 ? 'red' : 'blue'}>{blind ? '•••' : (realized >= 0 ? '+' : '') + wonCompact(realized)}</Text>
        </>
      )}
    </div>
  )
}

function BuyRow({ r, position, weights, memo, maxWeight, maxStop, blind }: { r: RatedBuy; position?: TradePosition; weights: RecordWeights; memo?: JournalEntry; maxWeight: number; maxStop: number; blind: boolean }) {
  const weight = weights.afterBuy.get(r.id) ?? null
  return (
    <div className="trade-card">
      <div className="row-between">
        <span className="title-line">
          <strong className="ellipsis">{r.assetName}</strong>
          {/* ③ 물타기 — 그 시점 이동평균 평단보다 싸게 추가 매수 */}
          {position?.isAveragingDown(r) && <Pill text="평단 아래 추가" tone="orange" />}
        </span>
        <span className="pills">
          {position && <Pill text={position.lotLabel(r)} />}
          {weight !== null && <Pill text={weightText(weight)} tone={exceedsMaxWeight(weight, maxWeight) ? 'orange' : 'accent'} />}
          <span className="muted small">{fixedDateText(r.date)}</span>
        </span>
      </div>
      <div className="trade-header small muted">
        <Pill text={BUY_REASON_LABEL[r.buyReason]} tone="red" prominent />
        <Blind text={`${r.quantity}주`} blind={blind} />
        <span>매수단가 {price(r.unitPrice, r.currency)}</span>
        <Blind text={`매수금액 ${r.currency === 'KRW' ? wonCompact(r.quantity * r.unitPrice) : dollar(r.quantity * r.unitPrice)}`} blind={blind} />
      </div>
      <PlanGrid rows={[buyEntryCells(r, blind, maxStop)]} />
      {memo && <p className="memo-preview">{memo.text}</p>}
    </div>
  )
}

function SellRow({ r, position, weights, winHoldDays, memo, blind }: { r: RatedSell; position?: TradePosition; weights: RecordWeights; winHoldDays: number | null; memo?: JournalEntry; blind: boolean }) {
  const w = weights.aroundSell.get(r.id)
  const hasBuys = !!position && position.buys.length > 0
  // 보유일 = 이 매도로 판 매수 중 가장 오래 든 것(판 매수 정보 없는 옛 기록은 첫 매수부터).
  const held = position?.longestLotHoldDays(r) ?? (position?.firstBuyDate != null ? tradingDays(position.firstBuyDate, r.date) : null)
  const isLoss = hasBuys && sellAmountKRW(r) < position!.costBasis(r)
  // ⑨ 손실 매도인데 수익 거래 평균 보유일보다 오래 들고 있었음
  const heldTooLong = isLoss && held !== null && winHoldDays !== null && held > winHoldDays
  const lotResults = position?.lotResults(r) ?? []
  const lots = position?.lotsLabel(r.soldBuyIds)
  return (
    <div className="trade-card">
      <div className="row-between">
        <strong className="ellipsis">{r.assetName}</strong>
        <span className="pills">
          {held !== null && <Pill text={`보유 ${held}일`} tone={heldTooLong ? 'orange' : 'muted'} />}
          {lots && <Pill text={lots} />}
          {w && <Pill text={weightText(w.before, w.after)} tone="accent" />}
          <span className="muted small">{fixedDateText(r.date)}</span>
        </span>
      </div>
      <div className="trade-header small muted">
        <Pill text={sellReasonText(r)} tone="blue" prominent />
        <Blind text={`${r.quantity}주`} blind={blind} />
        <span>매도단가 {price(r.unitPrice, r.currency)}</span>
        <Blind text={`매도금액 ${r.currency === 'KRW' ? wonCompact(sellAmountKRW(r)) : dollar(r.quantity * r.unitPrice)}`} blind={blind} />
      </div>
      {hasBuys && (
        <>
          <PlanGrid rows={[sellResultCells(position!, r, blind)]} />
          {/* 매수별 결과(경지에 들어간 값) — 두 개 이상 같이 팔았을 때만 */}
          {lotResults.length > 1 && (
            <div className="tiny one-line">
              {lotResults.map((l, i) => (
                <span key={l.label}>
                  <span className="muted">{i > 0 ? ' · ' : ''}{l.label} </span>
                  <Text tone={signColor(l.percent)}>{percent(l.percent, true)}</Text>
                </span>
              ))}
            </div>
          )}
          {r.reasonNote.trim() && <p className="memo-preview">{r.reasonNote.trim()}</p>}
        </>
      )}
      {memo && <p className="memo-preview">{memo.text}</p>}
    </div>
  )
}

function CashRow({ r, fx, blind }: { r: CashTx; fx?: number; blind: boolean }) {
  const label = CASH_TX_LABEL[r.type]
  const amount =
    r.type === 'exchange'
      ? r.direction === 'usdToKrw'
        ? `${dollar(r.foreignAmount)} → ${won(r.amount)}`
        : `${won(r.amount)} → ${dollar(r.foreignAmount)}`
      : r.currency === 'USD'
        ? dollar(r.amount)
        : won(r.amount)
  const implied = impliedExchangeRate(r)
  return (
    <div className="trade-card">
      <div className="row-between">
        <strong className="ellipsis">{r.memo || label}</strong>
        <span className="pills">
          <Text bold size="small" tone={increasesCash(r.type) ? 'red' : 'blue'}>{label}</Text>
          <span className="muted small">{fixedDateText(r.date)}</span>
        </span>
      </div>
      <Blind text={amount} blind={blind} className="muted small" />
      {implied !== null && (
        <span className="tiny">
          <span className="muted">환율 {rate(implied)}</span>
          {r.direction === 'usdToKrw' && fx !== undefined && (
            <>
              <span className="muted"> · 환차손익 </span>
              <Text tone={fx >= 0 ? 'red' : 'blue'}>{blind ? '•••' : (fx >= 0 ? '+' : '') + wonCompact(fx)}</Text>
            </>
          )}
        </span>
      )}
    </div>
  )
}
