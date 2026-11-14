// 총자산 추이 — 총자산/순입금액, 누적손익/누적 수수료, (달러 있으면) 환차손익, 순입금액 vs 누적손익 막대, 그래프.
// 그래프는 "총자산 | 누적손익" 한 번에 하나(두 값을 한 축에 그리면 크기 차이로 납작해져서 예전에 실패한 방식).
// - 총자산: 총자산 실선 + 순입금액 점선 + 둘 사이 간격 색칠(이익 연빨강/손실 연파랑) + 입금 ▲ · 출금 ▼.
// - 누적손익: 누적손익 선 + 0 기준 위아래 색칠 + 거래 완결 수익 ▲ / 손실 ▼ + 최고점 ★ + "최고점 대비" 한 줄.
// 기간 = 연도별 페이지 하나(2026-11-14 — 3개월·6개월·1년·전체 칩은 없앴다), 계단형 선(이벤트 사이에 허구의 변화를 그리지 않는다). 블라인드면 Y축이 %.
import { ChevronLeft, ChevronRight, LineChart as LineIcon } from 'lucide-react'
import { useState } from 'react'
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { fixedDateText, pointAssets, type AssetTimelinePoint } from '../../core'
import { useJournal } from '../../state/journal'
import { useSheets } from '../../state/sheets'
import { Blind, Card, SectionHeader, Text } from '../../ui/components'
import { Segmented } from '../../ui/form'
import { percent, signedWon, won, wonCompact } from '../../ui/format'
import { useBlind, useLocalStorage } from '../../ui/hooks'

type Mode = 'total' | 'pnl'
const TOTAL_COLOR = '#3d5470'

interface PagePoint {
  t: number
  balance: number
  principal: number
  flow?: 'deposit' | 'withdrawal'
  completion?: { name: string; ret: number }
  sellLabel?: string
  peak?: boolean
}

export function TrendCard() {
  const { snapshot } = useJournal()
  const { openFxRate } = useSheets()
  const [blind] = useBlind()
  const s = snapshot
  const pnl = s.totalAssets - s.netContributions
  const unrealized = s.cash.unrealizedFx(s.fxRate?.rate)
  return (
    <Card>
      <SectionHeader title="총자산 추이" icon={LineIcon} />
      <div className="one-line small">
        <span className="muted">현재 총자산: </span>
        {/* 총자산 숫자를 누르면 설정 환율 입력(달러 예수금 미실현 환차 기준). */}
        <button type="button" className="inline-button" onClick={openFxRate}>
          <Blind className="bold" blind={blind} text={won(s.totalAssets)} />
        </button>
        <span className="muted"> / 순입금액: </span>
        <Blind className="bold" blind={blind} text={won(s.netContributions)} />
      </div>
      <div className="one-line small">
        <span className="muted">총 누적손익: </span>
        <Text bold tone={pnl >= 0 ? 'red' : 'blue'}>{blind ? '•••' : signedWon(pnl)}</Text>
        {s.cumulativeFees > 0 && (
          <>
            <span className="muted"> / 누적 수수료: </span>
            <Blind blind={blind} text={won(s.cumulativeFees)} />
          </>
        )}
      </div>
      {(s.cash.realizedFx !== 0 || unrealized !== null) && (
        <div className="one-line tiny">
          <span className="muted">확정 환차손익 </span>
          <Text tone={s.cash.realizedFx >= 0 ? 'red' : 'blue'}>{blind ? '•••' : signedWon(s.cash.realizedFx)}</Text>
          {unrealized !== null && (
            <>
              <span className="muted"> / 미실현 </span>
              <Text tone={unrealized >= 0 ? 'red' : 'blue'}>{blind ? '•••' : signedWon(unrealized)}</Text>
              <span className="muted"> (현재 환율)</span>
            </>
          )}
        </div>
      )}
      {s.netContributions > 0 && s.totalAssets > 0 && <CompositionBar total={s.totalAssets} principal={s.netContributions} />}
      {s.timeline.length > 0 ? <TrendChart timeline={s.timeline} /> : <Text tone="muted" size="small">입금·매수·매도 기록이 쌓이면 추이가 표시돼요.</Text>}
    </Card>
  )
}

/** 내 돈 vs 번 돈 — 이익이면 막대 = 총자산(순입금액 | 누적손익), 손실이면 막대 = 순입금액(총자산 | 결손). */
function CompositionBar({ total, principal }: { total: number; principal: number }) {
  const gain = total >= principal
  const whole = Math.max(total, principal)
  const base = gain ? principal : total
  return (
    <div className="exposure">
      <div className="bar-track">
        <div style={{ width: `${(base / whole) * 100}%`, background: 'color-mix(in srgb, gray 35%, transparent)' }} />
        <div style={{ flex: 1, background: `color-mix(in srgb, ${gain ? 'var(--red)' : 'var(--blue)'} 70%, transparent)` }} />
      </div>
      <div className="row-between tiny">
        <span className="muted">{gain ? `순입금액 총자산의 ${percent((base / whole) * 100)}` : `총자산 순입금액의 ${percent((base / whole) * 100)}`}</span>
        <Text tone={gain ? 'red' : 'blue'}>누적손익 {percent(((total - principal) / whole) * 100, true)}</Text>
      </div>
    </div>
  )
}

function TrendChart({ timeline }: { timeline: AssetTimelinePoint[] }) {
  const { snapshot } = useJournal()
  const [blind] = useBlind()
  const [mode, setMode] = useLocalStorage<Mode>('assetTrendMode', 'total')
  const sorted = [...timeline].sort((a, b) => a.date - b.date)
  const thisYear = new Date().getFullYear()
  const minYear = new Date(sorted[0].date).getFullYear()
  const maxYear = Math.max(thisYear, new Date(sorted.at(-1)!.date).getFullYear())
  const [year, setYear] = useState(maxYear)

  // 블라인드 % 기준 — 총자산 보기 = 첫 기록 총자산(시작점 100%), 누적손익 보기 = 그 시점 순입금액.
  const blindBase = pointAssets(sorted[0]) > 0 ? pointAssets(sorted[0]) : (sorted.map(pointAssets).find((v) => v > 0) ?? 1)
  const ratio = (pnl: number, principal: number) => (principal > 0 ? (pnl / principal) * 100 : 0)
  const scaled = (v: number) => (blind ? (v / blindBase) * 100 : v)
  const pnlValue = (p: PagePoint) => (blind ? ratio(p.balance - p.principal, p.principal) : p.balance - p.principal)

  // 지금까지의 누적손익 최고점, 거래 완결(전량 매도) 지점.
  const peak = sorted.reduce((best, p) => (pointAssets(p) - p.netContributions > pointAssets(best) - best.netContributions ? p : best), sorted[0])
  const completions = new Map<string, { name: string; ret: number }>()
  for (const p of snapshot.closedPositions) {
    if (p.lastSellDate !== null && p.returnPercent !== null) completions.set(`${p.lastSellDate}|${p.assetName}`, { name: p.assetName, ret: p.returnPercent })
  }

  // 그해 페이지 — 전년도에서 이어지면 연초부터, 그해 처음 시작하면 첫 이벤트부터(가짜 0원 시작점 없음).
  const start = new Date(year, 0, 1).getTime()
  const end = new Date(year + 1, 0, 1).getTime()
  const right = year >= thisYear ? Math.min(Date.now(), end) : end
  const before = [...sorted].reverse().find((p) => p.date < start)
  const points: PagePoint[] = []
  if (before) points.push({ t: start, balance: pointAssets(before), principal: before.netContributions })
  for (const p of sorted.filter((x) => x.date >= start && x.date < right)) {
    const isSell = p.eventType === 'sell'
    points.push({
      t: p.date,
      balance: pointAssets(p),
      principal: p.netContributions,
      flow: p.eventType === 'deposit' ? 'deposit' : p.eventType === 'withdrawal' ? 'withdrawal' : undefined,
      completion: isSell ? completions.get(`${p.date}|${p.eventLabel}`) : undefined,
      sellLabel: isSell ? (p.eventLabel ?? undefined) : undefined,
      peak: p === peak,
    })
  }
  if (points.length && points.at(-1)!.t < right) points.push({ ...points.at(-1)!, t: right, flow: undefined, completion: undefined, sellLabel: undefined, peak: false })

  const rows = points.map((p) => {
    const b = scaled(p.balance)
    const pr = scaled(p.principal)
    const v = pnlValue(p)
    return { ...p, b, pr, v, gain: [pr, Math.max(b, pr)], loss: [Math.min(b, pr), pr], up: [0, Math.max(v, 0)], down: [Math.min(v, 0), 0] }
  })
  const values = mode === 'total' ? rows.flatMap((r) => [r.b, r.pr]) : [...rows.map((r) => r.v), 0]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.02, 1e-6)
  // X축 눈금 — 매달 1일, 많으면 2·3·6·12개월 간격으로 솎는다(8개 안팎).
  const monthStarts: number[] = []
  for (let d = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + (new Date(start).getDate() > 1 ? 1 : 0), 1); d.getTime() <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) monthStarts.push(d.getTime())
  const every = [1, 2, 3, 6, 12].find((n) => monthStarts.length / n <= 12) ?? 12
  const months = monthStarts.filter((t) => new Date(t).getMonth() % every === 0 || every === 1)
  const longSpan = end - start > 400 * 86_400_000
  const tickText = (t: number) => {
    const d = new Date(t)
    return longSpan ? `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}` : `${d.getMonth() + 1}월`
  }
  const yLabel = (v: number) => (blind ? (mode === 'pnl' ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}%` : `${v.toFixed(0)}%`) : wonCompact(v))

  // 입금 ▲(빨강)·출금 ▼(파랑) / 거래 완결 수익 ▲·손실 ▼ / 최고점 ★
  const marker = (props: { cx?: number; cy?: number; payload?: (typeof rows)[number]; index?: number }) => {
    const { cx, cy, payload: p, index } = props
    if (cx === undefined || cy === undefined || !p) return <g key={index} />
    if (mode === 'total' && p.flow) return <Triangle key={index} x={cx} y={cy} up={p.flow === 'deposit'} />
    if (mode === 'pnl' && p.peak) return <text key={index} x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fill="var(--gold)">★</text>
    if (mode === 'pnl' && p.completion) return <Triangle key={index} x={cx} y={cy} up={p.completion.ret > 0} />
    return <g key={index} />
  }

  const tooltip = ({ active, payload }: TooltipContentProps<ValueType, NameType>) => {
    const p = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined
    if (!p) return null
    const pnlNow = p.balance - p.principal
    return (
      <div className="chart-tip">
        <div className="muted">{fixedDateText(p.t)}</div>
        {mode === 'total' ? (
          <>
            <div>총자산 {blind ? percent(p.b) : won(p.balance)}</div>
            <div className="muted">순입금액 {blind ? percent(p.pr) : won(p.principal)}</div>
          </>
        ) : null}
        <div className={pnlNow >= 0 ? 'tone-red' : 'tone-blue'}>
          누적손익 {blind ? `${ratio(pnlNow, p.principal) >= 0 ? '+' : ''}${ratio(pnlNow, p.principal).toFixed(1)}%p` : signedWon(pnlNow)}
        </div>
        {p.completion && (
          <div>
            {p.completion.name} 완결 {percent(p.completion.ret, true)}
          </div>
        )}
        {!p.completion && p.sellLabel && <div className="muted">{p.sellLabel} 매도</div>}
      </div>
    )
  }

  // 최고점 대비 한 줄(누적손익 보기).
  const last = sorted.at(-1)!
  const peakPnl = pointAssets(peak) - peak.netContributions
  const nowPnl = pointAssets(last) - last.netContributions

  return (
    <div className="stack-tight">
      <Segmented options={[{ value: 'total', label: '총자산' }, { value: 'pnl', label: '누적손익' }]} value={mode} onChange={setMode} label="그래프 보기" />
      <div className="row-between">
        <button type="button" className="icon-button tone-gold" aria-label="이전 해" disabled={year <= minYear} onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft size={20} />
        </button>
        <strong className="small">{year}년</strong>
        <button type="button" className="icon-button tone-gold" aria-label="다음 해" disabled={year >= maxYear} onClick={() => setYear((y) => y + 1)}>
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="chart" style={{ height: 240 }}>
        {rows.length === 0 ? (
          <p className="empty">이 해엔 기록이 없어요</p>
        ) : (
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <XAxis type="number" dataKey="t" domain={[start, end]} ticks={months} tickFormatter={tickText} tick={{ fontSize: 10 }} interval={0} scale="time" />
              <YAxis domain={[lo - pad, hi + pad]} tickFormatter={yLabel} tick={{ fontSize: 10 }} width={52} tickCount={4} />
              <Tooltip content={tooltip} />
              {mode === 'total' ? (
                <>
                  <Area type="stepAfter" dataKey="gain" stroke="none" fill="var(--red)" fillOpacity={0.12} isAnimationActive={false} />
                  <Area type="stepAfter" dataKey="loss" stroke="none" fill="var(--blue)" fillOpacity={0.12} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="pr" stroke="gray" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="b" stroke={TOTAL_COLOR} strokeWidth={2} dot={marker} activeDot={{ r: 3 }} isAnimationActive={false} />
                </>
              ) : (
                <>
                  <Area type="stepAfter" dataKey="up" stroke="none" fill="var(--red)" fillOpacity={0.12} isAnimationActive={false} />
                  <Area type="stepAfter" dataKey="down" stroke="none" fill="var(--blue)" fillOpacity={0.12} isAnimationActive={false} />
                  <ReferenceLine y={0} stroke="var(--muted)" strokeOpacity={0.5} />
                  <Line type="stepAfter" dataKey="v" stroke={TOTAL_COLOR} strokeWidth={2} dot={marker} activeDot={{ r: 3 }} isAnimationActive={false} />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="legend tiny">
        {mode === 'total' ? (
          <>
            <span><i className="legend-line" />총자산</span>
            <span><i className="legend-dash" />순입금액</span>
            <span><span className="tone-red">▲</span> 입금</span>
            <span><span className="tone-blue">▼</span> 출금</span>
            {blind && <span className="muted">시작점 = 100%</span>}
          </>
        ) : (
          <>
            <span><span className="tone-red">▲</span> 수익 완결</span>
            <span><span className="tone-blue">▼</span> 손실 완결</span>
            <span><span className="tone-gold">★</span> 최고점</span>
            {blind && <span className="muted">순입금액 대비 %</span>}
          </>
        )}
      </div>
      {mode === 'pnl' &&
        (nowPnl < peakPnl - 0.5 ? (
          <div className="one-line small">
            <span className="muted">최고점({fixedDateText(peak.date)}) 대비 </span>
            <Text tone="blue">{blind ? '•••' : wonCompact(nowPnl - peakPnl)}</Text>
            <Text tone="blue">
              {' '}· 누적 수익률 {(ratio(nowPnl, last.netContributions) - ratio(peakPnl, peak.netContributions)).toFixed(1)}%p
            </Text>
          </div>
        ) : (
          <Text tone="muted" size="small">지금이 누적손익 최고점이에요</Text>
        ))}
    </div>
  )
}

function Triangle({ x, y, up }: { x: number; y: number; up: boolean }) {
  const s = 4.5
  const d = up ? `M${x},${y - s} L${x + s},${y + s * 0.7} L${x - s},${y + s * 0.7} Z` : `M${x},${y + s} L${x + s},${y - s * 0.7} L${x - s},${y - s * 0.7} Z`
  return <path d={d} fill={up ? 'var(--red)' : 'var(--blue)'} />
}
