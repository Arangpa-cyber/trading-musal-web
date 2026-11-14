// 매도 입력 — 매도할 자산 → 매도 이유(여러 개) → 팔 매수(최근 매수부터) → 수량·가격·미리보기 → 수수료·제세금 → 저장.
import { ArrowDownRight, Hash, Layers, MessageSquareText, Receipt } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  nextLotAfterSellText,
  orderSellReasons,
  SELL_REASON_LABEL,
  SELL_REASONS,
  stopGapPercent,
  stopGapWarns,
  TradePosition,
  type RatedBuy,
  type Sell,
  type SellReason,
} from '../../core'
import { useJournal } from '../../state/journal'
import { CheckRow, FieldRow, FormRow, FormSection, NumberField, parseNum, SaveFooter, SummaryBox } from '../../ui/form'
import { fixedDateText } from '../../core'
import { percent, price, shortDate, signColor, wonCompact, type Tone } from '../../ui/format'
import { useBlind } from '../../ui/hooks'
import { useDraft } from './draft'
import type { EntryFormProps } from './EntrySheet'

export function SellForm({
  date,
  initialPositionId,
  initialLotId,
  onDirty,
  onCurrency,
  save,
  busy,
}: EntryFormProps & { initialPositionId?: string; initialLotId?: string }) {
  const { snapshot } = useJournal()
  const [blind] = useBlind()
  const open = snapshot.openPositions
  const [positionId, setPositionId] = useState(initialPositionId ?? '')
  const position = open.find((p) => p.id === positionId) ?? null
  // 프리필 "N-n(까지) 매도" — 그 매수와 그보다 최근의 안 판 매수를 미리 체크한다.
  const [lots, setLots] = useState<Set<string>>(() => {
    const p = open.find((x) => x.id === initialPositionId)
    const lot = p?.availableLots().find((l) => l.id === initialLotId)
    return p && lot ? new Set(TradePosition.lotsSelling(lot, p.availableLots()).map((l) => l.id)) : new Set()
  })
  const [unitPrice, setUnitPrice] = useState('')
  const [reasons, setReasons] = useState<Set<SellReason>>(new Set())
  const [fee, setFee] = useState('')
  const [tax, setTax] = useState('')
  const lotKey = [...lots].sort().join(',')
  const { dirty, rebase } = useDraft({ lots: lotKey, unitPrice, fee, tax })
  useEffect(() => onDirty(dirty), [dirty, onDirty])
  useEffect(() => onCurrency(position?.currency ?? 'KRW'), [position, onCurrency])

  const available = position?.availableLots() ?? []
  const legacy = position?.hasLegacySells ?? false
  const chosen = available.filter((l) => lots.has(l.id))
  const quantity = position ? (legacy ? position.remainingQuantity : chosen.reduce((a, l) => a + l.quantity, 0)) : 0
  const sellPrice = parseNum(unitPrice)
  const unit = position?.isForeign ? '$' : '원'
  const lotsForDate = position ? (legacy ? position.buys : chosen) : []
  // 손절가는 매수 건마다 따로 — 판 매수 건들의 손절가를 수량으로 가중평균(옛 기록은 대표 손절가).
  const soldStop = position ? (legacy ? position.nativeStopLoss : TradePosition.averageStop(chosen)) : null

  const blockReasons: string[] = []
  if (!position) blockReasons.push('매도할 자산을 선택하세요')
  else {
    if (reasons.size === 0) blockReasons.push('매도 이유를 고르세요')
    if (quantity <= 0) blockReasons.push('팔 매수를 고르세요')
    if ((sellPrice ?? 0) <= 0) blockReasons.push('단가를 입력하세요')
    const late = TradePosition.lotBoughtAfter(date, lotsForDate)
    if (late) blockReasons.push(`매도일이 ${position.lotLabel(late)} 매수일(${fixedDateText(late.date)})보다 빨라요`)
  }

  // 미리보기 — 예상 실현손익(포지션 평균단가 기준, 수수료 포함)·수익률·손절가대비(팔리는 매수 건의 손절가 기준).
  let preview: { items: [string, string][]; tones: Record<string, Tone> } | null = null
  if (position && quantity > 0 && sellPrice !== null && sellPrice > 0 && position.nativeAverageBuyPrice > 0) {
    const nativeFee = (parseNum(fee) ?? 0) + (parseNum(tax) ?? 0)
    const split = position.pnlSplitPreview(quantity, sellPrice * quantity - nativeFee, position.averageBuyExchangeRate)
    const profit = split.trading + split.fx
    const ret = (sellPrice / position.nativeAverageBuyPrice - 1) * 100
    const stop = soldStop
    const gap = stop === null ? null : stopGapPercent(sellPrice, stop)
    const tone: Tone = profit >= 0 ? 'red' : 'blue'
    preview = {
      items: [
        ['예상 실현손익', blind ? '•••' : (profit >= 0 ? '+' : '') + wonCompact(profit)],
        ['수익률', percent(ret, true)],
      ],
      tones: { '예상 실현손익': tone, 수익률: tone },
    }
    if (gap !== null) {
      preview.items.push(['손절가대비', percent(gap, true)])
      preview.tones['손절가대비'] = stopGapWarns(gap) ? 'orange' : gap >= 0 ? 'red' : 'blue'
    }
  }
  // 경지에 기록될 결과(매수 1개 = 1건, 각 매수가 기준).
  const tally =
    position && !legacy && chosen.length && sellPrice !== null && sellPrice > 0
      ? chosen.map((l) => position.lotReturn(l, sellPrice)).filter((r): r is number => r !== null)
      : null

  function submit() {
    if (blockReasons.length || !position || sellPrice === null) return
    const record: Sell = {
      id: crypto.randomUUID(),
      tradeId: position.id,
      // 같은 날 산 매수보다 앞서면 그 매수 1초 뒤로(장부가 매도를 매수 뒤에 재생하게).
      date: TradePosition.sellDate(date, lotsForDate),
      assetName: position.assetName,
      quantity,
      unitPrice: sellPrice,
      sellReasons: orderSellReasons(reasons),
      legacyReason: '',
      reasonNote: '',
      currency: position.currency,
      fee: parseNum(fee) ?? 0,
      tax: parseNum(tax) ?? 0,
      stopLossAtSell: soldStop ?? 0, // 팔리는 매수 건들의 손절가(수량 가중평균) — 매도 카드 "손절가대비"
      soldBuyIds: legacy ? [] : available.map((l) => l.id).filter((id) => lots.has(id)),
    }
    save({ sells: [record] })
  }

  return (
    <>
      <FormSection title="매도할 자산" icon={ArrowDownRight}>
        {open.length === 0 ? (
          <FormRow className="muted">보유 중인 포지션이 없습니다</FormRow>
        ) : (
          <FormRow>
            <select
              className="select-field"
              aria-label="자산 선택"
              value={positionId}
              onChange={(e) => {
                setPositionId(e.target.value)
                setLots(new Set()) // 다른 포지션을 고르면 매수 선택을 비운다
                rebase({ lots: '' })
              }}
            >
              <option value="">선택 안 함</option>
              {open.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.assetName} · {p.remainingQuantity}주 · 평단 {price(p.isForeign ? p.nativeAverageBuyPrice : p.averageBuyPrice, p.currency)}
                  {p.firstBuyDate !== null ? ` · ${shortDate(p.firstBuyDate)} 매수` : ''}
                </option>
              ))}
            </select>
          </FormRow>
        )}
      </FormSection>

      <FormSection title="매도 이유" icon={MessageSquareText} footer="해당하는 것을 모두 골라요.">
        {SELL_REASONS.map((r) => (
          <CheckRow
            key={r}
            checked={reasons.has(r)}
            onClick={() =>
              setReasons((prev) => {
                const next = new Set(prev)
                if (next.has(r)) next.delete(r)
                else next.add(r)
                return next
              })
            }
          >
            <span>{SELL_REASON_LABEL[r]}</span>
          </CheckRow>
        ))}
      </FormSection>

      {position && (
        <FormSection
          title="팔 매수"
          icon={Layers}
          footer={
            legacy
              ? '예전 방식으로 일부 판 포지션이라 남은 수량 전부만 팔 수 있어요.'
              : '매수 카드(N-1·N-2…) 단위로, 가장 최근 매수부터 순서대로 팔아요. 줄을 누르면 그 매수와 그보다 최근 매수가 같이 골라져요.'
          }
        >
          {legacy ? (
            <FieldRow label="전량">
              <span>{blind ? '•••' : `${position.remainingQuantity}주`}</span>
            </FieldRow>
          ) : (
            <>
              <LotSelectionRows position={position} lots={available} selection={lots} onChange={setLots} blind={blind} sellPrice={sellPrice} />
              {nextLotAfterSellText(position, available, lots) && <FormRow className="muted small">{nextLotAfterSellText(position, available, lots)}</FormRow>}
            </>
          )}
        </FormSection>
      )}

      <FormSection title="수량 · 가격" icon={Hash}>
        <FieldRow label="수량">
          <span>{blind ? '•••' : quantity > 0 ? `${quantity}주` : '-'}</span>
        </FieldRow>
        <FieldRow label="단가">
          <NumberField label="단가" value={unitPrice} onChange={setUnitPrice} placeholder="단가" unit={unit} decimal={position?.isForeign} />
        </FieldRow>
        {position?.isForeign && (
          <FormRow className="form-note muted">매도 대금(수수료 차감)은 달러 예수금으로 들어가요. 환율 변동 손익은 달러를 원화로 환전할 때 확정돼요.</FormRow>
        )}
        {preview && (
          <div className="form-row">
            <SummaryBox items={preview.items} tones={preview.tones} />
          </div>
        )}
        {tally && tally.length > 0 && (
          <FormRow className="form-note muted">
            이 매도로 경지에 {tally.filter((r) => r > 0).length}승 {tally.filter((r) => r <= 0).length}패가 기록돼요 (각 매수가 기준).
          </FormRow>
        )}
      </FormSection>

      <FormSection title="수수료 · 제세금" icon={Receipt} footer="증권사 체결 내역의 수수료·제세금을 적어요. 비우면 0으로 저장돼요.">
        <FieldRow label="수수료">
          <NumberField label="수수료" value={fee} onChange={setFee} placeholder="0" unit={unit} decimal />
        </FieldRow>
        <FieldRow label="제세금">
          <NumberField label="제세금" value={tax} onChange={setTax} placeholder="0" unit={unit} decimal />
        </FieldRow>
      </FormSection>

      <SaveFooter title="매도 저장" reasons={blockReasons} busy={busy} onSave={submit} />
    </>
  )
}

/**
 * 팔 매수 고르기 — 최근 매수가 위. 한 줄을 누르면 그 매수 + 그보다 최근 매수가 선택되고,
 * 선택의 가장 오래된 줄을 다시 누르면 그 줄만 빠진다. 맨 위 "전량" = 남은 매수 전부. 수량만 블라인드.
 */
export function LotSelectionRows({
  position,
  lots,
  selection,
  onChange,
  blind,
  sellPrice,
}: {
  position: TradePosition
  /** 고를 수 있는 매수(오래된 것 먼저) */
  lots: RatedBuy[]
  selection: Set<string>
  onChange: (s: Set<string>) => void
  blind: boolean
  sellPrice: number | null
}) {
  const all = lots.length > 0 && lots.every((l) => selection.has(l.id))
  const select = (index: number) => {
    const oldest = lots.findIndex((l) => selection.has(l.id))
    const start = oldest === index ? index + 1 : index
    onChange(new Set(lots.slice(Math.min(start, lots.length)).map((l) => l.id)))
  }
  return (
    <>
      <CheckRow checked={all} onClick={() => onChange(all ? new Set() : new Set(lots.map((l) => l.id)))}>
        <strong>전량</strong>
        <span className="spacer" />
        <span className="muted">{blind ? '•••' : `${lots.reduce((a, l) => a + l.quantity, 0)}주`}</span>
      </CheckRow>
      {lots
        .map((lot, index) => ({ lot, index }))
        .reverse()
        .map(({ lot, index }) => {
          const r = sellPrice !== null && sellPrice > 0 ? position.lotReturn(lot, sellPrice) : null
          return (
            <CheckRow key={lot.id} checked={selection.has(lot.id)} onClick={() => select(index)}>
              <strong>{position.lotLabel(lot)}</strong>
              <span className="muted small ellipsis">
                {fixedDateText(lot.date)} · {price(lot.unitPrice, lot.currency)}
              </span>
              <span className="spacer" />
              {r !== null && <span className={`small bold tone-${signColor(r)}`}>{percent(r, true)}</span>}
              <span className="muted">{blind ? '•••' : `${lot.quantity}주`}</span>
            </CheckRow>
          )
        })}
    </>
  )
}
