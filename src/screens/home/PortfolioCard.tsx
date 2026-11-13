// 포트폴리오 구성 — iOS 파이 그대로: 비중 큰 순서로 12시부터 시계방향, 넓은 조각은 안쪽 두 줄 라벨,
// 좁은 조각은 지시선 라벨(원 바깥 기둥, 겹치지 않게 밀어내고 선끼리 교차하지 않게). 1% 미만은 누를 때만 라벨.
// 조각을 누르면 튀어나온다(다시 누르면 들어감). 달러가 있으면 아래 통화 노출 막대.
import { PieChart as PieIcon } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useJournal } from '../../state/journal'
import { Blind, Card, SectionHeader } from '../../ui/components'
import { dollar, won } from '../../ui/format'
import { useBlind } from '../../ui/hooks'
import { buildPie, DOT_SIZE, DOT_SPACING, hitSlice, POP_OFFSET, unit, type Measure, type PieSlice } from './pieLayout'

/** 무협 톤 팔레트 — 바랜 주홍·군청·탁한 금·이끼녹·자수정·먹색·흙색·청록(iOS와 같은 색). */
const PALETTE = ['#b34533', '#3d5470', '#8c7847', '#4d6b57', '#6b4761', '#333338', '#9e856b', '#59808c']
const HEIGHT = 260
const FONT = `-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', system-ui, sans-serif`
const INSIDE_FONT = `800 12px ${FONT}`
const OUTSIDE_FONT = `600 11px ${FONT}`

let canvas: CanvasRenderingContext2D | null = null
const measure: Measure = (text, kind) => {
  canvas ??= document.createElement('canvas').getContext('2d')
  if (!canvas) return text.length * 11
  canvas.font = kind === 'inside' ? INSIDE_FONT : OUTSIDE_FONT
  return Math.ceil(canvas.measureText(text).width)
}

/** 폭에 맞게 가운데를 "…"로 줄인다(iOS truncationMode .middle) — 실제 글자 폭으로 잰다. */
function fitMiddle(text: string, maxWidth: number): string {
  if (measure(text, 'outside') <= maxWidth) return text
  const chars = [...text]
  for (let keep = chars.length - 1; keep > 1; keep--) {
    const head = Math.ceil(keep / 2)
    const t = `${chars.slice(0, head).join('')}…${chars.slice(chars.length - (keep - head)).join('')}`
    if (measure(t, 'outside') <= maxWidth) return t
  }
  return '…'
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
/** 바깥 라벨 글자색 — 조각 색의 명도만 0.48로 눌러 밝은 카드 배경에서도 읽히게(색 대응은 유지). */
function readable(hex: string): string {
  const [r, g, b] = rgb(hex)
  const v = Math.max(r, g, b)
  if (v <= 0.48) return hex
  const k = 0.48 / v
  return `rgb(${Math.round(r * k * 255)}, ${Math.round(g * k * 255)}, ${Math.round(b * k * 255)})`
}
/** 조각 위 글자색 — 밝은 색 위엔 검정, 어두운 색 위엔 흰색. */
const contrasting = (hex: string) => {
  const [r, g, b] = rgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? '#000' : '#fff'
}

function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  if (end - start >= 359.999) return `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`
  const a = (start * Math.PI) / 180
  const b = (end * Math.PI) / 180
  const large = end - start > 180 ? 1 : 0
  return `M${cx},${cy} L${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(b)},${cy + r * Math.sin(b)} Z`
}

export function PortfolioCard() {
  const { snapshot } = useJournal()
  const [blind] = useBlind()
  const [selected, setSelected] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const cash = snapshot.cash
  const slices = useMemo<PieSlice[]>(() => {
    const items = snapshot.openPositions.map((p) => ({ name: p.assetName, amount: p.positionCost }))
    // 예수금은 통화와 무관하게 한 조각(원화/달러 비중은 아래 통화 막대가 맡는다).
    const cashTotal = Math.max(cash.krw, 0) + Math.max(cash.usdBookKRW, 0)
    if (cashTotal > 0) items.push({ name: '예수금', amount: cashTotal })
    const total = items.reduce((a, x) => a + x.amount, 0)
    if (total <= 0) return []
    // 금액이 같아도 순서가 흔들리지 않게 이름으로 2차 정렬(순서가 바뀌면 색·선택이 튄다).
    const sorted = items.sort((a, b) => (a.amount !== b.amount ? b.amount - a.amount : a.name.localeCompare(b.name)))
    let cumulative = 0
    return sorted.map((x, i) => {
      const fraction = x.amount / total
      const s = { id: `${i}|${x.name}`, name: x.name, percent: fraction * 100, color: PALETTE[i % PALETTE.length], startAngle: -90 + cumulative * 360, endAngle: -90 + (cumulative + fraction) * 360 }
      cumulative += fraction
      return s
    })
  }, [snapshot, cash])
  if (!slices.length) return null

  const g = width > 0 ? buildPie(width, HEIGHT, slices, selected, measure) : null

  function onTap(e: PointerEvent<SVGSVGElement>) {
    if (!g) return
    const rect = e.currentTarget.getBoundingClientRect()
    const hit = hitSlice({ x: e.clientX - rect.left, y: e.clientY - rect.top }, g, slices)
    if (hit === 'outside') setSelected(null)
    else setSelected((cur) => (hit && cur !== hit.id ? hit.id : null))
  }

  // 통화 노출 — 총자산 공식과 같은 기준(보유는 원화 매수원가, 달러 예수금은 장부가).
  const usd = snapshot.openPositions.filter((p) => p.isForeign).reduce((a, p) => a + p.positionCost, 0) + Math.max(cash.usdBookKRW, 0)
  const krw = snapshot.openPositions.filter((p) => !p.isForeign).reduce((a, p) => a + p.positionCost, 0) + Math.max(cash.krw, 0)
  const exposure = usd > 0 && usd + krw > 0 ? { krw: (krw / (usd + krw)) * 100, usd: (usd / (usd + krw)) * 100 } : null

  return (
    <Card>
      <SectionHeader title="포트폴리오 구성" icon={PieIcon} />
      <div ref={box} className="pie-box" style={{ height: HEIGHT }}>
        {g && (
          <svg width={width} height={HEIGHT} onPointerUp={onTap} role="img" aria-label="포트폴리오 구성 파이차트">
            {slices.map((s, i) => {
              const pop = selected === s.id ? POP_OFFSET : 0
              const u = unit(s)
              return (
                <path
                  key={s.id}
                  className="pie-slice"
                  style={{ animationDelay: `${i * 40}ms`, transformOrigin: `${g.center.x}px ${g.center.y}px` }}
                  d={slicePath(g.center.x + pop * u.x, g.center.y + pop * u.y, g.radius, s.startAngle, s.endAngle)}
                  fill={s.color}
                  stroke="var(--card-solid)"
                  strokeWidth={2}
                />
              )
            })}
            {g.outside.map((l) => {
              const dotX = l.goesRight ? l.textAnchor.x - l.textWidth / 2 + DOT_SIZE / 2 : l.textAnchor.x + l.textWidth / 2 - DOT_SIZE / 2
              const textX = l.goesRight ? dotX + DOT_SIZE / 2 + DOT_SPACING : dotX - DOT_SIZE / 2 - DOT_SPACING
              const text = fitMiddle(l.text, l.textWidth - DOT_SIZE - DOT_SPACING)
              return (
                <g key={l.sliceId} className="pie-label">
                  {/* 지시선도 조각 색을 옅게 — 선을 끝까지 따라가지 않아도 어느 조각인지 읽힌다. */}
                  <polyline points={l.leader.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={l.color} strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round" />
                  <circle cx={dotX} cy={l.textAnchor.y} r={DOT_SIZE / 2} fill={l.color} />
                  <text x={textX} y={l.textAnchor.y} dy="0.35em" textAnchor={l.goesRight ? 'start' : 'end'} fontSize={11} fontWeight={selected === l.sliceId ? 800 : 600} fill={readable(l.color)}>
                    {text}
                  </text>
                </g>
              )
            })}
            {g.inside.map((l) => (
              <text key={l.sliceId} className="pie-label pie-inside" x={l.point.x} y={l.point.y} textAnchor="middle" fontSize={12} fontWeight={800} fill={contrasting(l.color)}>
                <tspan x={l.point.x} dy="-0.25em">{l.name}</tspan>
                <tspan x={l.point.x} dy="1.2em">{l.percentText}</tspan>
              </text>
            ))}
          </svg>
        )}
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
