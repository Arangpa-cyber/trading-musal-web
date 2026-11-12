// iOS 앱 백업(JSON) 가져오기 — 옛 형식을 웹 형식으로 바꾸고, 옛 데이터 보정을 여기서 한 번만 한다.
// - 원화 정본 가격(가격 × 환율)을 거래 통화 원래 값으로 되돌린다(설계 결정 1).
// - 옛 "자동 환전" 달러 매수 → 환전 1건 + 달러 매수 1건, 대금이 원화로 들어온 옛 달러 매도 → 달러 매도 + 달러→원화 환전 1건.
// - 갈린 자산명 맞추기 → 겹친 다 판 거래 합치기 → 같은 종목 보유 포지션 합치기 → 다 판 포지션 마지막 매도 보정.
// 옛 호환 필드(krwAmount·autoExchange·usdFromBalance·exchangeRate 등)는 웹 데이터에 남기지 않는다(설계 결정 3).
import {
  backfillClosedSells,
  mergeDuplicateOpenPositions,
  mergeOverlappingClosedPositions,
  syncAssetNames,
} from './maintenance'
import {
  DEFAULT_SETTINGS,
  SELL_REASONS,
  SELL_REASON_LABEL,
  type Buy,
  type BuyReason,
  type CashTx,
  type CashTxType,
  type Currency,
  type ExchangeDirection,
  type JournalContext,
  type JournalData,
  type JournalEntry,
  type RiskMode,
  type Sell,
  type SellReason,
} from './types'

export interface ImportReport {
  buys: number
  sells: number
  cash: number
  journals: number
  /** 옛 자동 환전 매수를 나눠 만든 환전 기록 수 */
  splitAutoExchangeBuys: number
  /** 대금이 원화로 들어온 옛 달러 매도를 나눠 만든 환전 기록 수 */
  splitAutoExchangeSells: number
  syncedNames: number
  mergedClosed: number
  mergedOpen: number
  backfilledSells: number
  /** 그대로 옮기지 못해 확인이 필요한 것 */
  warnings: string[]
}

export class BackupFormatError extends Error {}

type Json = Record<string, unknown>

const num = (o: Json, key: string, fallback = 0): number => {
  const v = o[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
const str = (o: Json, key: string, fallback = ''): string => {
  const v = o[key]
  return typeof v === 'string' ? v : fallback
}
const bool = (o: Json, key: string, fallback: boolean): boolean => {
  const v = o[key]
  return typeof v === 'boolean' ? v : fallback
}
function date(o: Json, key: string): number {
  const v = o[key]
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  if (Number.isNaN(t)) throw new BackupFormatError(`날짜를 읽을 수 없어요 (${key})`)
  return t
}
function optDate(o: Json, key: string): number | null {
  const v = o[key]
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}
function list(o: Json, key: string, required: boolean): Json[] {
  const v = o[key]
  if (Array.isArray(v)) return v.filter((x): x is Json => typeof x === 'object' && x !== null)
  if (required) throw new BackupFormatError(`백업 파일에 ${key} 항목이 없어요`)
  return []
}
const lowerId = (o: Json, key = 'id'): string => {
  const v = str(o, key)
  if (!v) throw new BackupFormatError(`ID가 없는 기록이 있어요 (${key})`)
  return v.toLowerCase()
}
const currencyOf = (o: Json): Currency => (str(o, 'currency', 'KRW') === 'USD' ? 'USD' : 'KRW')

const CASH_TYPES: Record<string, CashTxType> = {
  입금: 'deposit',
  출금: 'withdrawal',
  '배당·이자 수익': 'dividend',
  '수수료 지출': 'feeExpense',
  환전: 'exchange',
}
const DIRECTIONS: Record<string, ExchangeDirection> = { '원→달러': 'krwToUsd', '달러→원': 'usdToKrw' }
const RISK_MODES: Record<string, RiskMode> = { '총자산 기준': 'totalAssets', '수익쿠션 기준': 'profitCushion' }
const BUY_REASONS: Record<string, BuyReason> = { '돌파 매수': 'breakout', '눌림목 매수': 'pullback' }
const SELL_REASON_BY_LABEL = Object.fromEntries(SELL_REASONS.map((r) => [SELL_REASON_LABEL[r], r])) as Record<string, SellReason>
const CONTEXTS: Record<string, JournalContext> = { 매수: 'buy', 보유: 'holding', 보유중: 'holding', 매도: 'sell' }

/** iOS 백업인지 — 매수·매도·예수금 목록 키가 있다. */
export function looksLikeIosBackup(obj: unknown): boolean {
  return typeof obj === 'object' && obj !== null && 'buys' in obj && 'sells' in obj && 'cashTransactions' in obj
}

export function importIosBackup(obj: unknown): { data: JournalData; report: ImportReport } {
  if (!looksLikeIosBackup(obj)) throw new BackupFormatError('트레이딩:무살 백업 파일이 아니에요')
  const root = obj as Json
  list(root, 'profiles', true)
  const report: ImportReport = {
    buys: 0, sells: 0, cash: 0, journals: 0, splitAutoExchangeBuys: 0, splitAutoExchangeSells: 0,
    syncedNames: 0, mergedClosed: 0, mergedOpen: 0, backfilledSells: 0, warnings: [],
  }

  const cash: CashTx[] = list(root, 'cashTransactions', true).map((o) => ({
    id: lowerId(o),
    date: date(o, 'date'),
    type: CASH_TYPES[str(o, 'type')] ?? 'deposit',
    amount: num(o, 'amount'),
    memo: str(o, 'memo'),
    currency: currencyOf(o),
    foreignAmount: num(o, 'foreignAmount'),
    direction: DIRECTIONS[str(o, 'exchangeDirection')] ?? null,
  }))

  const buys: Buy[] = list(root, 'buys', true).map((o) => {
    const currency = currencyOf(o)
    const rate = currency === 'USD' ? num(o, 'exchangeRate', 1) || 1 : 1
    const native = (key: string) => num(o, key) / rate
    const buy: Buy = {
      id: lowerId(o),
      tradeId: str(o, 'tradeID'),
      date: date(o, 'date'),
      assetName: str(o, 'assetName'),
      quantity: num(o, 'quantity'),
      unitPrice: native('unitPrice'),
      buyReason: BUY_REASONS[str(o, 'buyReason')] ?? 'breakout',
      targetEntryPrice: native('targetEntryPrice'),
      riskMode: RISK_MODES[str(o, 'riskMode')] ?? 'totalAssets',
      riskPercent: num(o, 'riskPercent'),
      plannedRiskAmount: num(o, 'plannedRiskAmount'),
      stopLossPrice: native('stopLossPrice'),
      initialStopLossPrice: native('initialStopLossPrice'),
      totalAssetsAtEntry: num(o, 'totalAssetsAtEntry'),
      markPrice: num(o, 'markPrice'),
      markDate: optDate(o, 'markDate'),
      currency,
      fee: native('fee'),
      tax: native('tax'),
      fallbackRate: rate,
    }
    // 옛 자동 환전 달러 매수(원화 예수금에서 바로 환전해 산 것) → 환전 1건 + 달러 예수금 매수.
    // 환전 원화 = 예전 원화 차감액, 환전 달러 = 이제 달러 예수금에서 빠질 금액 − 예전 달러 차감액(잔액 사용분).
    // 필드가 없는 옛 백업의 달러 매수도 자동 환전(true)으로 본다.
    if (currency === 'USD' && bool(o, 'autoExchange', true)) {
      const krwAmount = typeof o.krwAmount === 'number' ? o.krwAmount : null
      const usdFromBalance = num(o, 'usdFromBalance')
      const totalKRW = num(o, 'quantity') * num(o, 'unitPrice')
      const krwCost = (krwAmount !== null ? krwAmount + usdFromBalance * rate : totalKRW + num(o, 'fee')) + num(o, 'tax')
      const oldKRW = krwCost - usdFromBalance * rate
      const exchangedUSD = (totalKRW + num(o, 'fee') + num(o, 'tax')) / rate - usdFromBalance
      if (oldKRW > 0 && exchangedUSD > 0) {
        cash.push({
          id: crypto.randomUUID(),
          date: buy.date,
          type: 'exchange',
          amount: oldKRW,
          memo: `${buy.assetName} 매수 시 환전`,
          currency: 'KRW',
          foreignAmount: exchangedUSD,
          direction: 'krwToUsd',
        })
        report.splitAutoExchangeBuys++
      } else {
        report.warnings.push(`${buy.assetName} 달러 매수(옛 자동 환전)의 환전 금액을 알 수 없어 달러 예수금 매수로만 옮겼어요`)
      }
    }
    return buy
  })

  const sells: Sell[] = list(root, 'sells', true).map((o) => {
    const currency = currencyOf(o)
    const rate = currency === 'USD' ? num(o, 'exchangeRate', 1) || 1 : 1
    const raw = str(o, 'sellReason')
    const parts = raw.split(',').filter((p) => p !== '')
    const known = parts.every((p) => p in SELL_REASON_BY_LABEL)
    const sell: Sell = {
      id: lowerId(o),
      tradeId: str(o, 'tradeID'),
      date: date(o, 'date'),
      assetName: str(o, 'assetName'),
      quantity: num(o, 'quantity'),
      unitPrice: num(o, 'unitPrice') / rate,
      sellReasons: known && parts.length ? SELL_REASONS.filter((r) => parts.includes(SELL_REASON_LABEL[r])) : [],
      legacyReason: known && parts.length ? '' : raw,
      reasonNote: str(o, 'reason'),
      currency,
      fee: num(o, 'fee') / rate,
      tax: num(o, 'tax') / rate,
      stopLossAtSell: num(o, 'stopLossAtSell'),
      soldBuyIds: str(o, 'soldBuyIDs').split(',').filter((x) => x !== '').map((x) => x.toLowerCase()),
    }
    // 대금이 원화로 들어온 옛 달러 매도 → 달러 매도 + 같은 시각 달러→원화 환전(그때 받은 원화 그대로).
    if (currency === 'USD' && bool(o, 'autoExchange', true)) {
      const netUSD = sell.quantity * sell.unitPrice - sell.fee - sell.tax
      if (netUSD > 0) {
        cash.push({
          id: crypto.randomUUID(),
          date: sell.date,
          type: 'exchange',
          amount: netUSD * rate,
          memo: `${sell.assetName} 매도 대금 환전`,
          currency: 'KRW',
          foreignAmount: netUSD,
          direction: 'usdToKrw',
        })
        report.splitAutoExchangeSells++
      }
    }
    return sell
  })

  const journals: JournalEntry[] = list(root, 'journals', false).map((o) => ({
    id: lowerId(o),
    tradeId: str(o, 'tradeID'),
    assetName: str(o, 'assetName'),
    date: date(o, 'date'),
    text: str(o, 'text'),
    context: CONTEXTS[str(o, 'context')] ?? 'holding',
  }))

  const profiles = list(root, 'profiles', true)
  const p = profiles[0]
  const profile = p
    ? { nickname: str(p, 'nickname'), tradingRules: str(p, 'tradingRules'), createdAt: optDate(p, 'createdAt') ?? Date.now() }
    : null

  // 설정 — 옛 백업에 없는 값은 기본값.
  const opt = (key: string): number | null => (typeof root[key] === 'number' ? (root[key] as number) : null)
  const settings = {
    ...DEFAULT_SETTINGS,
    homeCardOrder: typeof root.homeCardOrder === 'string' ? root.homeCardOrder : null,
    manualFxRate: opt('manualFxRate') ?? 0,
    manualFxRateDate: (opt('manualFxRateDate') ?? 0) * 1000,
    defaultRiskPercent: opt('defaultRiskPercent') ?? DEFAULT_SETTINGS.defaultRiskPercent,
    defaultStopLossPercent: opt('defaultStopLossPercent') ?? DEFAULT_SETTINGS.defaultStopLossPercent,
    maxWeightPercent: opt('maxWeightPercent') ?? DEFAULT_SETTINGS.maxWeightPercent,
    maxStopLossPercent: opt('maxStopLossPercent') ?? DEFAULT_SETTINGS.maxStopLossPercent,
    feeRateKRW: opt('feeRateKRW') ?? DEFAULT_SETTINGS.feeRateKRW,
    feeRateUSD: opt('feeRateUSD') ?? DEFAULT_SETTINGS.feeRateUSD,
  }

  // 옛 데이터 보정 — iOS 앱 시작·복원 때와 같은 순서.
  report.syncedNames = syncAssetNames(buys, sells, journals)
  report.mergedClosed = mergeOverlappingClosedPositions(buys, sells, journals)
  report.mergedOpen = mergeDuplicateOpenPositions(buys, sells, journals)
  report.backfilledSells = backfillClosedSells(buys, sells)

  report.buys = buys.length
  report.sells = sells.length
  report.cash = cash.length
  report.journals = journals.length
  return { data: { buys, sells, cash, journals, profile, settings }, report }
}
