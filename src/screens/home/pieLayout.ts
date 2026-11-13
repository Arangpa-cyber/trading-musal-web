// 포트폴리오 파이 배치 계산 — iOS `PieChartLayout` 그대로(순수 함수). 반지름·안쪽 라벨·바깥 지시선 라벨 위치를 한 번에 정한다.
// 조각이 라벨을 담을 만큼 넓으면 조각 안에, 좁으면 지시선을 달아 원 바깥 기둥으로 빼낸다. 바깥 라벨끼리는 y 순으로 밀어내
// 겹치지 않고, 지시선은 "수평 → 수직 → 수평"으로 꺾으며 서로 교차하지 않게 기둥 순서를 정한다. 1% 미만 조각은 누를 때만 라벨.

export interface Point {
  x: number
  y: number
}

export interface PieSlice {
  id: string
  name: string
  percent: number
  color: string
  /** 도(degree) — −90°(12시)에서 시작해 시계방향으로 커진다 */
  startAngle: number
  endAngle: number
}

export const sweep = (s: PieSlice) => s.endAngle - s.startAngle
const midAngle = (s: PieSlice) => (s.startAngle + s.endAngle) / 2
/** 중앙각 방향 단위벡터 — 튀어나오기·라벨·지시선이 모두 이 방향. */
export const unit = (s: PieSlice): Point => ({ x: Math.cos((midAngle(s) * Math.PI) / 180), y: Math.sin((midAngle(s) * Math.PI) / 180) })
/** 큰 조각은 정수, 작은 조각은 소수 첫째 자리 — 1%대가 전부 "1%"로 뭉치지 않게. */
export const percentText = (s: PieSlice) => (s.percent >= 10 ? `${s.percent.toFixed(0)}%` : `${s.percent.toFixed(1)}%`)
/** 바깥 라벨은 한 줄 — 세로 공간을 절반만 써서 라벨을 더 많이 담는다. */
const outsideText = (s: PieSlice) => `${s.name} ${percentText(s)}`

export interface InsideLabel {
  sliceId: string
  name: string
  percentText: string
  color: string
  point: Point
}

export interface OutsideLabel {
  sliceId: string
  text: string
  color: string
  goesRight: boolean
  leader: Point[]
  textAnchor: Point
  textWidth: number
}

export interface PieGeometry {
  center: Point
  radius: number
  inside: InsideLabel[]
  outside: OutsideLabel[]
}

/** 글자 폭 재기 — 화면과 같은 글꼴로. */
export type Measure = (text: string, font: 'inside' | 'outside') => number

export const LABEL_MIN_PERCENT = 1
export const POP_OFFSET = 12
export const DOT_SIZE = 6
export const DOT_SPACING = 4
export const INSIDE_LINE = 15
export const OUTSIDE_LINE = 13
const LEADER_STUB = 9
const COLUMN_INSET = 14
const LABEL_GAP = 5
const MIN_LABEL_WIDTH = 62
const MIN_RADIUS = 58
const INSIDE_LABEL_RATIO = 0.64
const INSIDE_LABEL_MARGIN = 12
/** 라벨마다 기둥 x를 이만큼 벌린다 — 한 줄로 합쳐지면 어느 선이 어느 라벨인지 못 따라간다. */
const COLUMN_STEP = 4
const MAX_COLUMN_STEPS = 4

export function buildPie(width: number, height: number, slices: PieSlice[], selectedId: string | null, measure: Measure): PieGeometry {
  if (!slices.length || width <= 40 || height <= 40) return { center: { x: width / 2, y: height / 2 }, radius: 0, inside: [], outside: [] }
  // 1) 세로 여백만 고려한 반지름.
  const heightBound = Math.min(Math.min(width, height) / 2.6, height / 2 - 6)
  // 2) 바깥으로 빠질 조각 — 좌우는 중앙각 cos 부호만 보므로 반지름과 무관하게 지금 정한다.
  const overflowing = slices.filter((s) => !fitsInside(s, heightBound, measure)).filter((s) => s.percent >= LABEL_MIN_PERCENT || s.id === selectedId)
  // 3) 각 쪽에 실제 라벨 폭만큼만 예약하고, 라벨이 한쪽에만 있으면 파이를 반대쪽으로 민다.
  const leftGutter = gutter(overflowing.filter((s) => unit(s).x < 0), measure, width)
  const rightGutter = gutter(overflowing.filter((s) => unit(s).x >= 0), measure, width)
  const radius = Math.max(MIN_RADIUS, Math.min(heightBound, (width - leftGutter - rightGutter) / 2))
  const center = { x: (width - (leftGutter + radius * 2 + rightGutter)) / 2 + leftGutter + radius, y: height / 2 }
  const geometry: PieGeometry = { center, radius, inside: [], outside: [] }
  const goingRight: PieSlice[] = []
  const goingLeft: PieSlice[] = []
  for (const s of slices) {
    const pop = s.id === selectedId ? POP_OFFSET : 0
    if (fitsInside(s, radius, measure)) {
      const d = radius * INSIDE_LABEL_RATIO + pop
      const u = unit(s)
      geometry.inside.push({ sliceId: s.id, name: s.name, percentText: percentText(s), color: s.color, point: { x: center.x + d * u.x, y: center.y + d * u.y } })
    } else if (s.percent >= LABEL_MIN_PERCENT || s.id === selectedId) {
      if (unit(s).x >= 0) goingRight.push(s)
      else goingLeft.push(s)
    }
  }
  // 텍스트 블록은 가장 먼 기둥 기준으로 폭을 잡아 라벨 끝선이 가지런하다.
  const rightEdge = center.x + radius + COLUMN_INSET + columnStagger(goingRight.length) + LABEL_GAP
  const leftEdge = center.x - radius - COLUMN_INSET - columnStagger(goingLeft.length) - LABEL_GAP
  geometry.outside = [
    ...place(goingRight, true, center, radius, Math.max(40, width - rightEdge - 2), height, selectedId),
    ...place(goingLeft, false, center, radius, Math.max(40, leftEdge - 2), height, selectedId),
  ]
  return geometry
}

function gutter(group: PieSlice[], measure: Measure, frameWidth: number): number {
  if (!group.length) return 0
  const widest = Math.max(...group.map((s) => measure(outsideText(s), 'outside')))
  const needed = COLUMN_INSET + columnStagger(group.length) + LABEL_GAP + DOT_SIZE + DOT_SPACING + Math.max(widest, MIN_LABEL_WIDTH) + 2
  // 라벨 욕심에 파이가 사라지지 않게 한쪽당 40%까지만.
  return Math.min(needed, frameWidth * 0.4)
}

const columnStagger = (count: number) => Math.min(Math.max(count - 1, 0), MAX_COLUMN_STEPS) * COLUMN_STEP

/**
 * 지시선이 서로 교차하지 않는 기둥 순서(깊이). 한 선의 세로 구간이 다른 선의 수평 높이를 지나가면 바깥, 라벨 높이를 지나가면
 * 안쪽이어야 한다 — 제약 그래프(DAG)의 최장 경로 길이를 깊이로 쓴다.
 */
function columnDepths(horizontalYs: number[], labelYs: number[]): number[] {
  const n = horizontalYs.length
  if (n <= 1) return Array(n).fill(0)
  const outerThan: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const lower = Math.min(horizontalYs[j], labelYs[j])
      const upper = Math.max(horizontalYs[j], labelYs[j])
      if (horizontalYs[i] > lower && horizontalYs[i] < upper) outerThan[i].push(j)
      if (labelYs[i] > lower && labelYs[i] < upper) outerThan[j].push(i)
    }
  }
  const depth = Array(n).fill(0)
  for (let k = 0; k < n; k++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      for (const j of outerThan[i]) {
        if (depth[j] <= depth[i]) {
          depth[j] = depth[i] + 1
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return depth
}

/** 한쪽 열 라벨을 조각 y 순으로 정렬해 최소 간격만큼 밀어낸다(순서 유지). */
function place(group: PieSlice[], goesRight: boolean, center: Point, radius: number, textWidth: number, height: number, selectedId: string | null): OutsideLabel[] {
  if (!group.length) return []
  const naturalY = (s: PieSlice) => center.y + radius * unit(s).y
  const ordered = [...group].sort((a, b) => naturalY(a) - naturalY(b))
  const lineHeight = OUTSIDE_LINE
  const top = lineHeight / 2 + 2
  const bottom = height - lineHeight / 2 - 2
  let gap = lineHeight + 3
  if (ordered.length > 1 && (ordered.length - 1) * gap > bottom - top) gap = Math.max(lineHeight * 0.7, (bottom - top) / (ordered.length - 1))
  const ys = ordered.map(naturalY)
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap)
  if (ys.at(-1)! > bottom) {
    ys[ys.length - 1] = bottom
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap)
  }
  if (ys[0] < top) {
    ys[0] = top
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap)
  }
  const sign = goesRight ? 1 : -1
  const stagger = columnStagger(ordered.length)
  const outerColumnX = center.x + sign * (radius + COLUMN_INSET + stagger)
  const anchorX = outerColumnX + sign * (LABEL_GAP + textWidth / 2)
  // 수평 구간이 실제로 그려지는 y는 원 밖으로 뺀 지점(outOfArc) — 12시 근처에서 조각 쪽 y를 쓰면 순서가 뒤집힌다.
  const arc = ordered.map((s) => {
    const start = radius + (s.id === selectedId ? POP_OFFSET : 0)
    const u = unit(s)
    return {
      onArc: { x: center.x + start * u.x, y: center.y + start * u.y },
      outOfArc: { x: center.x + (start + LEADER_STUB) * u.x, y: center.y + (start + LEADER_STUB) * u.y },
    }
  })
  const depths = columnDepths(
    arc.map((a) => a.outOfArc.y),
    ys,
  )
  const maxDepth = Math.max(...depths)
  const step = maxDepth > 0 ? Math.min(COLUMN_STEP, stagger / maxDepth) : 0
  return ordered.map((s, i) => {
    const { onArc, outOfArc } = arc[i]
    const columnX = center.x + sign * (radius + COLUMN_INSET + depths[i] * step)
    return {
      sliceId: s.id,
      text: outsideText(s),
      color: s.color,
      goesRight,
      leader: [onArc, outOfArc, { x: columnX, y: outOfArc.y }, { x: columnX, y: ys[i] }, { x: outerColumnX, y: ys[i] }],
      textAnchor: { x: anchorX, y: ys[i] },
      textWidth,
    }
  })
}

/** 조각 안에 두 줄 라벨(이름/비중)이 들어갈 만큼 호가 넓은지 — 실제 글자 폭으로 잰다. */
function fitsInside(s: PieSlice, radius: number, measure: Measure): boolean {
  if (radius < 44) return false
  const labelRadius = radius * INSIDE_LABEL_RATIO
  const sw = Math.min(Math.abs(sweep(s)), 360)
  const arcWidth = sw >= 180 ? labelRadius * 2 : 2 * labelRadius * Math.sin(((sw / 2) * Math.PI) / 180)
  const needed = Math.max(measure(s.name, 'inside'), measure(percentText(s), 'inside'))
  return arcWidth >= needed + INSIDE_LABEL_MARGIN && radius - labelRadius >= INSIDE_LINE
}

/** 탭 지점 각도로 조각 찾기 — 좁은 조각부터 최소 6° 여유를 줘서 1%짜리도 집힌다. */
export function hitSlice(p: Point, g: PieGeometry, slices: PieSlice[]): PieSlice | null | 'outside' {
  const dx = p.x - g.center.x
  const dy = p.y - g.center.y
  if (Math.hypot(dx, dy) > g.radius + POP_OFFSET) return 'outside'
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (deg < -90) deg += 360
  return (
    [...slices]
      .sort((a, b) => Math.abs(sweep(a)) - Math.abs(sweep(b)))
      .find((s) => {
        const pad = Math.max(0, (6 - Math.abs(sweep(s))) / 2)
        return deg >= s.startAngle - pad && deg <= s.endAngle + pad
      }) ?? null
  )
}
