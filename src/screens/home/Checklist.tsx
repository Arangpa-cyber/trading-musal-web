// 확인표 — 현황 카드(지금 기간 점검) + 상세(기간별 표·YTD·통산 요약). 모두 거래당 %기준.
// 미너비니가 추적하라고 한 항목을 전부 보여 준다: 승률·평균수익·평균손실·손익비·조정 손익비·최대수익·최대손실·보유일·거래 수
// + 기준(최대 손절폭)을 넘은 손실·손절가대비. 칸은 모두 라벨·값 2줄. 통산과 눈에 띄게 달라진 칸엔 값 옆 작은 ▲▼, 점검 한 줄.
import { ChevronRight, Table } from 'lucide-react'
import {
  blockAdjustedRatio,
  blockAvgLossWarn,
  blockBeyondWarn,
  blockHoldWarning,
  blockStubbornWarn,
  blockWinLossRatio,
  cardPeriod,
  checkupMessage,
  deviations,
  PERIOD_OPTIONS,
  periodMonths,
  periods,
  stopGapWarns,
  summarize,
  yearToDate,
  type ChecklistBlock,
  type Deviation,
} from '../../core'
import { useJournal } from '../../state/journal'
import { Card, SectionHeader, StatCell, Text } from '../../ui/components'
import { percent, percentOrDash, ratio, shortDate, type Tone } from '../../ui/format'
import { useLocalStorage } from '../../ui/hooks'

/** 기간 단위(개월) — 카드와 상세가 같이 쓴다. 기기별. */
export function useChecklistMonths() {
  return useLocalStorage('checklistPeriodMonths', 1)
}

export const days = (v: number | null) => (v === null ? '-' : `${Math.round(v)}일`)
const periodText = (b: ChecklistBlock) =>
  b.label ?? (b.periodStart !== null && b.periodEnd !== null ? `${shortDate(b.periodStart)}-${shortDate(b.periodEnd)}` : '-')
export const stopGapTone = (v: number | null): Tone => (v === null ? 'default' : stopGapWarns(v) ? 'orange' : v >= 0 ? 'red' : 'blue')
export const ratioText = (b: ChecklistBlock) => (blockWinLossRatio(b) === null ? '-' : ratio(blockWinLossRatio(b)!))
export const adjustedText = (b: ChecklistBlock) => {
  const v = blockAdjustedRatio(b)
  return v === null ? '-' : ratio(v)
}
export const adjustedTone = (b: ChecklistBlock): Tone => ((blockAdjustedRatio(b) ?? 0) > 1 ? 'red' : 'default')
export const beyondText = (b: ChecklistBlock) => (b.beyondCount === null ? '-' : `${b.beyondCount}회`)
/** 칸 이름 — 기준(설정의 최대 손절폭)을 이름에 넣는다. 기준이 꺼져 있으면 숫자 없이. */
export const beyondLabel = (limit: number) => (limit > 0 ? `기준(-${limit}%) 넘은 손실` : '기준 넘은 손실')

/** 값 옆 ▲▼ — 통산 대비 눈에 띄게 달라진 칸에만(없으면 undefined). 나빠졌으면 주황, 아니면 회색. */
const arrowOf = (d: Deviation | undefined) => (d ? { up: d.delta > 0, worse: d.worse } : undefined)

export function ChecklistCard({ onOpen }: { onOpen: () => void }) {
  const { data, snapshot } = useJournal()
  const [months] = useChecklistMonths()
  const limit = data.settings.maxStopLossPercent
  const shown = cardPeriod(periods(snapshot.outcomes, months, Date.now(), limit))
  const b = shown?.block
  const overall = summarize(snapshot.outcomes, null, limit)
  const dev = b ? deviations(b, overall) : {}
  const stubborn = b ? blockStubbornWarn(b) : false
  const note = b ? checkupMessage(b, overall, limit) : null
  return (
    <Card onClick={onOpen}>
      <SectionHeader title="확인표" icon={Table} trailing={<ChevronRight size={16} className="tone-muted" />} />
      {b ? (
        <>
          <Text tone="muted" size="small">
            {periodText(b)}
            {shown?.isCurrent ? ' (진행 중)' : ''}
          </Text>
          <div className="stat-grid">
            <StatCell label="승률" value={percent(b.winRate)} arrow={arrowOf(dev.winRate)} />
            <StatCell label="평균수익률" value={percentOrDash(b.avgWin)} tone="red" arrow={arrowOf(dev.avgWin)} />
            <StatCell label="평균손실률" value={percentOrDash(b.avgLoss)} tone={blockAvgLossWarn(b) ? 'orange' : 'blue'} arrow={arrowOf(dev.avgLoss)} />

            <StatCell label="손절가대비" value={percentOrDash(b.avgLossStopGap)} tone={stopGapTone(b.avgLossStopGap)} />
            <StatCell label="최대 수익" value={percentOrDash(b.maxWin)} tone={stubborn ? 'orange' : 'red'} />
            <StatCell label="최대 손실" value={percentOrDash(b.maxLoss)} tone={stubborn || blockBeyondWarn(b) ? 'orange' : 'blue'} />

            <StatCell label="손익비" value={ratioText(b)} />
            <StatCell label="조정 손익비" value={adjustedText(b)} tone={adjustedTone(b)} arrow={arrowOf(dev.adjusted)} highlight />
            <StatCell label={beyondLabel(limit)} value={beyondText(b)} tone={blockBeyondWarn(b) ? 'orange' : 'default'} compact />

            <StatCell label="수익 보유" value={days(b.avgWinHoldDays)} />
            <StatCell label="손실 보유" value={days(b.avgLossHoldDays)} tone={blockHoldWarning(b) ? 'orange' : 'default'} />
            <StatCell label="거래" value={`${b.count}건`} />
          </div>
          {note && (
            <Text tone="orange" size="small">
              ▶ 점검: {note}
            </Text>
          )}
        </>
      ) : (
        <Text tone="muted" size="small">완결된 매매가 쌓이면 확인표가 표시돼요.</Text>
      )}
    </Card>
  )
}

export function ChecklistDetail() {
  const { data, snapshot } = useJournal()
  const outcomes = snapshot.outcomes
  const limit = data.settings.maxStopLossPercent
  const [stored, setMonths] = useChecklistMonths()
  const months = periodMonths(stored)
  const blocks = periods(outcomes, months, Date.now(), limit)
  const overall = summarize(outcomes, null, limit)
  const adjusted = blockAdjustedRatio(overall)

  return (
    <div className="stack">
      <div className="row-between">
        <label className="inline-field">
          기간 단위
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {PERIOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}개월
              </option>
            ))}
          </select>
        </label>
        <Text tone="muted" size="small">매도일 기준</Text>
      </div>

      {outcomes.length === 0 ? (
        <p className="empty">완결된 매매가 쌓이면 확인표가 표시돼요.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="checklist-table">
              <thead>
                <tr>
                  <th className="left">기간</th>
                  <th>건수</th>
                  <th>승률</th>
                  <th>평균수익</th>
                  <th>평균손실</th>
                  <th>손익비</th>
                  <th>조정 손익비</th>
                  <th>최대수익</th>
                  <th>최대손실</th>
                  <th>{beyondLabel(limit)}</th>
                  <th>수익보유일</th>
                  <th>손실보유일</th>
                  <th>손절가대비</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b, i) => (
                  <BlockRow key={i} b={b} />
                ))}
                {/* 올해 합계 — 12개월 단위면 맨 위 올해 줄과 같아서 숨긴다. */}
                {months !== 12 && <BlockRow b={yearToDate(outcomes, Date.now(), limit)} total />}
              </tbody>
            </table>
          </div>

          <div className="summary-box">
            <strong>트레이딩 요약 (통산 · 거래당 %기준)</strong>
            <SummaryRow label="승률" value={percent(overall.winRate)} />
            <SummaryRow label="평균 수익" value={percentOrDash(overall.avgWin)} tone="red" />
            <SummaryRow label="평균 손실" value={percentOrDash(overall.avgLoss)} tone={blockAvgLossWarn(overall) ? 'orange' : 'blue'} />
            <SummaryRow label="손익비" value={ratioText(overall)} />
            <SummaryRow label="조정 손익비" value={adjustedText(overall)} tone={adjustedTone(overall)} />
            <SummaryRow label="최대 수익" value={percentOrDash(overall.maxWin)} tone="red" />
            <SummaryRow label="최대 손실" value={percentOrDash(overall.maxLoss)} tone="blue" />
            <SummaryRow label={beyondLabel(limit)} value={beyondText(overall)} tone={blockBeyondWarn(overall) ? 'orange' : 'default'} />
            <SummaryRow label="평균 보유일 (수익 / 손실)" value={`${days(overall.avgWinHoldDays)} / ${days(overall.avgLossHoldDays)}`} tone={blockHoldWarning(overall) ? 'orange' : 'default'} />
            <SummaryRow label="평균 손절가대비(손실 거래)" value={percentOrDash(overall.avgLossStopGap)} tone={stopGapTone(overall.avgLossStopGap)} />
            {adjusted !== null && (
              <Text tone="muted" size="tiny">
                {adjusted > 1 ? '조정 손익비 > 1 — 이 매매 습관엔 통계적 우위가 있어요.' : '조정 손익비 ≤ 1 — 아직 우위가 없어요. 손실을 줄이거나 이익을 키워야 해요.'}
              </Text>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BlockRow({ b, total }: { b: ChecklistBlock; total?: boolean }) {
  const has = b.count > 0
  return (
    <tr className={total ? 'total' : ''}>
      <td className={`left ${total ? '' : 'tone-muted'}`}>{periodText(b)}</td>
      <td className={has ? '' : 'tone-muted'}>{has ? b.count : '거래 없음'}</td>
      <td>{has ? percent(b.winRate) : '-'}</td>
      <td className="tone-red">{percentOrDash(b.avgWin)}</td>
      <td className={blockAvgLossWarn(b) ? 'tone-orange' : 'tone-blue'}>{percentOrDash(b.avgLoss)}</td>
      <td>{has ? ratioText(b) : '-'}</td>
      <td className={`tone-${adjustedTone(b)}`}>{has ? adjustedText(b) : '-'}</td>
      <td className={`tone-${blockStubbornWarn(b) ? 'orange' : 'red'}`}>{percentOrDash(b.maxWin)}</td>
      <td className={`tone-${blockStubbornWarn(b) || blockBeyondWarn(b) ? 'orange' : 'blue'}`}>{percentOrDash(b.maxLoss)}</td>
      <td className={blockBeyondWarn(b) ? 'tone-orange' : ''}>{has ? beyondText(b) : '-'}</td>
      <td>{days(b.avgWinHoldDays)}</td>
      <td className={blockHoldWarning(b) ? 'tone-orange' : ''}>{days(b.avgLossHoldDays)}</td>
      <td className={`tone-${stopGapTone(b.avgLossStopGap)}`}>{percentOrDash(b.avgLossStopGap)}</td>
    </tr>
  )
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="row-between">
      <Text tone="muted">{label}</Text>
      <Text bold tone={tone}>{value}</Text>
    </div>
  )
}
