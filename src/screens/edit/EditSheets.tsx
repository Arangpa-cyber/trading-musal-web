// 수정 화면(매수·매도·예수금) — 왼쪽 위 취소 · 오른쪽 위 저장(못 하면 비활성), 맨 아래 저장 불가 사유 + "이 기록 삭제".
// **고친 칸만 다시 저장**한다 — 표시용 반올림($154.4133 → 154.41)이 저장값을 바꾸지 않게.
// 고친 게 있으면 바깥 누르기로 안 닫히고 "취소"에서 "고친 내용을 버릴까요?"를 묻는다.
import { ArrowDownRight, ArrowLeftRight, Calculator, Hash, Layers, MessageSquareText, Receipt, Tag, Target, Wallet } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import {
  BUY_REASON_LABEL,
  cashDelta,
  fixedDateText,
  nextLotAfterSellText,
  orderSellReasons,
  SELL_REASON_LABEL,
  SELL_REASONS,
  sellReasonText,
  stopGapPercent,
  stopGapWarns,
  TradePosition,
  type Buy,
  type BuyReason,
  type CashTx,
  type CashTxType,
  type Currency,
  type ExchangeDirection,
  type Millis,
  type Sell,
  type SellReason,
} from '../../core'
import { errorMessage } from '../../state/backupActions'
import { useJournal, type Changes } from '../../state/journal'
import type { EditTarget } from '../../state/sheets'
import {
  CashChangeBox,
  cashBlockReasons,
  CheckRow,
  draftCashDelta,
  EXCHANGE_NOTE,
  ExchangeFields,
  FieldRow,
  FillButton,
  FormRow,
  FormSection,
  NumberField,
  parseNum,
  Segmented,
  SummaryBox,
  TextField,
} from '../../ui/form'
import { percent, price, rate, wonCompact, type Tone } from '../../ui/format'
import { useBlind } from '../../ui/hooks'
import { Alert, Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/toast'
import { useDeleteFlow } from '../history/deleteFlow'
import { LotSelectionRows } from '../entry/SellForm'

/** 칸에 채울 글자 — 달러는 센트 2자리, 원화는 정수, %는 그대로(0.25 → "0.25"). */
const priceText = (v: number, currency: Currency) => (currency === 'KRW' ? String(Math.round(v)) : v.toFixed(2))
const pctText = (v: number) => String(Number(v.toFixed(6)))
const dateInput = (t: Millis) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** 날짜 칸을 바꾸면 날짜만 바꾸고 시각은 그대로. */
const withDay = (t: Millis, value: string) => {
  const [y, m, d] = value.split('-').map(Number)
  const next = new Date(t)
  next.setFullYear(y, m - 1, d)
  return next.getTime()
}

/** 연 순간 값과 비교 — 고친 칸이면 그 숫자, 안 고쳤으면 null(저장 안 함). */
function useBaseline(values: Record<string, string>) {
  const opened = useRef(values)
  return {
    edited: (key: string, text: string) => (text === opened.current[key] ? null : parseNum(text)),
    changed: (key: string, text: string) => text !== opened.current[key],
    dirty: Object.keys(values).some((k) => values[k] !== opened.current[k]),
  }
}

function DateRow({ value, onChange }: { value: Millis; onChange: (t: Millis) => void }) {
  return (
    <label className="form-row field-row">
      <span className="field-label">날짜</span>
      <input className="date-field" type="date" value={dateInput(value)} onChange={(e) => e.target.value && onChange(withDay(value, e.target.value))} />
    </label>
  )
}

/** 수정 시트 공통 틀. */
function EditChrome({
  title,
  target,
  reasons,
  dirty,
  onSave,
  onClose,
  children,
}: {
  title: string
  target: EditTarget
  reasons: string[]
  dirty: boolean
  onSave: () => Changes
  onClose: () => void
  children: ReactNode
}) {
  const { persist } = useJournal()
  const toast = useToast()
  const del = useDeleteFlow(onClose)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [busy, setBusy] = useState(false)
  const cancel = () => (dirty ? setConfirmDiscard(true) : onClose())

  async function save() {
    setBusy(true)
    try {
      await persist(onSave())
      onClose()
      toast('수정됨')
    } catch (e) {
      window.alert(`저장하지 못했어요: ${errorMessage(e)}`)
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      blockDismiss={dirty}
      onAttemptDismiss={() => setConfirmDiscard(true)}
      leading={<button type="button" className="bar-button" onClick={cancel}>취소</button>}
      trailing={
        <button type="button" className="bar-button bold" disabled={reasons.length > 0 || busy} onClick={() => void save()}>
          저장
        </button>
      }
    >
      <div className="entry">
        {children}
        {reasons.length > 0 && (
          <ul className="block-reasons">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        <FormSection>
          <button type="button" className="form-row destructive-row" onClick={() => del.ask(target)}>
            이 기록 삭제
          </button>
        </FormSection>
      </div>
      {del.alert}
      {confirmDiscard && (
        <Alert
          title="고친 내용을 버릴까요?"
          actions={[
            { label: '계속 수정', onSelect: () => setConfirmDiscard(false) },
            { label: '버리기', destructive: true, onSelect: onClose },
          ]}
        />
      )}
    </Sheet>
  )
}

export function EditSheet({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const { data } = useJournal()
  if (target.kind === 'buy') {
    const r = data.buys.find((b) => b.id === target.id)
    return r ? <EditBuy record={r} onClose={onClose} /> : null
  }
  if (target.kind === 'sell') {
    const r = data.sells.find((s) => s.id === target.id)
    return r ? <EditSell record={r} onClose={onClose} /> : null
  }
  const r = data.cash.find((c) => c.id === target.id)
  return r ? <EditCash record={r} onClose={onClose} /> : null
}

// MARK: 매수

function EditBuy({ record, onClose }: { record: Buy; onClose: () => void }) {
  const { data, snapshot } = useJournal()
  const c = record.currency
  const unit = c === 'KRW' ? '원' : '$'
  const [assetName, setAssetName] = useState(record.assetName)
  const [date, setDate] = useState(record.date)
  const [buyReason, setBuyReason] = useState<BuyReason>(record.buyReason)
  const [quantity, setQuantity] = useState(String(record.quantity))
  const [unitPrice, setUnitPrice] = useState(priceText(record.unitPrice, c))
  const [fee, setFee] = useState(record.fee > 0 ? priceText(record.fee, c) : '')
  const [tax, setTax] = useState(record.tax > 0 ? priceText(record.tax, c) : '')
  const [entry, setEntry] = useState(priceText(record.targetEntryPrice, c))
  // 진입 시 손절가(그때의 계획)를 고친다 — 지금 손절가는 현황 카드 "현재가 · 손절가 기록"에서.
  const [stop, setStop] = useState(priceText(record.initialStopLossPrice > 0 ? record.initialStopLossPrice : record.stopLossPrice, c))
  const [riskPercent, setRiskPercent] = useState(pctText(record.riskPercent))
  const [plannedRisk, setPlannedRisk] = useState(String(Math.round(record.plannedRiskAmount)))
  const [totalAssets, setTotalAssets] = useState(String(Math.round(record.totalAssetsAtEntry)))
  const fields = { quantity, unitPrice, fee, tax, entry, stop, riskPercent, plannedRisk, totalAssets }
  const base = useBaseline({ ...fields, assetName, date: String(date), buyReason })
  const cost = snapshot.buys.find((b) => b.id === record.id)?.rate

  const tradeBuys = data.buys.filter((b) => b.tradeId === record.tradeId)
  const tradeSells = data.sells.filter((s) => s.tradeId === record.tradeId)
  const soldQty = tradeSells.reduce((a, s) => a + s.quantity, 0)
  const otherQty = tradeBuys.filter((b) => b.id !== record.id).reduce((a, b) => a + b.quantity, 0)
  // 이 매수를 판 매도 — 있으면 수량을 못 바꾼다(매도 수량 = 판 매수 수량 합이 어긋나서).
  const lotSell = tradeSells.find((s) => s.soldBuyIds.includes(record.id))

  const reasons: string[] = []
  if (!assetName.trim()) reasons.push('자산명을 입력하세요')
  const qty = Math.trunc(parseNum(quantity) ?? 0)
  if (qty > 0) {
    if (lotSell && qty !== record.quantity) reasons.push('이미 판 매수라 수량을 바꿀 수 없어요(그 매도를 먼저 지우세요)')
    else if (otherQty + qty < soldQty) reasons.push(`이 포지션에서 이미 판 수량(${soldQty}주)보다 매수 수량이 적어져요`)
  } else reasons.push('수량을 입력하세요')
  if ((parseNum(unitPrice) ?? 0) <= 0) reasons.push('평균 단가를 입력하세요')
  if (lotSell && TradePosition.lotBoughtAfter(lotSell.date, [{ date }])) reasons.push(`이 매수를 판 매도일(${fixedDateText(lotSell.date)})보다 늦은 날짜로 바꿀 수 없어요`)
  const e = parseNum(entry)
  const s = parseNum(stop)
  if (e !== null && s !== null && e > 0 && s > 0 && s >= e) reasons.push('손절가가 목표 매수가보다 낮아야 해요')

  function save(): Changes {
    const next: Buy = { ...record, date, buyReason, assetName: assetName.trim() }
    const v = (k: keyof typeof fields) => base.edited(k, fields[k])
    if (v('quantity') !== null) next.quantity = Math.trunc(v('quantity')!)
    if (v('unitPrice') !== null) next.unitPrice = v('unitPrice')!
    if (v('entry') !== null) next.targetEntryPrice = v('entry')!
    if ((v('stop') ?? 0) > 0) next.initialStopLossPrice = v('stop')!
    if (v('riskPercent') !== null) next.riskPercent = v('riskPercent')!
    if (v('plannedRisk') !== null) next.plannedRiskAmount = v('plannedRisk')!
    if (v('totalAssets') !== null) next.totalAssetsAtEntry = v('totalAssets')!
    // 수수료·제세금은 비우면 0(입력 화면과 같은 규칙).
    if (base.changed('fee', fee)) next.fee = parseNum(fee) ?? 0
    if (base.changed('tax', tax)) next.tax = parseNum(tax) ?? 0
    // 자산명은 거래 단위 — 같은 거래의 매수·매도·메모를 모두 바꾼다(자산 상세·같은 종목 합치기가 자산명으로 모아서).
    if (next.assetName !== record.assetName) {
      const name = next.assetName
      return {
        buys: [next, ...tradeBuys.filter((b) => b.id !== record.id).map((b) => ({ ...b, assetName: name }))],
        sells: tradeSells.map((x) => ({ ...x, assetName: name })),
        journals: data.journals.filter((j) => j.tradeId === record.tradeId).map((j) => ({ ...j, assetName: name })),
      }
    }
    return { buys: [next] }
  }

  return (
    <EditChrome title="매수 기록 수정" target={{ kind: 'buy', id: record.id }} reasons={reasons} dirty={base.dirty} onSave={save} onClose={onClose}>
      <FormSection title="자산" icon={Tag}>
        <FieldRow label="자산명">
          <TextField value={assetName} onChange={setAssetName} />
        </FieldRow>
        <DateRow value={date} onChange={setDate} />
        <FormRow>
          <Segmented options={(Object.keys(BUY_REASON_LABEL) as BuyReason[]).map((r) => ({ value: r, label: BUY_REASON_LABEL[r] }))} value={buyReason} onChange={setBuyReason} label="매수 이유" />
        </FormRow>
        {c !== 'KRW' && cost !== undefined && (
          // 원가 환율은 달러 장부(평균 매입 환율)가 정하므로 고치지 않는다.
          <FieldRow label="원가 환율">
            <span>{rate(cost)}</span>
          </FieldRow>
        )}
      </FormSection>
      <FormSection title="실제 체결" icon={Calculator}>
        <FieldRow label="수량">
          <NumberField label="수량" value={quantity} onChange={setQuantity} placeholder="0" unit="주" />
        </FieldRow>
        <FieldRow label="평균 단가">
          <NumberField label="평균 단가" value={unitPrice} onChange={setUnitPrice} placeholder="0" unit={unit} decimal />
        </FieldRow>
      </FormSection>
      <FormSection title="수수료 · 제세금" icon={Receipt}>
        <FieldRow label="수수료">
          <NumberField label="수수료" value={fee} onChange={setFee} placeholder="0" unit={unit} decimal />
        </FieldRow>
        <FieldRow label="제세금">
          <NumberField label="제세금" value={tax} onChange={setTax} placeholder="0" unit={unit} decimal />
        </FieldRow>
      </FormSection>
      <FormSection title="매매계획" icon={Target}>
        <FieldRow label="목표 매수가">
          <NumberField label="목표 매수가" value={entry} onChange={setEntry} placeholder="0" unit={unit} decimal />
        </FieldRow>
        <FieldRow label="진입 시 손절가">
          <NumberField label="진입 시 손절가" value={stop} onChange={setStop} placeholder="0" unit={unit} decimal />
        </FieldRow>
        <FieldRow label="리스크율">
          <NumberField label="리스크율" value={riskPercent} onChange={setRiskPercent} placeholder="0" unit="%" decimal />
        </FieldRow>
        <FieldRow label="진입 허용손실">
          <NumberField label="진입 허용손실" value={plannedRisk} onChange={setPlannedRisk} placeholder="0" unit="원" />
        </FieldRow>
        <FieldRow label="매수 시점 총자산">
          <NumberField label="매수 시점 총자산" value={totalAssets} onChange={setTotalAssets} placeholder="0" unit="원" />
        </FieldRow>
      </FormSection>
    </EditChrome>
  )
}

// MARK: 매도

function EditSell({ record, onClose }: { record: Sell; onClose: () => void }) {
  const { snapshot } = useJournal()
  const [blind] = useBlind()
  const c = record.currency
  const unit = c === 'KRW' ? '원' : '$'
  const position = snapshot.positions.find((p) => p.id === record.tradeId)
  const [date, setDate] = useState(record.date)
  const [lots, setLots] = useState<Set<string>>(new Set(record.soldBuyIds))
  const [unitPrice, setUnitPrice] = useState(priceText(record.unitPrice, c))
  const [reasons, setReasons] = useState<Set<SellReason>>(new Set(record.sellReasons))
  const [fee, setFee] = useState(record.fee > 0 ? priceText(record.fee, c) : '')
  const [tax, setTax] = useState(record.tax > 0 ? priceText(record.tax, c) : '')
  const base = useBaseline({ date: String(date), lots: [...lots].sort().join(','), unitPrice, reasons: orderSellReasons(reasons).join(','), fee, tax })
  if (!position) return null

  const legacy = record.soldBuyIds.length === 0 // 판 매수 정보 없는 옛 매도 — 수량 그대로(읽기 전용)
  const legacyReason = record.sellReasons.length === 0 && record.legacyReason !== ''
  const openedLots = new Set(record.soldBuyIds)
  // 고를 수 있는 매수 = 안 판 매수 + 이 매도가 판 매수 — 이 매도 날짜까지 산 것만.
  const choices = position.availableLots(record).filter((b) => b.date <= record.date || openedLots.has(b.id))
  const chosen = choices.filter((b) => lots.has(b.id))
  const quantity = legacy ? record.quantity : chosen.reduce((a, b) => a + b.quantity, 0)
  const sellPrice = parseNum(unitPrice)
  const rated = snapshot.sells.find((s) => s.id === record.id)!
  const stopAtSell = position.stopAtSell(rated)

  const blockReasons: string[] = []
  if (reasons.size === 0 && !legacyReason) blockReasons.push('매도 이유를 고르세요')
  if (quantity <= 0) blockReasons.push('판 매수를 고르세요')
  const soldLots = legacy ? position.buys : chosen
  const late = TradePosition.lotBoughtAfter(date, soldLots)
  if (late) blockReasons.push(`매도일이 ${position.lotLabel(late)} 매수일(${fixedDateText(late.date)})보다 빨라요`)
  if ((sellPrice ?? 0) <= 0) blockReasons.push('단가를 입력하세요')

  // 미리보기 — 원가는 이 매도 시점 이동평균.
  let preview: { items: [string, string][]; tones: Record<string, Tone> } | null = null
  const costPrice = position.nativeCostPrice(rated)
  if (blockReasons.length === 0 && sellPrice !== null && costPrice > 0) {
    const nativeFee = (parseNum(fee) ?? 0) + (parseNum(tax) ?? 0)
    const split = position.pnlSplitEditing(rated, quantity, sellPrice * quantity - nativeFee)
    const profit = split.trading + split.fx
    const tone: Tone = profit >= 0 ? 'red' : 'blue'
    const gap = stopAtSell === null ? null : stopGapPercent(sellPrice, stopAtSell)
    preview = {
      items: [
        ['예상 실현손익', blind ? '•••' : (profit >= 0 ? '+' : '') + wonCompact(profit)],
        ['수익률', percent((sellPrice / costPrice - 1) * 100, true)],
      ],
      tones: { '예상 실현손익': tone, 수익률: tone },
    }
    if (gap !== null) {
      preview.items.push(['손절가대비', percent(gap, true)])
      preview.tones['손절가대비'] = stopGapWarns(gap) ? 'orange' : gap >= 0 ? 'red' : 'blue'
    }
  }

  function save(): Changes {
    const next: Sell = { ...record }
    if (date !== record.date) next.date = TradePosition.sellDate(date, soldLots)
    if (reasons.size > 0) {
      next.sellReasons = orderSellReasons(reasons)
      next.legacyReason = ''
    }
    if (!legacy && base.changed('lots', [...lots].sort().join(','))) {
      next.soldBuyIds = choices.map((b) => b.id).filter((id) => lots.has(id))
      next.quantity = quantity
    }
    const v = base.edited('unitPrice', unitPrice)
    if (v !== null) next.unitPrice = v
    if (base.changed('fee', fee)) next.fee = parseNum(fee) ?? 0
    if (base.changed('tax', tax)) next.tax = parseNum(tax) ?? 0
    return { sells: [next] }
  }

  return (
    <EditChrome title="매도 기록 수정" target={{ kind: 'sell', id: record.id }} reasons={blockReasons} dirty={base.dirty} onSave={save} onClose={onClose}>
      <FormSection title="매도한 자산" icon={ArrowDownRight}>
        <FieldRow label="자산명">
          <span>{record.assetName}</span>
        </FieldRow>
        <DateRow value={date} onChange={setDate} />
        {c !== 'KRW' && (
          <FieldRow label="원가 환율">
            <span>{rate(rated.rate)}</span>
          </FieldRow>
        )}
        {stopAtSell !== null && (
          // 매도 시점 손절가 — 손절가대비의 기준(읽기 전용).
          <FieldRow label="매도 시점 손절가">
            <span>{price(stopAtSell, c)}</span>
          </FieldRow>
        )}
      </FormSection>
      <FormSection
        title="매도 이유"
        icon={MessageSquareText}
        footer={legacyReason ? `예전 사유: ${sellReasonText(record)}${record.reasonNote ? ` — ${record.reasonNote}` : ''}. 새로 고르지 않으면 그대로 둬요.` : undefined}
      >
        {SELL_REASONS.map((r) => (
          <CheckRow
            key={r}
            checked={reasons.has(r)}
            onClick={() =>
              setReasons((prev) => {
                const n = new Set(prev)
                if (n.has(r)) n.delete(r)
                else n.add(r)
                return n
              })
            }
          >
            <span>{SELL_REASON_LABEL[r]}</span>
          </CheckRow>
        ))}
      </FormSection>
      {!legacy && (
        <FormSection title="판 매수" icon={Layers}>
          <LotSelectionRows position={position} lots={choices} selection={lots} onChange={setLots} blind={blind} sellPrice={sellPrice} />
          {nextLotAfterSellText(position, choices, lots) && <FormRow className="muted small">{nextLotAfterSellText(position, choices, lots)}</FormRow>}
        </FormSection>
      )}
      <FormSection title="수량 · 가격" icon={Hash}>
        <FieldRow label="수량">
          <span>{blind ? '•••' : `${quantity}주`}</span>
        </FieldRow>
        <FieldRow label="단가">
          <NumberField label="단가" value={unitPrice} onChange={setUnitPrice} placeholder="0" unit={unit} decimal />
        </FieldRow>
        {preview && (
          <div className="form-row">
            <SummaryBox items={preview.items} tones={preview.tones} />
          </div>
        )}
      </FormSection>
      <FormSection title="수수료 · 제세금" icon={Receipt}>
        <FieldRow label="수수료">
          <NumberField label="수수료" value={fee} onChange={setFee} placeholder="0" unit={unit} decimal />
        </FieldRow>
        <FieldRow label="제세금">
          <NumberField label="제세금" value={tax} onChange={setTax} placeholder="0" unit={unit} decimal />
        </FieldRow>
      </FormSection>
    </EditChrome>
  )
}

// MARK: 예수금

function EditCash({ record, onClose }: { record: CashTx; onClose: () => void }) {
  const { snapshot } = useJournal()
  const [blind] = useBlind()
  const [date, setDate] = useState(record.date)
  const [type, setType] = useState<CashTxType>(record.type)
  const usdAmount = record.type === 'dividend' && record.currency === 'USD'
  const [amount, setAmount] = useState(usdAmount ? record.amount.toFixed(2) : String(Math.round(record.amount)))
  const [memo, setMemo] = useState(record.memo)
  const [currency, setCurrency] = useState<Currency>(record.currency)
  const [direction, setDirection] = useState<ExchangeDirection>(record.direction ?? 'krwToUsd')
  const [usdText, setUsdText] = useState(record.foreignAmount > 0 ? record.foreignAmount.toFixed(2) : '')
  const base = useBaseline({ date: String(date), type, amount, memo, currency, direction, usdText })

  // 고를 수 있는 종류 — 수수료는 입력에서 뺐으므로 원래 기록이 수수료일 때만.
  const types: { value: CashTxType; label: string }[] = [
    { value: 'deposit', label: '입금' },
    { value: 'withdrawal', label: '출금' },
    { value: 'dividend', label: '배당·이자' },
    ...(record.type === 'feeExpense' ? [{ value: 'feeExpense' as const, label: '수수료' }] : []),
    { value: 'exchange', label: '환전' },
  ]
  const reasons = cashBlockReasons(type, amount, usdText, direction)
  const isUsd = type === 'dividend' && currency === 'USD'
  // 지금 예수금엔 이 기록(원래 값)이 이미 들어가 있다 — 수정 후 효과 − 원래 효과만큼 더 바뀐다.
  const old = cashDelta(record)
  const now = reasons.length ? old : draftCashDelta(type, amount, usdText, direction, type === 'dividend' ? currency : 'KRW')
  const cash = snapshot.cash
  const availableKrw = cash.krw - old.krw

  function save(): Changes {
    const next: CashTx = { ...record, date, type, memo: memo.trim() }
    const v = base.edited('amount', amount)
    if (v !== null) next.amount = v
    // 종류에 안 맞는 옛 값(환전 방향·달러 금액, 배당 통화)은 지운다.
    if (type === 'exchange') {
      next.currency = 'KRW'
      next.direction = direction
      const u = base.edited('usdText', usdText)
      if (u !== null) next.foreignAmount = u
    } else {
      next.currency = type === 'dividend' ? currency : 'KRW'
      next.direction = null
      next.foreignAmount = 0
    }
    return { cash: [next] }
  }

  return (
    <EditChrome title="예수금 기록 수정" target={{ kind: 'cash', id: record.id }} reasons={reasons} dirty={base.dirty} onSave={save} onClose={onClose}>
      <FormSection title="예수금 기록" icon={Wallet} footer={type === 'exchange' ? EXCHANGE_NOTE : undefined}>
        <DateRow value={date} onChange={setDate} />
        <FormRow>
          <Segmented options={types} value={type} onChange={setType} label="예수금 구분" />
        </FormRow>
        {type === 'exchange' ? (
          <ExchangeFields krwText={amount} usdText={usdText} direction={direction} onKrw={setAmount} onUsd={setUsdText} onDirection={setDirection} usdBalance={cash.usd - old.usd} />
        ) : (
          <>
            {type === 'dividend' && (
              <FormRow>
                <Segmented options={[{ value: 'KRW', label: '원화 ₩' }, { value: 'USD', label: '달러 $' }]} value={currency} onChange={setCurrency} label="통화" />
              </FormRow>
            )}
            <FieldRow label="금액">
              <NumberField label="금액" value={amount} onChange={setAmount} placeholder="0" unit={isUsd ? '$' : '원'} decimal={isUsd} />
              {type === 'withdrawal' && availableKrw > 0 && <FillButton onClick={() => setAmount(String(Math.floor(availableKrw)))} />}
            </FieldRow>
          </>
        )}
        <FormRow>
          <TextField value={memo} onChange={setMemo} placeholder="메모 (선택)" />
        </FormRow>
      </FormSection>
      <FormSection title="예수금 변화" icon={ArrowLeftRight}>
        <div className="form-row">
          <CashChangeBox krw={cash.krw} usd={cash.usd} krwDelta={now.krw - old.krw} usdDelta={now.usd - old.usd} blind={blind} />
        </div>
      </FormSection>
    </EditChrome>
  )
}
