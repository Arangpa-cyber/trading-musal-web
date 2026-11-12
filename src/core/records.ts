// 기록 한 건 단위 계산 — 원화 금액은 `rate`(원/거래통화 1단위, 원화 종목은 1)를 곱해 만든다.
// `rate`는 저장값이 아니라 `resolveRates`가 달러 장부로 정한 값이다.
import type { Buy, CashTx, CashTxType, Currency, ExchangeDirection, Sell } from './types'

export interface RatedBuy extends Buy {
  /** 원가 환율 — 달러 매수 = 그 시점 달러 평균 매입 환율(모르면 `fallbackRate`), 원화 = 1. */
  rate: number
}

export interface RatedSell extends Sell {
  /** 달러 매도 = 그 포지션 원가 환율(매도 시점 환차손익 0), 원화 = 1. */
  rate: number
}

export interface CurrencyPair {
  krw: number
  usd: number
}

export const isForeign = (r: { currency: Currency }): boolean => r.currency !== 'KRW'

// MARK: 매수

/** 체결금액(원, 수수료 제외). */
export const buyAmountKRW = (b: RatedBuy): number => b.quantity * b.unitPrice * b.rate
/** 매수원가(거래 통화, 수수료·거래세 포함). */
export const buyCostNative = (b: Buy): number => b.quantity * b.unitPrice + b.fee + b.tax
/** 매수원가(원, 수수료·거래세 포함). */
export const buyCostKRW = (b: RatedBuy): number => buyCostNative(b) * b.rate
/** 수수료·거래세(원). */
export const buyFeeKRW = (b: RatedBuy): number => (b.fee + b.tax) * b.rate

/** 이 매수로 빠진 예수금 — 원화 종목은 원화 예수금, 달러 종목은 달러 예수금에서. */
export function buyCashOutflow(b: RatedBuy): CurrencyPair {
  return isForeign(b) ? { krw: 0, usd: buyCostNative(b) } : { krw: buyCostKRW(b), usd: 0 }
}

/** 진입 시 손절가가 기록돼 있는지(iOS에서 필드가 생기기 전 기록은 false). */
export const hasEntryStopLoss = (b: Buy): boolean => b.initialStopLossPrice > 0
/** 진입 시 손절가(거래 통화) — 모르면 현재 손절가. */
export const entryStopLossPrice = (b: Buy): number => (hasEntryStopLoss(b) ? b.initialStopLossPrice : b.stopLossPrice)

/** 진입 손절가에서의 손익(원, 음수 = 손실). */
export const entryPnlAtStop = (b: RatedBuy): number => (entryStopLossPrice(b) - b.unitPrice) * b.quantity * b.rate

/** 진입 손절률(%) = (진입 손절가 − 매수단가) ÷ 매수단가. */
export function entryStopPercent(b: Buy): number | null {
  return b.unitPrice > 0 ? ((entryStopLossPrice(b) - b.unitPrice) / b.unitPrice) * 100 : null
}

/**
 * ① 매수 카드 리스크율 주황 — 진입 손절가 손실이 저장할 때 정한 허용손실을 넘었나(1원 + 0.5% 여유).
 * 진입 손절가가 없는 옛 기록·허용손실 0 기록은 판정 안 함.
 */
export function entryRiskExceeded(b: RatedBuy): boolean {
  const pnl = entryPnlAtStop(b)
  if (!hasEntryStopLoss(b) || b.plannedRiskAmount <= 0 || pnl >= 0) return false
  return -pnl > b.plannedRiskAmount * 1.005 + 1
}

/** ② 매수 카드 손절률 주황 — 손절폭이 한도(%)보다 넓나(0 = 끔, 표시 반올림 0.05%p 여유). */
export function entryStopTooWide(b: Buy, limit: number): boolean {
  const pct = entryStopPercent(b)
  if (!hasEntryStopLoss(b) || limit <= 0 || pct === null) return false
  return pct < -limit - 0.05
}

// MARK: 매도

/** 매도금액(원, 수수료 제외). */
export const sellAmountKRW = (s: RatedSell): number => s.quantity * s.unitPrice * s.rate
/** 수수료·거래세 뺀 매도대금(거래 통화). */
export const sellNetNative = (s: Sell): number => s.quantity * s.unitPrice - s.fee - s.tax
/** 수수료·거래세(원). */
export const sellFeeKRW = (s: RatedSell): number => (s.fee + s.tax) * s.rate

/** 이 매도로 들어온 예수금(수수료·거래세 차감 후) — 달러 종목은 달러 예수금으로. */
export function sellCashInflow(s: RatedSell): CurrencyPair {
  return isForeign(s) ? { krw: 0, usd: sellNetNative(s) } : { krw: sellNetNative(s) * s.rate, usd: 0 }
}

// MARK: 예수금

/** 증가 = 빨강 · 감소 = 파랑 판정. 환전은 총액이 그대로라 유입이 아니다. */
export const increasesCash = (type: CashTxType): boolean => type === 'deposit' || type === 'dividend'

/** 예수금 기록 하나가 원화·달러 예수금을 얼마나 바꾸는지 — 저장된 기록과 입력 미리보기가 같은 규칙을 쓴다. */
export function cashDeltaOf(
  type: CashTxType,
  amount: number,
  foreignAmount: number,
  direction: ExchangeDirection | null,
  currency: Currency,
): CurrencyPair {
  if (type === 'exchange') {
    if (direction === 'krwToUsd') return { krw: -amount, usd: foreignAmount }
    if (direction === 'usdToKrw') return { krw: amount, usd: -foreignAmount }
    return { krw: 0, usd: 0 }
  }
  const signed = increasesCash(type) ? amount : -amount
  return currency === 'USD' ? { krw: 0, usd: signed } : { krw: signed, usd: 0 }
}

export const cashDelta = (tx: CashTx): CurrencyPair =>
  cashDeltaOf(tx.type, tx.amount, tx.foreignAmount, tx.direction, tx.currency)

/** 환전의 환율(원/$) — 두 금액으로 계산. 환전이 아니거나 금액이 0이면 null. */
export function impliedExchangeRate(tx: CashTx): number | null {
  if (tx.type !== 'exchange' || tx.foreignAmount <= 0 || tx.amount <= 0) return null
  return tx.amount / tx.foreignAmount
}
