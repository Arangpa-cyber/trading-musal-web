// 거래내역 캘린더 — 매도 기록 기준. 날짜 색 = 그날 매도(부분 매도 포함) 실현손익 합, 숫자 = 그날 완료 거래 수.
// 날짜를 누르면 선택(다시 누르면 해제)되고 아래 목록이 그날 기록으로 바뀐다.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { sellAmountKRW, startOfDay, winRate } from '../../core'
import { useJournal } from '../../state/journal'
import { Text } from '../../ui/components'
import { wonCompact } from '../../ui/format'
import { useBlind } from '../../ui/hooks'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function TradeCalendar({ selectedDay, onSelect }: { selectedDay: number | null; onSelect: (day: number | null) => void }) {
  const { snapshot } = useJournal()
  const [blind] = useBlind()
  const [offset, setOffset] = useState(0)
  const now = new Date()
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1)

  const positions = new Map(snapshot.positions.map((p) => [p.id, p]))
  const pnlByDay = new Map<number, number>()
  for (const s of snapshot.sells) {
    const cost = positions.get(s.tradeId)?.costBasis(s) ?? sellAmountKRW(s)
    const day = startOfDay(s.date)
    pnlByDay.set(day, (pnlByDay.get(day) ?? 0) + sellAmountKRW(s) - cost)
  }
  const outcomesByDay = new Map<number, typeof snapshot.outcomes>()
  for (const o of snapshot.outcomes) {
    const day = startOfDay(o.closeDate)
    outcomesByDay.set(day, [...(outcomesByDay.get(day) ?? []), o])
  }

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const days: (number | null)[] = [
    ...Array<null>(month.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1).getTime()),
  ]
  const monthDays = days.filter((d): d is number => d !== null)
  // 색 진하기 — 이번 달에서 손익 크기가 가장 큰 날 기준으로 상대적으로.
  const maxAbs = Math.max(0, ...monthDays.map((d) => Math.abs(pnlByDay.get(d) ?? 0)))
  const monthOutcomes = monthDays.flatMap((d) => outcomesByDay.get(d) ?? [])
  const monthPnl = monthDays.reduce((a, d) => a + (pnlByDay.get(d) ?? 0), 0)
  const hasSells = monthDays.some((d) => pnlByDay.has(d))
  const today = startOfDay(Date.now())

  return (
    <div className="calendar">
      <div className="row-between">
        <button type="button" className="icon-button tone-accent" aria-label="이전 달" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft size={20} />
        </button>
        <strong>
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </strong>
        <button type="button" className="icon-button tone-accent" aria-label="다음 달" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight size={20} />
        </button>
      </div>
      {hasSells && (
        <div className="calendar-summary small bold">
          <Text tone={monthPnl >= 0 ? 'red' : 'blue'}>{blind ? '•••' : (monthPnl >= 0 ? '+' : '') + wonCompact(monthPnl)}</Text>
          {monthOutcomes.length > 0 && (
            <>
              <span className="muted">완료 거래 {monthOutcomes.length}건</span>
              <span className="muted">승률 {Math.round(winRate(monthOutcomes) * 100)}%</span>
            </>
          )}
        </div>
      )}
      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="tiny muted center-text">
            {w}
          </span>
        ))}
        {days.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />
          const pnl = pnlByDay.get(day)
          const count = outcomesByDay.get(day)?.length ?? 0
          const alpha = pnl === undefined ? 0 : maxAbs > 0 ? 0.15 + Math.min(Math.abs(pnl) / maxAbs, 1) * 0.35 : 0.15
          const color = pnl === undefined ? 'transparent' : `color-mix(in srgb, ${pnl >= 0 ? 'var(--red)' : 'var(--blue)'} ${Math.round(alpha * 100)}%, transparent)`
          return (
            <button
              key={day}
              type="button"
              className={`calendar-day ${selectedDay === day ? 'selected' : ''} ${day === today ? 'today' : ''}`}
              style={{ background: color }}
              aria-pressed={selectedDay === day}
              aria-label={`${new Date(day).getDate()}일`}
              onClick={() => onSelect(selectedDay === day ? null : day)}
            >
              <span>{new Date(day).getDate()}</span>
              {count > 0 && <span className="calendar-count">{count}건</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
