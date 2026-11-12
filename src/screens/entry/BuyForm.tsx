// 매수 입력 — 리스크 설정 → 자산명 → 통화 → 매수 이유 → 매매계획 → 분할매수 계산기 → 예수금 → 제세금 → 저장.
// "얼마 잃을지 먼저 정하고 종목을 본다"는 순서. 가격은 거래 통화(달러면 $)로 받고, 원가 환율은 달러 장부가 정한다.
import { BookOpen, Calculator, CircleDollarSign, Receipt, Shield, Tag, Target, Wallet, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  BUY_REASON_LABEL,
  feeFor,
  lockedRiskPercent,
  UsdBook,
  type Buy,
  type BuyReason,
  type CashTx,
  type Currency,
  type RiskMode,
} from '../../core'
import { useJournal } from '../../state/journal'
import {
  CashChangeBox,
  FieldRow,
  FillButton,
  FormRow,
  FormSection,
  NumberField,
  parseNum,
  positive,
  SaveFooter,
  Segmented,
  SummaryBox,
  TextField,
  Toggle,
} from '../../ui/form'
import { dollar, price, rate as rateText, won, wonCompact, type Tone } from '../../ui/format'
import { useBlind } from '../../ui/hooks'
import { useDraft } from './draft'
import type { EntryFormProps } from './EntrySheet'

interface Tranche {
  id: string
  price: string
  quantity: string
  fee: string
}
const newTranche = (): Tranche => ({ id: crypto.randomUUID(), price: '', quantity: '', fee: '' })

/** 리스크율이 이 값을 넘으면 주황 경고. */
const RISK_WARNING_PERCENT = 2
const PNL_AT_STOP = '손절 시 전체 손익'
const ACTUAL_RISK = '실제 리스크'

/** 입력칸 숫자 표기 — 0.5 → "0.5", 7 → "7". */
const plain = (v: number) => String(Number(v.toFixed(4)))

export function BuyForm({ date, pyramidPositionId, onDirty, onCurrency, save, busy }: EntryFormProps & { pyramidPositionId?: string }) {
  const { snapshot, data } = useJournal()
  const [blind] = useBlind()
  const settings = data.settings
  const open = snapshot.openPositions
  const cash = snapshot.cash

  const pyramid = open.find((p) => p.id === pyramidPositionId)
  // 피라미딩으로 열면 손절가 = 지금 손절가, 목표 매수가 = 기록된 현재가로 채운다(손절률은 두 값에서 자동).
  const cushionPlan = (id: string) => {
    const p = open.find((x) => x.id === id)
    const fmt = (v: number) => (p?.isForeign ? v.toFixed(2) : String(Math.round(v)))
    return { stop: p?.nativeStopLoss != null ? fmt(p.nativeStopLoss) : '', entry: p?.mark ? fmt(p.mark.price) : '' }
  }

  const [riskMode, setRiskMode] = useState<RiskMode>(pyramid ? 'profitCushion' : 'totalAssets')
  const [riskPercent, setRiskPercent] = useState(plain(settings.defaultRiskPercent))
  const [cushionId, setCushionId] = useState(pyramid?.id ?? '')
  const [cushionUsage, setCushionUsage] = useState(1)
  const [assetName, setAssetName] = useState('')
  const [currency, setCurrency] = useState<Currency>('KRW')
  const [buyReason, setBuyReason] = useState<BuyReason>('breakout')
  const [entryText, setEntryText] = useState(() => (pyramid ? cushionPlan(pyramid.id).entry : ''))
  const [stopText, setStopText] = useState(() => (pyramid ? cushionPlan(pyramid.id).stop : ''))
  const [pctText, setPctText] = useState('')
  const [tranches, setTranches] = useState<Tranche[]>(() => [newTranche()])
  const [exchangeWithBuy, setExchangeWithBuy] = useState(false)
  const [exKrw, setExKrw] = useState('')
  const [exUsd, setExUsd] = useState('')
  const [tax, setTax] = useState('')

  const { dirty, rebase } = useDraft({
    riskPercent, assetName, entryText, stopText, pctText,
    tranches: tranches.map((t) => `${t.price}|${t.quantity}|${t.fee}`).join(','),
    exKrw, exUsd, tax,
  })
  useEffect(() => onDirty(dirty), [dirty, onDirty])

  const cushionPos = open.find((p) => p.id === cushionId) ?? null
  const isCushion = riskMode === 'profitCushion'
  const effCurrency: Currency = isCushion ? (cushionPos?.currency ?? 'KRW') : currency
  const isForeign = effCurrency !== 'KRW'
  useEffect(() => onCurrency(effCurrency), [effCurrency, onCurrency])
  const unit = isForeign ? '$' : '원'
  const fmtField = (v: number) => (isForeign ? v.toFixed(2) : String(Math.round(v)))

  // 원가 환율 — 달러 평균 매입 환율(같이 기록할 환전 반영). 달러 잔액이 없으면 설정 환율. 저장 후 장부가 정확히 다시 맞춘다.
  const book = new UsdBook()
  book.usd = cash.usd
  book.krw = cash.usdBookKRW
  const exRateKrw = exchangeWithBuy ? positive(exKrw) : null
  const exRateUsd = exchangeWithBuy ? positive(exUsd) : null
  if (exRateKrw !== null && exRateUsd !== null) book.deposit(exRateUsd, exRateKrw)
  const bookRate = book.averageRate ?? snapshot.fxRate?.rate ?? null
  const fxRate = isForeign ? (bookRate ?? 0) : 1

  // 리스크
  const lock = lockedRiskPercent(snapshot.grading.juhwaipma)
  const entered = parseNum(riskPercent) ?? 0
  const effRisk = lock !== null ? Math.min(entered, lock) : entered
  const name = assetName.trim()
  // 같은 종목 = 항상 한 포지션 — 같은 이름·통화로 보유 중이면 거기에 합쳐진다(같은 게 여럿이면 먼저 산 쪽).
  const joinTarget =
    !isCushion && name
      ? [...open]
          .filter((p) => p.assetName.trim() === name && p.currency === currency)
          .sort((a, b) => (a.firstBuyDate ?? 0) - (b.firstBuyDate ?? 0))[0] ?? null
      : null

  // 매매계획 3값 — 둘을 채우면 나머지가 계산된다(계산값은 칸에 회색으로 보인다).
  const entryIn = parseNum(entryText)
  const stopIn = parseNum(stopText)
  const pctIn = parseNum(pctText)
  // 기본 손절률 — 총자산 기준에서 손절률·손절가를 둘 다 안 적었을 때만 쓰는 대체값.
  const fallbackPct = !isCushion && settings.defaultStopLossPercent > 0 && pctIn === null && stopIn === null ? settings.defaultStopLossPercent : null
  const derivedEntry = entryIn === null && stopIn !== null && pctIn !== null && 1 - pctIn / 100 > 0 ? stopIn / (1 - pctIn / 100) : null
  const pctForStop = pctIn ?? fallbackPct
  const derivedStop = stopIn === null && entryIn !== null && pctForStop !== null && entryIn * (1 - pctForStop / 100) > 0 ? entryIn * (1 - pctForStop / 100) : null
  const derivedPct = pctIn === null && entryIn !== null && stopIn !== null && entryIn > 0 && entryIn - stopIn > 0 ? ((entryIn - stopIn) / entryIn) * 100 : null
  const entry = entryIn ?? derivedEntry
  const stop = stopIn ?? derivedStop

  // 수익쿠션 = 새 손절가 기준 확보이익(같은 자산명 보유 전체, 현재가 기준 아님).
  const cushionLots = cushionPos ? open.filter((p) => p.assetName === cushionPos.assetName) : []
  const secured = isCushion && cushionLots.length && stop !== null ? cushionLots.reduce((a, p) => a + p.liquidationProfit(stop, fxRate), 0) : null
  const cushionDepleted = (secured ?? 1) <= 0
  const riskAmount = isCushion ? Math.max(secured ?? 0, 0) * cushionUsage : (snapshot.totalAssets * effRisk) / 100
  const riskAmountText = isCushion && secured === null ? '-' : wonCompact(riskAmount)

  const perShare = entry !== null && stop !== null && entry - stop > 0 ? entry - stop : null
  const recommended = perShare !== null && riskAmount > 0 && fxRate > 0 ? Math.floor(riskAmount / (perShare * fxRate)) || null : null
  const plannedAmount = recommended !== null && entry !== null ? recommended * entry * fxRate : null
  const pnlAtStop = (qty: number, at: number, rate: number) => (isCushion && secured !== null && stop !== null && qty > 0 ? secured - (at - stop) * qty * rate : null)
  const weight = (krw: number | null) => (krw === null || snapshot.totalAssets <= 0 ? '-' : `${((krw / snapshot.totalAssets) * 100).toFixed(1)}%`)
  const signedCompact = (v: number) => (v >= 0 ? '+' : '') + wonCompact(v)
  const pnlText = (v: number | null) => (v === null ? '-' : blind ? '•••' : signedCompact(v))

  // 분할매수 계산기
  const feeRate = isForeign ? settings.feeRateUSD : settings.feeRateKRW
  const autoFee = (t: Tranche) => {
    const p = positive(t.price)
    const q = Math.trunc(parseNum(t.quantity) ?? 0)
    return p !== null && q > 0 ? feeFor(p * q, feeRate, effCurrency) : null
  }
  const filled = tranches.filter((t) => positive(t.price) !== null && Math.trunc(parseNum(t.quantity) ?? 0) > 0)
  const totalQty = filled.reduce((a, t) => a + Math.trunc(parseNum(t.quantity) ?? 0), 0)
  const totalFill = filled.reduce((a, t) => a + (positive(t.price) ?? 0) * Math.trunc(parseNum(t.quantity) ?? 0), 0)
  const totalFee = filled.reduce((a, t) => a + (parseNum(t.fee) ?? autoFee(t) ?? 0), 0)
  const avgPrice = totalQty > 0 ? totalFill / totalQty : null
  const fillRate = isForeign ? bookRate : 1
  const actualAmount = totalQty > 0 && fillRate !== null ? (totalFill + totalFee) * fillRate : null
  const actualRisk = avgPrice !== null && stop !== null && totalQty > 0 && fillRate !== null ? (Math.max(avgPrice - stop, 0) * totalQty + (isForeign ? totalFee : 0)) * fillRate : null
  const actualRiskExceeded = actualRisk !== null && riskAmountText !== '-' && actualRisk > riskAmount + 1
  const actualPnlAtStop = avgPrice === null ? null : pnlAtStop(totalQty, avgPrice, fillRate ?? fxRate)
  const taxValue = parseNum(tax) ?? 0
  const needed = totalQty > 0 ? totalFill + totalFee + taxValue : 0
  const usdShort = Math.max(needed - cash.usd, 0)

  const blockReasons: string[] = []
  if (!(isCushion ? cushionPos?.assetName ?? '' : name)) blockReasons.push(isCushion ? '추가매수 대상 포지션을 선택하세요' : '자산명을 입력하세요')
  if (entry !== null && stop !== null) {
    if (stop >= entry) blockReasons.push('손절가가 목표 매수가보다 낮아야 해요')
  } else blockReasons.push('매매계획의 목표 매수가·손절가를 채우세요')
  if (totalQty <= 0) blockReasons.push('분할매수 계산기에 체결 가격·수량을 입력하세요')
  if (isForeign && totalQty > 0 && fillRate === null) blockReasons.push('달러 원가 환율을 알 수 없어요 — 환전을 같이 기록하거나 설정에서 환율을 입력하세요')
  if (isForeign && exchangeWithBuy && (exRateKrw === null || exRateUsd === null)) blockReasons.push('같이 기록할 환전의 보낸 원화·받은 달러를 입력하세요(환전 안 했으면 끄세요)')

  // 자산명 자동완성 — 과거 매수 자산명. 고르면 그때 쓴 통화도 따라온다.
  const knownAssets = [...new Set(data.buys.map((b) => b.assetName))].sort()
  function changeAsset(v: string) {
    setAssetName(v)
    const last = data.buys.filter((b) => b.assetName === v).sort((a, b) => b.date - a.date)[0]
    if (last) setCurrency(last.currency)
  }

  function chooseCushion(id: string) {
    setCushionId(id)
    const plan = cushionPlan(id)
    setStopText(plan.stop)
    setEntryText(plan.entry)
    setPctText('')
    rebase({ stopText: plan.stop, entryText: plan.entry, pctText: '' }) // 자동으로 채운 칸은 "작성 중"이 아니다
  }

  function submit() {
    if (blockReasons.length || entry === null || stop === null || avgPrice === null || fillRate === null) return
    const target = isCushion ? cushionPos : joinTarget
    const tradeId = target?.id ?? crypto.randomUUID()
    // 피라미딩·같은 종목 합치기 — 기존 매수 손절가를 새 손절가로 올린다(올리기만).
    const raised: Buy[] = target
      ? data.buys.filter((b) => b.tradeId === target.id && b.stopLossPrice < stop - 1e-6).map((b) => ({ ...b, stopLossPrice: stop }))
      : []
    const record: Buy = {
      id: crypto.randomUUID(),
      tradeId,
      date,
      assetName: joinTarget?.assetName ?? (isCushion ? cushionPos!.assetName : name),
      quantity: totalQty,
      unitPrice: avgPrice,
      buyReason,
      targetEntryPrice: entry,
      riskMode,
      riskPercent: effRisk, // 주화입마 잠금이면 상한으로 클램프된 값
      plannedRiskAmount: riskAmount,
      stopLossPrice: stop,
      initialStopLossPrice: stop,
      totalAssetsAtEntry: snapshot.totalAssets,
      markPrice: 0,
      markDate: null,
      currency: effCurrency,
      fee: totalFee,
      tax: taxValue,
      fallbackRate: isForeign ? fillRate : 1,
    }
    // "환전도 같이 기록" — 예수금 환전과 똑같은 기록을 따로 남긴다.
    const exchanges: CashTx[] =
      isForeign && exRateKrw !== null && exRateUsd !== null
        ? [{ id: crypto.randomUUID(), date, type: 'exchange', amount: exRateKrw, memo: `${record.assetName} 매수 시 환전`, currency: 'KRW', foreignAmount: exRateUsd, direction: 'krwToUsd' }]
        : []
    save({ cash: exchanges, buys: [...raised, record] })
  }

  const planItems: [string, string][] = [['추천 매수 수량', recommended !== null ? `${recommended}주` : '-']]
  const plannedPnl = recommended !== null && entry !== null ? pnlAtStop(recommended, entry, fxRate) : null
  if (isCushion) planItems.push([PNL_AT_STOP, pnlText(plannedPnl)])
  planItems.push(['총 매수금액', plannedAmount !== null ? wonCompact(plannedAmount) : '-'], ['비중', weight(plannedAmount)])

  const calcItems: [string, string][] = [
    ['총 수량', totalQty > 0 ? `${totalQty}주` : '-'],
    ['평균 단가', avgPrice !== null ? price(avgPrice, effCurrency) : '-'],
    ['총 체결금액', totalQty > 0 ? (blind ? '•••' : price(totalFill, effCurrency)) : '-'],
    ['총 수수료', totalFee > 0 ? price(totalFee, effCurrency) : '-'],
  ]
  if (isForeign) calcItems.push(['원가 환율', fillRate !== null ? rateText(fillRate) : '-'])
  calcItems.push(['총자산 대비 비중', weight(actualAmount)], [ACTUAL_RISK, actualRisk !== null ? `${blind ? '•••' : wonCompact(actualRisk)} (허용 ${riskAmountText})` : '-'])
  if (isCushion) calcItems.push([PNL_AT_STOP, pnlText(actualPnlAtStop)])
  const calcTones: Record<string, Tone> = {}
  if (actualRiskExceeded) calcTones[ACTUAL_RISK] = 'orange'
  if (!blind && (actualPnlAtStop ?? 0) < 0) calcTones[PNL_AT_STOP] = 'orange'

  const rateNote = isForeign && (
    <FormRow className="form-note">
      {bookRate !== null ? (
        <span className="muted">가격은 달러($)로 입력해요. 원가·리스크는 달러 평균 매입 환율 {rateText(bookRate)} 기준이에요(갖고 있는 달러로 사니까).</span>
      ) : (
        <span className="tone-orange">달러 예수금도 설정 환율도 없어요. 환전을 먼저(또는 아래에서 같이) 기록하면 리스크·추천 수량이 계산돼요.</span>
      )}
    </FormRow>
  )

  return (
    <>
      <FormSection title="리스크 설정" icon={Shield}>
        <FormRow>
          <Segmented
            options={[{ value: 'totalAssets', label: '총자산 기준' }, { value: 'profitCushion', label: '수익쿠션 기준' }]}
            value={riskMode}
            onChange={setRiskMode}
            label="리스크 기준"
          />
        </FormRow>
        {!isCushion ? (
          <>
            <FieldRow label="현재 총자산">
              <span>{blind ? '•••' : won(snapshot.totalAssets)}</span>
            </FieldRow>
            <FieldRow label="리스크율">
              <NumberField label="리스크율" value={riskPercent} onChange={setRiskPercent} placeholder="리스크율" unit="%" decimal />
            </FieldRow>
            {lock !== null ? (
              <FormRow className="form-note tone-red">주화입마 상태예요. 리스크율이 최대 {lock}%로 제한됩니다 — 초과 입력해도 이 값으로 계산·저장돼요.</FormRow>
            ) : (
              effRisk > RISK_WARNING_PERCENT && <FormRow className="form-note tone-orange">리스크율이 {RISK_WARNING_PERCENT}%를 넘어요. 한 번 손절에 계좌가 크게 줄 수 있어요.</FormRow>
            )}
          </>
        ) : open.length === 0 ? (
          <FormRow className="muted">보유 중인 포지션이 없습니다</FormRow>
        ) : (
          <>
            <FormRow>
              <select className="select-field" aria-label="추가매수 대상 포지션" value={cushionId} onChange={(e) => chooseCushion(e.target.value)}>
                <option value="">추가매수 대상 포지션 선택</option>
                {open.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.assetName} · {p.remainingQuantity}주 · 평단 {price(p.isForeign ? p.nativeAverageBuyPrice : p.averageBuyPrice, p.currency)}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow className="form-note muted">피라미딩은 보유 중인 포지션에 추가매수하는 거라, 새 종목을 입력하는 대신 여기서 골라요.</FormRow>
            {cushionPos && (
              <>
                <FormRow className="form-note muted">
                  지금 손절가 {cushionPos.nativeStopLoss !== null ? price(cushionPos.nativeStopLoss, cushionPos.currency) : '-'} · 평단 {price(cushionPos.nativeAverageBuyPrice, cushionPos.currency)} — 평단 위로 올려야 쿠션이 생겨요.
                </FormRow>
                <FieldRow label="새 손절가">
                  <NumberField label="새 손절가" value={stopText} onChange={setStopText} placeholder={derivedStop !== null ? fmtField(derivedStop) : '새 손절가'} unit={unit} decimal={isForeign} />
                </FieldRow>
                <FormRow>
                  <Segmented options={[{ value: 1, label: '쿠션 100% 걸기' }, { value: 0.5, label: '50%만 걸기' }]} value={cushionUsage} onChange={setCushionUsage} label="쿠션 사용률" />
                </FormRow>
                {secured !== null && secured > 0 && stop !== null && (
                  <FormRow>
                    손절가 {price(stop, effCurrency)}에서 다 팔려도 기존분 {blind ? '•••' : signedCompact(secured)} 남음
                    {cushionUsage < 1 && ` — 그중 ${blind ? '•••' : signedCompact(riskAmount)}만 걸어요`}
                    {recommended !== null ? ` → 추가로 최대 ${recommended}주` : entry === null ? ' → 목표 매수가를 넣으면 추가 수량이 나와요' : ''}
                  </FormRow>
                )}
                {rateNote}
              </>
            )}
          </>
        )}
        <div className="form-row">
          <SummaryBox items={[['허용손실', riskAmountText]]} />
        </div>
        {isCushion && cushionDepleted && <FormRow className="form-note tone-orange">손절가가 평단 이하라 쓸 수 있는 쿠션이 없어요. 총자산 기준을 사용하세요.</FormRow>}
      </FormSection>

      {!isCushion && (
        <>
          <FormSection title="자산명" icon={Tag}>
            <FormRow>
              <TextField value={assetName} onChange={changeAsset} placeholder="예: 삼성전자, 금ETF, 비트코인" list="known-assets" />
              <datalist id="known-assets">
                {knownAssets.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </FormRow>
            {joinTarget && (
              <FormRow className="form-note tone-orange">
                보유 중인 {joinTarget.assetName} 포지션({joinTarget.remainingQuantity}주 · 평단{' '}
                {price(joinTarget.isForeign ? joinTarget.nativeAverageBuyPrice : joinTarget.averageBuyPrice, joinTarget.currency)})에 합쳐져요. 평단·수량이 합산되고, 기존 매수분 손절가는 새 손절가보다 낮으면 올라가요.
              </FormRow>
            )}
          </FormSection>
          <FormSection title="통화" icon={CircleDollarSign}>
            <FormRow>
              <Segmented options={[{ value: 'KRW', label: '원화 ₩' }, { value: 'USD', label: '달러 $' }]} value={currency} onChange={setCurrency} label="통화" />
            </FormRow>
            {rateNote}
          </FormSection>
        </>
      )}

      <FormSection title="매수 이유" icon={BookOpen}>
        <FormRow>
          <Segmented
            options={(Object.keys(BUY_REASON_LABEL) as BuyReason[]).map((r) => ({ value: r, label: BUY_REASON_LABEL[r] }))}
            value={buyReason}
            onChange={setBuyReason}
            label="매수 이유"
          />
        </FormRow>
      </FormSection>

      <FormSection title="매매계획" icon={Target}>
        <FieldRow label="목표 매수가">
          <NumberField label="목표 매수가" value={entryText} onChange={setEntryText} placeholder={derivedEntry !== null ? fmtField(derivedEntry) : '목표 매수가'} unit={unit} decimal={isForeign} />
        </FieldRow>
        {!isCushion && (
          <FieldRow label="손절가">
            <NumberField label="손절가" value={stopText} onChange={setStopText} placeholder={derivedStop !== null ? fmtField(derivedStop) : '손절가'} unit={unit} decimal={isForeign} />
          </FieldRow>
        )}
        <FieldRow label="손절률">
          <NumberField
            label="손절률"
            value={pctText}
            onChange={setPctText}
            placeholder={derivedPct !== null ? plain(Number(derivedPct.toFixed(2))) : fallbackPct !== null ? plain(fallbackPct) : '손절률'}
            unit="%"
            decimal
          />
        </FieldRow>
        {fallbackPct !== null && <FormRow className="form-note muted">설정의 기본 손절률 {plain(fallbackPct)}%를 쓰고 있어요. 손절률이나 손절가를 직접 적으면 그 값이 우선이에요.</FormRow>}
        <div className="form-row">
          <SummaryBox items={planItems} tones={!blind && (plannedPnl ?? 0) < 0 ? { [PNL_AT_STOP]: 'orange' } : {}} />
        </div>
        {(entry === null || stop === null) && (
          <FormRow className="form-note muted">
            {isCushion
              ? '손절가는 위 리스크 설정의 새 손절가를 써요. 목표 매수가나 손절률을 채우면 추천 수량이 계산돼요.'
              : '목표 매수가·손절가·손절률 중 둘을 채우면 나머지가 자동 계산돼요.'}
          </FormRow>
        )}
      </FormSection>

      <FormSection title="분할매수 계산기 (실제 체결)" icon={Calculator}>
        <FormRow className="form-note muted">같은 날 같은 결정으로 나눠 체결된 것만 합치세요. 수익이 난 뒤 추가로 사는 것(피라미딩)은 따로 기록하세요.</FormRow>
        {tranches.map((t, i) => {
          const auto = autoFee(t)
          const set = (patch: Partial<Tranche>) => setTranches((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)))
          return (
            <div key={t.id} className="form-row tranche">
              <div className="tranche-grid">
                <NumberField label={`${i + 1}번째 체결 가격`} value={t.price} onChange={(v) => set({ price: v })} placeholder="가격" unit={unit} decimal={isForeign} />
                <NumberField label={`${i + 1}번째 체결 수량`} value={t.quantity} onChange={(v) => set({ quantity: v })} placeholder="수량" unit="주" />
                <NumberField
                  label={`${i + 1}번째 체결 수수료`}
                  value={t.fee}
                  onChange={(v) => set({ fee: v })}
                  placeholder={auto !== null ? (isForeign ? auto.toFixed(2) : String(auto)) : '수수료'}
                  unit={unit}
                  decimal
                />
              </div>
              {tranches.length > 1 && (
                <button type="button" className="icon-button small-icon" aria-label={`${i + 1}번째 체결 지우기`} onClick={() => setTranches((prev) => prev.filter((x) => x.id !== t.id))}>
                  <X size={16} />
                </button>
              )}
            </div>
          )
        })}
        <FormRow>
          <button type="button" className="text-button" onClick={() => setTranches((prev) => [...prev, newTranche()])}>
            + 체결 추가
          </button>
        </FormRow>
        <FormRow className="form-note muted">
          수수료는 가격 × 수량 × 수수료율({isForeign ? '해외' : '국내'} {feeRate}%, 설정에서 변경)로 자동 계산돼요({isForeign ? '1센트' : '1원'} 미만 버림). 실제와 다르면 고쳐 적으세요.
        </FormRow>
        {recommended !== null && (
          <FormRow className={`form-note ${totalQty > recommended ? 'tone-orange' : 'muted'}`}>
            계획 {recommended}주 중 {totalQty}주 입력됨{recommended > totalQty ? ` (남은 ${recommended - totalQty}주)` : ''}
          </FormRow>
        )}
        <div className="form-row">
          <SummaryBox items={calcItems} tones={calcTones} />
        </div>
        {actualRiskExceeded && actualRisk !== null && (
          <FormRow className="form-note tone-orange">실제 리스크가 허용손실보다 {wonCompact(actualRisk - riskAmount)} 커요. 계획보다 많이 샀거나 비싸게 샀어요.</FormRow>
        )}
      </FormSection>

      {isForeign ? (
        <FormSection title="달러 예수금" icon={CircleDollarSign}>
          <Toggle label="환전도 같이 기록" checked={exchangeWithBuy} onChange={setExchangeWithBuy} />
          {exchangeWithBuy && (
            <>
              <FieldRow label="보낸 원화">
                <NumberField label="보낸 원화" value={exKrw} onChange={setExKrw} placeholder="0" unit="원" />
              </FieldRow>
              <FieldRow label="받은 달러">
                <NumberField label="받은 달러" value={exUsd} onChange={setExUsd} placeholder="0" unit="$" decimal />
                {usdShort > 0 && <FillButton label="부족분" onClick={() => setExUsd((Math.ceil(usdShort * 100) / 100).toFixed(2))} />}
              </FieldRow>
              {exRateKrw !== null && exRateUsd !== null && (
                <FieldRow label="환전 환율">
                  <span>{rateText(exRateKrw / exRateUsd)}</span>
                </FieldRow>
              )}
              <FormRow className="form-note muted">
                증권사가 주문하면서 환전해 줬다면(자동 환전) 그때 쓴 원화와 환전된 달러를 적어요. 여러 번 체결됐으면 합계를 적어요. 예수금의 환전과 같은 기록으로 따로 저장돼요.
              </FormRow>
            </>
          )}
          <div className="form-row">
            <CashChangeBox
              krw={cash.krw}
              usd={cash.usd}
              krwDelta={-(exRateKrw ?? 0)}
              usdDelta={(exRateUsd ?? 0) - needed}
              showKRW={exchangeWithBuy}
              leading={needed > 0 ? [['이번 매수에 필요', blind ? '•••' : dollar(needed)]] : []}
              usdShortfallHint="환전을 같이 기록하거나 예수금에서 먼저 기록하세요. "
              blind={blind}
            />
          </div>
        </FormSection>
      ) : (
        needed > 0 && (
          <FormSection title="원화 예수금" icon={Wallet}>
            <div className="form-row">
              <CashChangeBox krw={cash.krw} usd={cash.usd} krwDelta={-needed} showUSD={false} leading={[['이번 매수에 필요', blind ? '•••' : won(needed)]]} blind={blind} />
            </div>
          </FormSection>
        )
      )}

      <FormSection title="제세금" icon={Receipt} footer="매수는 보통 거래세가 없어요. 수수료는 위 계산기의 체결마다 적어요.">
        <FieldRow label="제세금">
          <NumberField label="제세금" value={tax} onChange={setTax} placeholder="0" unit={unit} decimal />
        </FieldRow>
      </FormSection>

      <SaveFooter title="매수 저장" reasons={blockReasons} busy={busy} onSave={submit} />
    </>
  )
}
