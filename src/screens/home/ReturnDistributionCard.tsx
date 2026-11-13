// 수익 분포 — 완료 거래(팔린 매수 1개 = 막대 하나의 1건)의 수익률을 5% 구간 막대로. X축 −20%~+60% 고정,
// 그 밖은 양 끝 구간("−20%↓"·"+60%↑")에 합산. 배경은 구간별 4가지 옅은 톤, 평균은 점선.
// 막대를 누르면 그 구간 거래 목록, 거래를 누르면 거래내역의 그 매도 카드로 간다(큰 손실 복기용, 2026-11-13 채택).
import { BarChart3 } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, Cell, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { fixedDateText } from '../../core'
import { useJournal } from '../../state/journal'
import { useSheets } from '../../state/sheets'
import { Card, SectionHeader, Text } from '../../ui/components'
import { percent } from '../../ui/format'

const WIDTH = 5
const LOW = -20
const HIGH = 60

/** 구간 가운데 기준 배경 톤 — 큰 손실 / 작은 손실 / 작은 수익 / 큰 수익. */
const zone = (start: number) => {
  const mid = start + WIDTH / 2
  return mid < -10 ? '#f08c8c' : mid < 0 ? '#f5d166' : mid < 15 ? '#73adf5' : '#73c785'
}

export function ReturnDistributionCard() {
  const { snapshot } = useJournal()
  const { showRecord } = useSheets()
  /** 누른 막대(구간 시작값) */
  const [picked, setPicked] = useState<number | null>(null)
  const trades = snapshot.outcomes.map((o) => ({
    name: o.assetName + (o.lotLabel ? ` · ${o.lotLabel}` : ''),
    date: o.closeDate,
    r: o.returnPercent,
    sellId: o.sellId,
  }))
  const bins: { start: number; mid: number; count: number; overflow: 'low' | 'high' | null }[] = [
    { start: LOW - WIDTH, mid: LOW - WIDTH / 2, count: trades.filter((t) => t.r < LOW).length, overflow: 'low' },
  ]
  for (let s = LOW; s < HIGH; s += WIDTH) {
    bins.push({ start: s, mid: s + WIDTH / 2, count: trades.filter((t) => t.r >= s && t.r < s + WIDTH).length, overflow: null })
  }
  bins.push({ start: HIGH, mid: HIGH + WIDTH / 2, count: trades.filter((t) => t.r >= HIGH).length, overflow: 'high' })
  const top = Math.max(1, ...bins.map((b) => b.count)) + 1
  const avg = trades.length ? trades.reduce((a, t) => a + t.r, 0) / trades.length : null
  const sd = trades.length > 1 && avg !== null ? Math.sqrt(trades.reduce((a, t) => a + (t.r - avg) ** 2, 0) / (trades.length - 1)) : null
  const ticks = [LOW - WIDTH / 2, -10, 0, 10, 20, 30, 40, 50, HIGH + WIDTH / 2]
  const tickLabel = (v: number) => (v <= LOW - WIDTH / 2 + 0.01 ? '-20%↓' : v >= HIGH + WIDTH / 2 - 0.01 ? '+60%↑' : `${v}%`)
  const inBin = (start: number) => (t: { r: number }) =>
    start < LOW ? t.r < LOW : start >= HIGH ? t.r >= HIGH : t.r >= start && t.r < start + WIDTH
  const pickedTrades = picked === null ? [] : trades.filter(inBin(picked)).sort((a, b) => a.r - b.r)
  const binTitle = (start: number) => (start < LOW ? '-20% 이하' : start >= HIGH ? '+60% 이상' : `${start}% ~ ${start + WIDTH}%`)

  return (
    <Card>
      <SectionHeader
        title="수익 분포"
        icon={BarChart3}
        trailing={
          avg !== null && (
            <Text bold size="tiny" tone={avg >= 0 ? 'red' : 'blue'}>
              평균 {percent(avg, true)}
              {sd !== null ? ` (표준편차 ${sd.toFixed(1)}%)` : ''}
            </Text>
          )
        }
      />
      <div className="chart" style={{ height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ top: 6, right: 22, bottom: 0, left: -28 }}>
            {bins.map((b) => (
              <ReferenceArea key={b.start} x1={b.start} x2={b.start + WIDTH} y1={0} y2={top} fill={zone(b.start)} fillOpacity={0.22} stroke="none" ifOverflow="hidden" />
            ))}
            <XAxis type="number" dataKey="mid" domain={[LOW - WIDTH, HIGH + WIDTH]} ticks={ticks} tickFormatter={tickLabel} tick={{ fontSize: 10 }} interval={0} allowDataOverflow />
            <YAxis domain={[0, top]} allowDecimals={false} tick={{ fontSize: 10 }} tickCount={3} />
            <Bar dataKey="count" barSize={14} radius={[3, 3, 0, 0]} isAnimationActive={false} onClick={(d) => {
              const bin = (d as unknown as { payload?: (typeof bins)[number] }).payload
              if (bin && bin.count > 0) setPicked((cur) => (cur === bin.start ? null : bin.start))
            }}>
              {bins.map((b) => (
                <Cell key={b.start} fill={picked === b.start ? 'var(--gold)' : 'var(--ink)'} cursor={b.count ? 'pointer' : undefined} />
              ))}
            </Bar>
            {avg !== null && (
              <ReferenceLine x={Math.min(Math.max(avg, LOW - WIDTH + 1.5), HIGH + WIDTH - 1.5)} stroke={avg >= 0 ? 'var(--red)' : 'var(--blue)'} strokeWidth={3} strokeDasharray="6 4" strokeOpacity={0.75} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {trades.length === 0 && <Text tone="muted" size="small">완결된 매매가 쌓이면 분포가 표시돼요.</Text>}
      {picked !== null && (
        <div className="overflow-list">
          <div className="row-between">
            <strong className="small">
              {binTitle(picked)} 거래 {pickedTrades.length}건
            </strong>
            <button type="button" className="text-button small" onClick={() => setPicked(null)}>
              닫기
            </button>
          </div>
          {pickedTrades.map((t, i) => (
            <button key={i} type="button" className="row-between small trade-link" onClick={() => showRecord(t.sellId)}>
              <span>
                <strong>{t.name}</strong> <span className="muted tiny">{fixedDateText(t.date)}</span>
              </span>
              <Text bold tone={t.r >= 0 ? 'red' : 'blue'}>{percent(t.r, true)} ›</Text>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
