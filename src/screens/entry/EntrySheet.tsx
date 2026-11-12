// 입력 시트 — 날짜 → 구분(자산/예수금) → 매수/매도 → 각 폼. 저장하면 닫힌다(다음엔 새 폼).
// 쓰던 내용이 있으면 바깥 누르기·Esc로 닫히지 않고, "닫기"에서 "작성 중인 내용을 버릴까요?"를 묻는다.
import { ListChecks } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultTradeDate, isSameDay, type Currency, type Millis } from '../../core'
import { errorMessage } from '../../state/backupActions'
import type { EntryRequest } from '../../state/entry'
import { useJournal, type Changes } from '../../state/journal'
import { FormRow, FormSection, Segmented } from '../../ui/form'
import { Alert, Sheet } from '../../ui/Sheet'
import { BuyForm } from './BuyForm'
import { CashForm } from './CashForm'
import { RulesSheet } from './RulesSheet'
import { SellForm } from './SellForm'

export type SavePayload = Pick<Changes, 'buys' | 'sells' | 'cash'>

/** 각 폼이 받는 공통 값. */
export interface EntryFormProps {
  date: Millis
  onDirty: (dirty: boolean) => void
  /** 기본 날짜를 정하는 통화(달러 = 미국 거래일) */
  onCurrency: (c: Currency) => void
  save: (payload: SavePayload) => void
  busy: boolean
}

type Category = 'asset' | 'cash'
type TradeType = 'buy' | 'sell'

/** date 입력칸 값 "yyyy-mm-dd" ↔ 시각(시각은 화면을 연 시각 그대로). */
const toInput = (t: Millis) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function EntrySheet({ request, onClose }: { request: EntryRequest; onClose: () => void }) {
  const { persist } = useJournal()
  const [category, setCategory] = useState<Category>(request.kind === 'cash' ? 'cash' : 'asset')
  const [type, setType] = useState<TradeType>(request.kind === 'sell' ? 'sell' : 'buy')
  const [date, setDate] = useState<Millis>(() => Date.now())
  const [dirty, setDirty] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 통화가 바뀌면 기본 날짜도 따라간다(달러 = 뉴욕 날짜) — 날짜를 직접 바꿨으면 그대로.
  const currencyRef = useRef<Currency>('KRW')
  const onCurrency = useCallback((next: Currency) => {
    const prev = currencyRef.current
    currencyRef.current = next
    setDate((d) => (prev !== next && isSameDay(d, defaultTradeDate(prev)) ? defaultTradeDate(next) : d))
  }, [])
  // 예수금은 원화(오늘).
  useEffect(() => {
    if (category === 'cash') onCurrency('KRW')
  }, [category, onCurrency])

  const close = () => (dirty ? setConfirmDiscard(true) : onClose())

  async function save(payload: SavePayload) {
    setBusy(true)
    setError(null)
    try {
      await persist(payload)
      onClose()
    } catch (e) {
      setError(`저장하지 못했어요: ${errorMessage(e)}`)
      setBusy(false)
    }
  }

  const common: EntryFormProps = { date, onDirty: setDirty, onCurrency, save: (p) => void save(p), busy }

  return (
    <Sheet
      title="입력"
      onClose={onClose}
      blockDismiss={dirty}
      onAttemptDismiss={() => setConfirmDiscard(true)}
      leading={
        <button type="button" className="bar-button" onClick={close}>
          닫기
        </button>
      }
      trailing={
        <button type="button" className="icon-button tone-muted" aria-label="원칙" onClick={() => setShowRules(true)}>
          <ListChecks size={22} />
        </button>
      }
    >
      <div className="entry">
        <FormSection>
          <label className="form-row field-row">
            <span className="field-label">날짜</span>
            <input
              className="date-field"
              type="date"
              value={toInput(date)}
              onChange={(e) => {
                if (!e.target.value) return
                const [y, m, d] = e.target.value.split('-').map(Number)
                const next = new Date(date)
                next.setFullYear(y, m - 1, d)
                setDate(next.getTime())
              }}
            />
          </label>
          <FormRow>
            <Segmented options={[{ value: 'asset', label: '자산' }, { value: 'cash', label: '예수금' }]} value={category} onChange={setCategory} label="구분" />
          </FormRow>
          {category === 'asset' && (
            <FormRow>
              <Segmented options={[{ value: 'buy', label: '매수' }, { value: 'sell', label: '매도' }]} value={type} onChange={setType} label="매수/매도" />
            </FormRow>
          )}
        </FormSection>

        {category === 'cash' ? (
          <CashForm {...common} initialType={request.kind === 'cash' ? request.type : 'deposit'} />
        ) : type === 'buy' ? (
          <BuyForm {...common} pyramidPositionId={request.kind === 'pyramid' ? request.positionId : undefined} />
        ) : (
          <SellForm {...common} initialPositionId={request.kind === 'sell' ? request.positionId : undefined} initialLotId={request.kind === 'sell' ? request.lotId : undefined} />
        )}
        {error && <p className="form-note tone-orange center-text">{error}</p>}
      </div>

      {confirmDiscard && (
        <Alert
          title="작성 중인 내용을 버릴까요?"
          actions={[
            { label: '계속 작성', onSelect: () => setConfirmDiscard(false) },
            { label: '버리기', destructive: true, onSelect: onClose },
          ]}
        />
      )}
      {showRules && <RulesSheet onClose={() => setShowRules(false)} />}
    </Sheet>
  )
}
