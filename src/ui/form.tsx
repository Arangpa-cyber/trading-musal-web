// 입력 화면 공용 부품 — 섹션(iOS Form 섹션), 숫자 칸(천 단위 쉼표), 세그먼트, 결과 박스, 예수금 변화 박스, 환전 칸, 저장 버튼.
import { ArrowUpDown, CheckCircle2, Circle } from 'lucide-react'
import type { ComponentType, KeyboardEvent, ReactNode } from 'react'
import { cashDeltaOf, type CashTxType, type Currency, type ExchangeDirection } from '../core'
import { dollar, rate as rateText, won, type Tone } from './format'

type Icon = ComponentType<{ size?: number }>

/** 섹션 — 머리글(아이콘+제목) + 흰 그룹 상자 + 꼬리말. */
export function FormSection({ title, icon: IconC, footer, children }: { title?: string; icon?: Icon; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="form-section">
      {title && (
        <div className="form-section-title">
          {IconC && <IconC size={14} />}
          {title}
        </div>
      )}
      <div className="form-group">{children}</div>
      {footer && <div className="form-footer">{footer}</div>}
    </section>
  )
}

/** 한 줄 — 왼쪽 라벨, 오른쪽 내용. */
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="form-row field-row">
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  )
}

export function FormRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`form-row ${className}`}>{children}</div>
}

/** 숫자 문자열 → 숫자(쉼표 무시). 비었거나 숫자가 아니면 null. */
export function parseNum(text: string): number | null {
  const t = text.replace(/,/g, '').trim()
  if (t === '' || t === '.' || t === '-') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/** 0보다 큰 숫자만. */
export function positive(text: string): number | null {
  const v = parseNum(text)
  return v !== null && v > 0 ? v : null
}

/** 입력 중인 숫자에 천 단위 쉼표 — 소수점 아래는 그대로. */
function withCommas(raw: string): string {
  if (raw === '') return ''
  const [int, frac] = raw.split('.')
  const sign = int.startsWith('-') ? '-' : ''
  const digits = int.replace('-', '')
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return sign + grouped + (frac !== undefined ? `.${frac}` : '')
}

/** Enter = 다음 칸으로(iOS 키보드 "다음"). 마지막 칸이면 키보드를 내린다. */
export function focusNextOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  e.preventDefault()
  const form = e.currentTarget.closest('.sheet-body') ?? document
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input:not([type=checkbox]):not([type=date]):not([disabled]), textarea'))
  const i = inputs.indexOf(e.currentTarget)
  const next = inputs[i + 1]
  if (next) next.focus()
  else e.currentTarget.blur()
}

/**
 * 숫자 칸 — 저장값은 쉼표 없는 문자열. `placeholder`에 자동 계산값을 넣으면 회색으로 보이고, 직접 적으면 그 값이 우선.
 * `decimal` = 소수점 허용(달러·%).
 */
export function NumberField({
  value,
  onChange,
  placeholder,
  unit,
  decimal,
  label,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  unit?: string
  decimal?: boolean
  label?: string
  autoFocus?: boolean
}) {
  return (
    <span className="number-field">
      <input
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        enterKeyHint="next"
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        value={withCommas(value)}
        autoFocus={autoFocus}
        onKeyDown={focusNextOnEnter}
        onChange={(e) => {
          let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '')
          if (!decimal) raw = raw.replace(/\./g, '')
          const dot = raw.indexOf('.')
          if (dot >= 0) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '')
          onChange(raw)
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </span>
  )
}

export function TextField({ value, onChange, placeholder, list }: { value: string; onChange: (v: string) => void; placeholder?: string; list?: string }) {
  return (
    <input
      className="text-field"
      type="text"
      enterKeyHint="next"
      placeholder={placeholder}
      value={value}
      list={list}
      onKeyDown={focusNextOnEnter}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** 세그먼트(iOS segmented picker). */
export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="form-row toggle-row">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

/** 체크 줄 — 매도 이유·팔 매수 선택. */
export function CheckRow({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="form-row check-row" role="checkbox" aria-checked={checked} onClick={onClick}>
      {checked ? <CheckCircle2 size={20} className="tone-accent" /> : <Circle size={20} className="tone-muted" />}
      {children}
    </button>
  )
}

/** 결과 박스 — 2열 "라벨 …… 값". 앱 전체 결과 박스는 이 하나(연한 강조색 배경). */
export function SummaryBox({ items, tones = {} }: { items: [string, string][]; tones?: Record<string, Tone> }) {
  return (
    <div className="summary">
      {items.map(([label, value]) => (
        <div key={label} className="summary-row">
          <span className="tone-muted">{label}</span>
          <span className={`bold ${tones[label] ? `tone-${tones[label]}` : ''}`}>{value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * 예수금 변화 박스 — "원화 예수금 …… A → B". 바뀌면 증가 빨강·감소 파랑, 안 바뀌면 회색. 블라인드면 "••• ↑/↓".
 * 모자라면 박스 아래 주황 경고(저장은 막지 않는다).
 */
export function CashChangeBox({
  krw,
  usd,
  krwDelta = 0,
  usdDelta = 0,
  showKRW = true,
  showUSD = true,
  leading = [],
  trailing = [],
  extraTones = {},
  usdShortfallHint = '',
  blind,
}: {
  krw: number
  usd: number
  krwDelta?: number
  usdDelta?: number
  showKRW?: boolean
  showUSD?: boolean
  leading?: [string, string][]
  trailing?: [string, string][]
  extraTones?: Record<string, Tone>
  usdShortfallHint?: string
  blind: boolean
}) {
  const text = (now: number, delta: number, fmt: (v: number) => string) => {
    if (delta === 0) return blind ? '•••' : fmt(now)
    if (blind) return `••• ${delta > 0 ? '↑' : '↓'}`
    return `${fmt(now)} → ${fmt(now + delta)}`
  }
  const tone = (d: number): Tone => (d === 0 ? 'muted' : d > 0 ? 'red' : 'blue')
  const items: [string, string][] = [...leading]
  if (showKRW) items.push(['원화 예수금', text(krw, krwDelta, won)])
  if (showUSD) items.push(['달러 예수금', text(usd, usdDelta, dollar)])
  items.push(...trailing)
  return (
    <>
      <SummaryBox items={items} tones={{ ...extraTones, '원화 예수금': tone(krwDelta), '달러 예수금': tone(usdDelta) }} />
      {showKRW && krwDelta < 0 && krw + krwDelta < 0 && (
        <p className="form-note tone-orange">원화 예수금이 {blind ? '•••' : won(-(krw + krwDelta))} 모자라요. 이대로 저장하면 원화 예수금이 마이너스가 돼요.</p>
      )}
      {showUSD && usdDelta < 0 && usd + usdDelta < -0.005 && (
        <p className="form-note tone-orange">
          달러 예수금이 {blind ? '•••' : dollar(-(usd + usdDelta))} 모자라요. {usdShortfallHint}이대로 저장하면 달러 예수금이 마이너스가 돼요.
        </p>
      )}
    </>
  )
}

/** 지금 적고 있는 예수금 기록의 원화·달러 변화(저장된 기록과 같은 규칙). */
export function draftCashDelta(type: CashTxType, krwText: string, usdText: string, direction: ExchangeDirection, currency: Currency) {
  const amount = positive(krwText)
  if (amount === null) return { krw: 0, usd: 0 }
  if (type === 'exchange' && positive(usdText) === null) return { krw: 0, usd: 0 }
  return cashDeltaOf(type, amount, positive(usdText) ?? 0, direction, currency)
}

/** 예수금 저장 불가 사유(입력·수정 공용). */
export function cashBlockReasons(type: CashTxType, krwText: string, usdText: string, direction: ExchangeDirection): string[] {
  if (type !== 'exchange') return positive(krwText) === null ? ['금액을 입력하세요'] : []
  const krwToUsd = direction === 'krwToUsd'
  const reasons: string[] = []
  if (positive(krwText) === null) reasons.push(`${krwToUsd ? '보낸' : '받은'} 원화를 입력하세요`)
  if (positive(usdText) === null) reasons.push(`${krwToUsd ? '받은' : '보낸'} 달러를 입력하세요`)
  return reasons
}

export const EXCHANGE_NOTE = '환전은 입금이 아니에요. 계좌 안에서 돈의 형태만 바뀌는 거라 순입금액은 그대로예요.'

/** 환전 칸 — 송금 앱처럼 보낸 금액 → ⇅(방향 전환) → 받은 금액. 달러 → 원화면 보낸 달러 옆 "전액". */
export function ExchangeFields({
  krwText,
  usdText,
  direction,
  onKrw,
  onUsd,
  onDirection,
  usdBalance = 0,
}: {
  krwText: string
  usdText: string
  direction: ExchangeDirection
  onKrw: (v: string) => void
  onUsd: (v: string) => void
  onDirection: (d: ExchangeDirection) => void
  usdBalance?: number
}) {
  const krwFirst = direction === 'krwToUsd'
  const krw = positive(krwText)
  const usd = positive(usdText)
  const row = (isKrw: boolean, sending: boolean) => (
    <FieldRow label={`${sending ? '보낸' : '받은'} ${isKrw ? '원화' : '달러'}`}>
      {isKrw ? (
        <NumberField label={`${sending ? '보낸' : '받은'} 원화`} value={krwText} onChange={onKrw} placeholder="0" unit="원" />
      ) : (
        <>
          <NumberField label={`${sending ? '보낸' : '받은'} 달러`} value={usdText} onChange={onUsd} placeholder="0" unit="$" decimal />
          {sending && usdBalance > 0.005 && <FillButton onClick={() => onUsd(usdBalance.toFixed(2))} />}
        </>
      )}
    </FieldRow>
  )
  return (
    <>
      {row(krwFirst, true)}
      <div className="form-row row-between">
        <button type="button" className="text-button" onClick={() => onDirection(krwFirst ? 'usdToKrw' : 'krwToUsd')}>
          <ArrowUpDown size={16} /> {krwFirst ? '원화 → 달러' : '달러 → 원화'}
        </button>
        {krw !== null && usd !== null && <span className="muted small">1$ = {rateText(krw / usd)}</span>}
      </div>
      {row(!krwFirst, false)}
    </>
  )
}

/** 잔액을 한 번에 채우는 작은 버튼 — "전액"·"부족분". */
export function FillButton({ label = '전액', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" className="fill-button" onClick={onClick}>
      {label}
    </button>
  )
}

/** 저장 버튼 + (저장할 수 없으면) 그 이유를 버튼 위에. */
export function SaveFooter({ title, reasons, busy, onSave }: { title: string; reasons: string[]; busy?: boolean; onSave: () => void }) {
  return (
    <div className="save-footer">
      {reasons.length > 0 && (
        <ul className="block-reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <button type="button" className="primary wide" disabled={reasons.length > 0 || busy} onClick={onSave}>
        {busy ? '저장 중…' : title}
      </button>
    </div>
  )
}
