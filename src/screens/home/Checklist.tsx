// 확인표 — 현황 카드(지금 기간 요약) + 상세(기간별 표·YTD·통산 요약). 모두 거래당 %기준.
import { ChevronRight, Table } from 'lucide-react'
import {
  blockAdjustedRatio,
  blockHoldWarning,
  blockWinLossRatio,
  cardPeriod,
  PERIOD_OPTIONS,
  periodMonths,
  periods,
  stopGapWarns,
  summarize,
  yearToDate,
  type ChecklistBlock,
} from '../../core'
import { useJournal } from '../../state/journal'
import { Card, SectionHeader, StatCell, Text } from '../../ui/components'
import { percent, percentOrDash, ratio, shortDate, type Tone } from '../../ui/format'
import { useLocalStorage } from '../../ui/hooks'

/** 기간 단위(개월) — 카드와 상세가 같이 쓴다. 기기별. */
export function useChecklistMonths() {
  return useLocalStorage('checklistPeriodMonths', 1)
}

const days = (v: number | null) => (v === null ? '-' : `${Math.round(v)}일`)
const periodText = (b: ChecklistBlock) =>
  b.label ?? (b.periodStart !== null && b.periodEnd !== null ? `${shortDate(b.periodStart)}-${shortDate(b.periodEnd)}` : '-')
const stopGapTone = (v: number | null): Tone => (v === null ? 'default' : stopGapWarns(v) ? 'orange' : v >= 0 ? 'red' : 'blue')

export function ChecklistCard({ onOpen }: { onOpen: () => void }) {
  const { snapshot } = useJournal()
  const [months] = useChecklistMonths()
  const shown = cardPeriod(periods(snapshot.outcomes, months))
  const b = shown?.block
  return (
    <Card onClick={onOpen}>
      <SectionHeader title="확인표" icon={Table} trailing={<ChevronRight size={16} className="tone-muted" />} />
      {b ? (
        <>
          <Text tone="muted" size="small">
            {periodText(b)}
            {shown?.isCurrent ? ' (진행 중)' : ''} · {b.count}건
          </Text>
          <div className="stat-grid">
            <StatCell label="승률" value={percent(b.winRate)} />
            <StatCell label="평균수익" value={percentOrDash(b.avgWin)} tone="red" />
            <StatCell label="평균손실" value={percentOrDash(b.avgLoss)} tone="blue" />
            <StatCell label="손익비" value={blockWinLossRatio(b) === null ? '-' : ratio(blockWinLossRatio(b)!)} />
            <StatCell label="조정 손익비" value={blockAdjustedRatio(b)?.toFixed(2) ?? '-'} tone={(blockAdjustedRatio(b) ?? 0) > 1 ? 'red' : 'default'} />
            <StatCell label="손실보유일" value={days(b.avgLossHoldDays)} tone={blockHoldWarning(b) ? 'orange' : 'default'} />
          </div>
          {blockHoldWarning(b) && <Text tone="orange" size="tiny">손실 거래를 수익 거래보다 오래 들고 있어요.</Text>}
        </>
      ) : (
        <Text tone="muted" size="small">완결된 매매가 쌓이면 확인표가 표시돼요.</Text>
      )}
    </Card>
  )
}

export function ChecklistDetail() {
  const { snapshot } = useJournal()
  const outcomes = snapshot.outcomes
  const [stored, setMonths] = useChecklistMonths()
  const months = periodMonths(stored)
  const blocks = periods(outcomes, months)
  const overall = summarize(outcomes)
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
                  <th>평균수익</th>
                  <th>평균손실</th>
                  <th>승률</th>
                  <th>최대수익</th>
                  <th>최대손실</th>
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
                {months !== 12 && <BlockRow b={yearToDate(outcomes)} total />}
              </tbody>
            </table>
          </div>

          <div className="summary-box">
            <strong>트레이딩 요약 (통산 · 거래당 %기준)</strong>
            <SummaryRow label="승률" value={percent(overall.winRate)} />
            <SummaryRow label="평균 수익" value={percentOrDash(overall.avgWin)} tone="red" />
            <SummaryRow label="평균 손실" value={percentOrDash(overall.avgLoss)} tone="blue" />
            <SummaryRow label="손익비" value={blockWinLossRatio(overall) === null ? '-' : ratio(blockWinLossRatio(overall)!)} />
            <SummaryRow label="평균 손절가대비(손실 거래)" value={percentOrDash(overall.avgLossStopGap)} tone={stopGapTone(overall.avgLossStopGap)} />
            <SummaryRow label="조정 손익비" value={adjusted?.toFixed(2) ?? '-'} tone={(adjusted ?? 0) > 1 ? 'red' : 'default'} />
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
  return (
    <tr className={total ? 'total' : ''}>
      <td className={`left ${total ? '' : 'tone-muted'}`}>{periodText(b)}</td>
      <td className={b.count > 0 ? '' : 'tone-muted'}>{b.count > 0 ? b.count : '거래 없음'}</td>
      <td className="tone-red">{percentOrDash(b.avgWin)}</td>
      <td className="tone-blue">{percentOrDash(b.avgLoss)}</td>
      <td>{b.count > 0 ? percent(b.winRate) : '-'}</td>
      <td className="tone-red">{percentOrDash(b.maxWin)}</td>
      <td className="tone-blue">{percentOrDash(b.maxLoss)}</td>
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
