// 날짜 계산 — 모두 브라우저(기기) 시간대 기준. 저장값은 epoch 밀리초.
import type { Millis } from './types'

const DAY = 86_400_000

/** 그 날짜의 0시(기기 시간대). */
export function startOfDay(t: Millis): Millis {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function isSameDay(a: Millis, b: Millis): boolean {
  return startOfDay(a) === startOfDay(b)
}

/** `a`의 날짜 칸이 `b`보다 뒤인가(시각은 무시). */
export function isLaterDay(a: Millis, b: Millis): boolean {
  return startOfDay(a) > startOfDay(b)
}

/**
 * 두 날짜 사이의 달력 일수 — 시각은 버리고 날짜 칸 차이만 센다(음수 방지).
 * 현재가 "N일 전"·낡음 판정용. 보유일은 `tradingDays`.
 */
export function calendarDays(start: Millis, end: Millis = Date.now()): number {
  const days = Math.round((startOfDay(end) - startOfDay(start)) / DAY)
  return Math.max(0, days)
}

/**
 * 보유일 = 거래일 수 — 시작일 다음 날부터 끝 날까지의 평일(월–금) 수. 금 → 월 = 1, 같은 날 = 0.
 * 공휴일·휴장일은 빼지 않는다(관리 부담 대비 오차가 작음).
 */
export function tradingDays(start: Millis, end: Millis = Date.now()): number {
  const days = calendarDays(start, end)
  if (days <= 0) return 0
  const startWeekday = new Date(start).getDay() // 0 = 일요일 … 6 = 토요일
  let remainder = 0
  for (let offset = 0; offset < days % 7; offset++) {
    const weekday = (startWeekday + offset + 1) % 7 // 시작일 다음 날부터
    if (weekday !== 0 && weekday !== 6) remainder++
  }
  return Math.floor(days / 7) * 5 + remainder
}

const newYorkParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

/**
 * 입력 화면의 기본 날짜 — 달러 종목은 미국 거래일(뉴욕 날짜). 미장 종가(한국 새벽 5·6시) 무렵 거래는
 * 한국 날짜로는 다음 날이라서. 시각은 지금 시각 그대로 두고 날짜만 바꾼다.
 */
export function defaultTradeDate(currency: string, now: Millis = Date.now()): Millis {
  if (currency === 'KRW') return now
  const parts = Object.fromEntries(newYorkParts.formatToParts(new Date(now)).map((p) => [p.type, p.value]))
  const d = new Date(now)
  d.setFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  return d.getTime()
}

/** 로케일과 무관하게 "yyyy-MM-dd". */
export function fixedDateText(t: Millis): string {
  const d = new Date(t)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
