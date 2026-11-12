// 포트폴리오 구성 — 보유 종목(매수원가)과 예수금을 비중 큰 순서로 12시부터 시계방향 파이. 큰 조각은 안쪽 라벨,
// 아래 목록에 색·비중. 조각이나 목록을 누르면 그 조각이 강조된다. 달러가 있으면 통화 노출 막대.
import { PieChart as PieIcon } from 'lucide-react'
import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, type PieLabelRenderProps } from 'recharts'
import { useJournal } from '../../state/journal'
import { Blind, Card, SectionHeader } from '../../ui/components'
import { dollar, won } from '../../ui/format'
import { useBlind } from '../../ui/hooks'

/** 무협 톤 팔레트 — 바랜 주홍·군청·탁한 금·이끼녹·자수정·먹색·흙색·청록. */
const PALETTE = ['#b34533', '#3d5470', '#8c7847', '#4d6b57', '#6b4761', '#333338', '#9e856b', '#59808c']

export function PortfolioCard() {
  const { snapshot } = useJournal()
  const [blind] = useBlind()
  const [selected, setSelected] = useState<string | null>(null)
  const cash = snapshot.cash
  const items = snapshot.openPositions.map((p) => ({ name: p.assetName, amount: p.positionCost }))
  // 예수금은 통화와 무관하게 한 조각(원화/달러 비중은 아래 통화 막대가 맡는다).
  const cashTotal = Math.max(cash.krw, 0) + Math.max(cash.usdBookKRW, 0)
  if (cashTotal > 0) items.push({ name: '예수금', amount: cashTotal })
  const total = items.reduce((a, x) => a + x.amount, 0)
  if (total <= 0) return null
  // 금액이 같아도 순서가 흔들리지 않게 이름으로 2차 정렬.
  const slices = items
    .sort((a, b) => (a.amount !== b.amount ? b.amount - a.amount : a.name.localeCompare(b.name)))
    .map((x, i) => ({ ...x, percent: (x.amount / total) * 100, color: PALETTE[i % PALETTE.length], key: `${i}|${x.name}` }))
  const pctText = (p: number) => (p >= 10 ? `${p.toFixed(0)}%` : `${p.toFixed(1)}%`)

  // 통화 노출 — 총자산 공식과 같은 기준(보유는 원화 매수원가, 달러 예수금은 장부가).
  const usd = snapshot.openPositions.filter((p) => p.isForeign).reduce((a, p) => a + p.positionCost, 0) + Math.max(cash.usdBookKRW, 0)
  const krw = snapshot.openPositions.filter((p) => !p.isForeign).reduce((a, p) => a + p.positionCost, 0) + Math.max(cash.krw, 0)
  const exposure = usd > 0 && usd + krw > 0 ? { krw: (krw / (usd + krw)) * 100, usd: (usd / (usd + krw)) * 100 } : null

  const label = (props: PieLabelRenderProps) => {
    // 조각 자기 데이터로 그린다 — 종목이 빠진 직후 번호(index)가 이전 목록을 가리켜 오류가 났다.
    const s = (props as { payload?: (typeof slices)[number] }).payload
    // 좁은 조각은 라벨을 안 쓴다(아래 목록에 있다).
    if (!s || s.percent < 9) return null
    const r = ((Number(props.innerRadius) || 0) + Number(props.outerRadius)) * 0.5
    const a = (-Number(props.midAngle) * Math.PI) / 180
    const x = Number(props.cx) + r * 1.25 * Math.cos(a)
    const y = Number(props.cy) + r * 1.25 * Math.sin(a)
    return (
      <text x={x} y={y} textAnchor="middle" fill="white" fontSize={12} fontWeight={800} style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.25)', strokeWidth: 2 }}>
        <tspan x={x} dy="-0.2em">{s.name.length > 6 ? `${s.name.slice(0, 6)}…` : s.name}</tspan>
        <tspan x={x} dy="1.2em">{pctText(s.percent)}</tspan>
      </text>
    )
  }

  return (
    <Card>
      <SectionHeader title="포트폴리오 구성" icon={PieIcon} />
      <div className="chart" style={{ height: 230 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={slices}
              dataKey="amount"
              nameKey="name"
              startAngle={90}
              endAngle={-270}
              outerRadius="92%"
              stroke="var(--card)"
              strokeWidth={2}
              label={label}
              labelLine={false}
              isAnimationActive={false}
              onClick={(_, i) => setSelected((cur) => (cur === slices[i].key ? null : slices[i].key))}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} fillOpacity={selected && selected !== s.key ? 0.35 : 1} cursor="pointer" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="pie-legend">
        {slices.map((s) => (
          <button key={s.key} type="button" className={`pie-legend-row ${selected === s.key ? 'on' : ''}`} onClick={() => setSelected((cur) => (cur === s.key ? null : s.key))}>
            <i style={{ background: s.color }} />
            <span className="ellipsis">{s.name}</span>
            <span className="spacer" />
            <strong>{pctText(s.percent)}</strong>
          </button>
        ))}
      </div>
      {exposure && (
        <div className="exposure">
          <div className="row-between small bold">
            <span className="tone-accent">원화 {exposure.krw.toFixed(0)}%</span>
            <span className="muted">달러 {exposure.usd.toFixed(0)}%</span>
          </div>
          <div className="bar-track">
            <div style={{ width: `${exposure.krw}%`, background: 'var(--accent)' }} />
            <div style={{ flex: 1, background: 'color-mix(in srgb, var(--accent) 35%, transparent)' }} />
          </div>
          {cash.usd > 0 && <Blind className="muted tiny" blind={blind} text={`예수금: 원화 ${won(Math.max(cash.krw, 0))} · 달러 ${dollar(cash.usd)}`} />}
        </div>
      )}
    </Card>
  )
}
