// 표기 — iOS 앱과 같은 모양(원 정수, 달러 2자리, 억/만원 축약, 부호 있는 %).
import { calendarDays, type Currency, type Millis } from '../core'

/** "1,234,567원" */
export function won(v: number): string {
  return `${Math.round(v).toLocaleString('ko-KR')}원`
}

/** 좁은 곳 — "1.2억원" / "345만원" / "9,000원" */
export function wonCompact(v: number): string {
  const m = Math.abs(v)
  if (m >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (m >= 10_000) return `${(v / 10_000).toFixed(0)}만원`
  return won(v)
}

/** "$1,234.56", 음수는 "-$1,234.56" */
export function dollar(v: number): string {
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 거래 통화에 맞춘 가격 — 원화 "원", 달러 "$". */
export function price(v: number, currency: Currency): string {
  return currency === 'KRW' ? won(v) : dollar(v)
}

/** 환율 "1,358.12원" */
export function rate(v: number): string {
  return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`
}

/** "12.3%" / 부호 있으면 "+12.3%" */
export function percent(v: number, signed = false): string {
  return (signed && v >= 0 ? '+' : '') + `${v.toFixed(1)}%`
}

export const percentOrDash = (v: number | null | undefined, signed = true): string =>
  v === null || v === undefined ? '-' : percent(v, signed)

/** 손익비·조정 손익비 — 미너비니 방식 소수 1자리("2.3"). */
export function ratio(v: number): string {
  return v.toFixed(1)
}

/** 부호 있는 원 — "+12,000원" */
export function signedWon(v: number): string {
  return (v >= 0 ? '+' : '') + won(v)
}

/** "10/25" */
export function shortDate(t: Millis): string {
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** "오늘" / "N일 전" */
export function relativeDay(t: Millis): string {
  const days = calendarDays(t)
  return days === 0 ? '오늘' : `${days}일 전`
}

/** "비중 12.3%" — 나눠 판 매도면 "비중 12.3% → 6.1%". */
export function weightText(weight: number, after?: number | null): string {
  let text = `비중 ${weight.toFixed(1)}%`
  if (after !== undefined && after !== null && after > 0.05) text += ` → ${after.toFixed(1)}%`
  return text
}

/** 색상 규칙 — 플러스(유입·이익) 빨강, 마이너스(유출·손실) 파랑, 0 회색. */
export function signColor(v: number | null | undefined): Tone {
  if (v === null || v === undefined || v === 0) return 'muted'
  return v > 0 ? 'red' : 'blue'
}

export type Tone = 'default' | 'muted' | 'red' | 'blue' | 'orange' | 'accent' | 'gold' | 'green'
