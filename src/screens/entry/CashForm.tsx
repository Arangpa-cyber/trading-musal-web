// 예수금 입력 — 종류 세그먼트 → 금액·메모 → 예수금 변화 박스(환전이면 미리보기 줄) → 저장.
import { Wallet, ArrowLeftRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isSameDay, UsdBook, type CashTx, type CashTxType, type Currency, type ExchangeDirection } from '../../core'
import { useJournal } from '../../state/journal'
import {
  CashChangeBox,
  cashBlockReasons,
  draftCashDelta,
  EXCHANGE_NOTE,
  ExchangeFields,
  FieldRow,
  FillButton,
  FormRow,
  FormSection,
  NumberField,
  positive,
  SaveFooter,
  Segmented,
  TextField,
} from '../../ui/form'
import { rate, signedWon, type Tone } from '../../ui/format'
import { useBlind } from '../../ui/hooks'
import { useDraft } from './draft'
import type { EntryFormProps } from './EntrySheet'

const TYPES: { value: CashTxType; label: string }[] = [
  { value: 'deposit', label: '입금' },
  { value: 'withdrawal', label: '출금' },
  { value: 'dividend', label: '배당·이자' },
  { value: 'exchange', label: '환전' },
]

export function CashForm({ date, initialType, onDirty, save, busy }: EntryFormProps & { initialType: CashTxType }) {
  const { snapshot } = useJournal()
  const [blind] = useBlind()
  const [type, setType] = useState<CashTxType>(initialType === 'feeExpense' ? 'deposit' : initialType)
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [currency, setCurrency] = useState<Currency>('KRW') // 배당만 원화/달러
  const [direction, setDirection] = useState<ExchangeDirection>('krwToUsd')
  const [usdText, setUsdText] = useState('')
  const { dirty } = useDraft({ amount, memo, usdText })
  useEffect(() => onDirty(dirty), [dirty, onDirty])

  const cash = snapshot.cash
  const isUsdDividend = type === 'dividend' && currency === 'USD'
  const reasons = cashBlockReasons(type, amount, usdText, direction)
  const delta = reasons.length ? { krw: 0, usd: 0 } : draftCashDelta(type, amount, usdText, direction, type === 'dividend' ? currency : 'KRW')

  // 환전 미리보기 — 달러 → 원화: 확정될 환차손익, 원화 → 달러: 평균 매입 환율 변화(지금 잔액 기준).
  const preview: { items: [string, string][]; tones: Record<string, Tone> } = { items: [], tones: {} }
  const krw = positive(amount)
  const usd = positive(usdText)
  const book = new UsdBook()
  book.usd = cash.usd
  book.krw = cash.usdBookKRW
  if (type === 'exchange' && krw !== null && usd !== null) {
    if (direction === 'usdToKrw') {
      const avg = book.averageRate
      if (avg !== null) {
        const fx = krw - usd * avg
        preview.items.push(['확정될 환차손익', blind ? '•••' : signedWon(fx)])
        preview.tones['확정될 환차손익'] = fx >= 0 ? 'red' : 'blue'
      }
    } else {
      const before = book.averageRate
      book.deposit(usd, krw)
      preview.items.push(['평균 매입 환율', `${before !== null ? `${rate(before)} → ` : ''}${book.averageRate !== null ? rate(book.averageRate) : '-'}`])
    }
  }

  function submit() {
    const value = positive(amount)
    if (reasons.length || value === null) return
    const tx: CashTx = {
      id: crypto.randomUUID(),
      date,
      type,
      amount: value,
      memo: memo.trim(),
      currency: type === 'dividend' ? currency : 'KRW',
      foreignAmount: type === 'exchange' ? (positive(usdText) ?? 0) : 0,
      direction: type === 'exchange' ? direction : null,
    }
    save({ cash: [tx] })
  }

  return (
    <>
      <FormSection title="예수금 기록" icon={Wallet} footer={type === 'exchange' ? EXCHANGE_NOTE : undefined}>
        <FormRow>
          <Segmented options={TYPES} value={type} onChange={setType} label="예수금 구분" />
        </FormRow>
        {type === 'exchange' ? (
          <ExchangeFields
            krwText={amount}
            usdText={usdText}
            direction={direction}
            onKrw={setAmount}
            onUsd={setUsdText}
            onDirection={setDirection}
            usdBalance={cash.usd}
          />
        ) : (
          <>
            {type === 'dividend' && (
              <FormRow>
                <Segmented options={[{ value: 'KRW', label: '원화 ₩' }, { value: 'USD', label: '달러 $' }]} value={currency} onChange={setCurrency} label="통화" />
              </FormRow>
            )}
            <FieldRow label="금액">
              <NumberField label="금액" value={amount} onChange={setAmount} placeholder="0" unit={isUsdDividend ? '$' : '원'} decimal={isUsdDividend} />
              {type === 'withdrawal' && cash.krw > 0 && <FillButton onClick={() => setAmount(String(Math.floor(cash.krw)))} />}
            </FieldRow>
          </>
        )}
        <FormRow>
          <TextField value={memo} onChange={setMemo} placeholder="메모 (선택)" />
        </FormRow>
      </FormSection>

      {/* 입력 → 결과 → 저장: 잔액은 입력의 결과라 입력 아래, 저장 위. */}
      <FormSection title="예수금 변화" icon={ArrowLeftRight}>
        <div className="form-row">
          <CashChangeBox
            krw={cash.krw}
            usd={cash.usd}
            krwDelta={delta.krw}
            usdDelta={delta.usd}
            trailing={preview.items}
            extraTones={preview.tones}
            blind={blind}
          />
          {type === 'exchange' && krw !== null && usd !== null && (
            <>
              {direction === 'usdToKrw' &&
                (cash.usdAverageRate !== null ? (
                  <p className="form-note muted">평균 매입 환율 {rate(cash.usdAverageRate)} 기준이에요. 저장하면 확정될 환차손익이 총자산에 반영돼요.</p>
                ) : (
                  <p className="form-note tone-orange">달러 예수금이 없어서 환차손익을 계산할 수 없어요.</p>
                ))}
              {!isSameDay(date, Date.now()) && <p className="form-note muted">오늘 기준 잔액으로 미리 계산한 값이에요. 과거 날짜는 저장 후 날짜순으로 정확히 다시 계산돼요.</p>}
            </>
          )}
        </div>
      </FormSection>

      <SaveFooter title="저장" reasons={reasons} busy={busy} onSave={submit} />
    </>
  )
}
