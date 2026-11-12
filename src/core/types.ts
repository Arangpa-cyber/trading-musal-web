// 저장되는 기록(웹 DB·백업 공통). 가격·수수료는 모두 **거래 통화 원래 값**(원화 종목 = 원, 달러 종목 = $)으로 저장한다.
// 원화 금액은 저장하지 않고 달러 장부(`fx.ts` `resolveRates`)가 정한 환율로 그때그때 계산한다 —
// iOS 앱의 "원화 정본 저장 + normalize/rescale로 다시 쓰기" 구조를 없앤 것(설계 결정 1).

export type Currency = 'KRW' | 'USD'

/** 리스크 금액 산정 기준 — 총자산×리스크율, 또는 피라미딩 전용 수익쿠션(손절가 기준 확보이익). */
export type RiskMode = 'totalAssets' | 'profitCushion'
export const RISK_MODE_LABEL: Record<RiskMode, string> = {
  totalAssets: '총자산 기준',
  profitCushion: '수익쿠션 기준',
}

export type BuyReason = 'breakout' | 'pullback'
export const BUY_REASON_LABEL: Record<BuyReason, string> = {
  breakout: '돌파 매수',
  pullback: '눌림목 매수',
}

/** 매도 이유 — 여러 개를 같이 고른다. 배열 순서는 항상 이 선언 순서. */
export const SELL_REASONS = ['stopLossHit', 'rangeBreakdown', 'maBreakdown', 'strengthSell'] as const
export type SellReason = (typeof SELL_REASONS)[number]
export const SELL_REASON_LABEL: Record<SellReason, string> = {
  stopLossHit: '손절가 도달',
  rangeBreakdown: '박스권 이탈',
  maBreakdown: '이평선 이탈',
  strengthSell: '강세 매도',
}

/**
 * 예수금 기록 종류. 배당·이자·수수료는 현금은 변하지만 순입금액엔 안 잡힌다(TWR·누적손익 왜곡 방지).
 * `feeExpense`는 입력 화면에서 고를 수 없고 옛 기록(iOS에서 가져온 것)에만 있다.
 * 환전은 계좌 안에서 원화↔달러 형태만 바뀌는 것이라 입출금이 아니다.
 */
export type CashTxType = 'deposit' | 'withdrawal' | 'dividend' | 'feeExpense' | 'exchange'
export const CASH_TX_LABEL: Record<CashTxType, string> = {
  deposit: '입금',
  withdrawal: '출금',
  dividend: '배당·이자',
  feeExpense: '수수료',
  exchange: '환전',
}

export type ExchangeDirection = 'krwToUsd' | 'usdToKrw'

/** 메모를 연 위치(매수 기록·보유자산·매도 기록) — 작성 화면에서 고르지 않는다. */
export type JournalContext = 'buy' | 'holding' | 'sell'
export const JOURNAL_CONTEXT_LABEL: Record<JournalContext, string> = {
  buy: '매수',
  holding: '보유',
  sell: '매도',
}

/** 날짜·시각은 모두 epoch 밀리초. */
export type Millis = number

/** 매수 기록 — 분할매수도 평균단가·총수량 한 건으로 압축 저장한다. */
export interface Buy {
  id: string
  /** 포지션(거래) 식별자 — 매도·메모와 연결되는 키. */
  tradeId: string
  date: Millis
  assetName: string
  quantity: number
  /** 평균 체결 단가(거래 통화). */
  unitPrice: number
  buyReason: BuyReason
  /** 매매계획 — 목표 매수가(거래 통화). */
  targetEntryPrice: number
  riskMode: RiskMode
  /** 진입 시 리스크율(%). */
  riskPercent: number
  /** 진입 시 허용손실(원). */
  plannedRiskAmount: number
  /** 현재 손절가(거래 통화) — 포지션의 모든 매수 기록이 같은 값. */
  stopLossPrice: number
  /** 진입 시 손절가(거래 통화). 0 = 모름(iOS에서 이 값이 생기기 전 기록) → 현재 손절가로 대신. */
  initialStopLossPrice: number
  /** 매수 시점 총자산(원) — 리스크율·계좌기여율의 고정 분모. */
  totalAssetsAtEntry: number
  /** 현재가(거래 통화, 0 = 기록 없음)와 기록 시각 — 화면 참고용, 총자산·경지엔 미반영. */
  markPrice: number
  markDate: Millis | null
  currency: Currency
  /** 수수료·제세금(거래 통화). 현금·누적 수수료에만 반영, 거래 손익은 gross. */
  fee: number
  tax: number
  /** 달러 매수의 대체 환율(원/$) — 그 시점 달러 예수금이 없어 평균 매입 환율을 모를 때만 쓴다. 원화 종목은 1. */
  fallbackRate: number
}

/** 매도 기록 — 매수 기록(N-n) 단위로만 판다. */
export interface Sell {
  id: string
  tradeId: string
  date: Millis
  assetName: string
  quantity: number
  /** 매도 단가(거래 통화). */
  unitPrice: number
  /** 고른 매도 이유(선언 순서). 옛 기록이면 빈 배열이고 `legacyReason`에 글자가 남는다. */
  sellReasons: SellReason[]
  /** iOS 옛 매도 이유 글자("목표가 도달"·"직접 입력") — 새 기록은 "". */
  legacyReason: string
  /** iOS 옛 "직접 입력" 매도의 사유 글 — 새 기록은 "". */
  reasonNote: string
  currency: Currency
  fee: number
  tax: number
  /** 매도 시점 손절가(거래 통화). 0 = 모름 → 지금 손절가로 대신. */
  stopLossAtSell: number
  /** 이 매도로 판 매수 기록 ID. 빈 배열 = 판 매수 정보가 없는 옛 기록(수량만 안다). */
  soldBuyIds: string[]
}

/** 예수금 기록. 입금·출금은 원화만, 배당은 원화/달러. 환전은 amount = 원화, foreignAmount = 달러. */
export interface CashTx {
  id: string
  date: Millis
  type: CashTxType
  amount: number
  memo: string
  currency: Currency
  foreignAmount: number
  direction: ExchangeDirection | null
}

/** 복기 메모 — tradeId로 거래와 연결. */
export interface JournalEntry {
  id: string
  tradeId: string
  assetName: string
  date: Millis
  text: string
  context: JournalContext
}

export interface Profile {
  nickname: string
  /** 원칙(개인 매매 규칙) 글. */
  tradingRules: string
  createdAt: Millis
}

/** 설정 — 백업에 포함된다(블라인드 모드는 기기별이라 제외). */
export interface Settings {
  /** 현황 카드 순서(쉼표로 이은 카드 키) — null이면 기본 순서. */
  homeCardOrder: string | null
  /** 설정 환율 수동값(0 = 없음)과 입력 시각. */
  manualFxRate: number
  manualFxRateDate: Millis
  defaultRiskPercent: number
  /** 기본 손절률(%), 0 = 없음. */
  defaultStopLossPercent: number
  /** 경고 기준(%), 0 = 끔. */
  maxWeightPercent: number
  maxStopLossPercent: number
  /** 매수 수수료율(%) — 국내·해외. */
  feeRateKRW: number
  feeRateUSD: number
}

export const DEFAULT_SETTINGS: Settings = {
  homeCardOrder: null,
  manualFxRate: 0,
  manualFxRateDate: 0,
  defaultRiskPercent: 0.5,
  defaultStopLossPercent: 0,
  maxWeightPercent: 25,
  maxStopLossPercent: 10,
  feeRateKRW: 0.015,
  feeRateUSD: 0.1,
}

/** 한 사용자의 전체 데이터. */
export interface JournalData {
  buys: Buy[]
  sells: Sell[]
  cash: CashTx[]
  journals: JournalEntry[]
  profile: Profile | null
  settings: Settings
}

/** 매도 이유 글 — "손절가 도달 · 이평선 이탈", 옛 기록은 저장된 글자 그대로("목표가 도달" 등). */
export function sellReasonText(sell: Pick<Sell, 'sellReasons' | 'legacyReason'>): string {
  const list = SELL_REASONS.filter((r) => sell.sellReasons.includes(r))
  if (list.length > 0) return list.map((r) => SELL_REASON_LABEL[r]).join(' · ')
  return sell.legacyReason === '' ? '-' : sell.legacyReason
}

/** 고른 매도 이유를 선언 순서로 정리(중복 제거). */
export function orderSellReasons(reasons: Iterable<SellReason>): SellReason[] {
  const set = new Set(reasons)
  return SELL_REASONS.filter((r) => set.has(r))
}
