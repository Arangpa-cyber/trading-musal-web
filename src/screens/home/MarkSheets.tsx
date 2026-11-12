// 현재가 기록 — 종목 하나(현재가 + 손절가, "손절가를 본전(평단)으로") / 보유 종목 전부(현재가만, 고친 칸만).
// 현재가는 수익률·손절 여유·현재수익에만 쓰이고 총자산·경지엔 반영되지 않는다. 손절가는 포지션의 모든 매수에 같은 값.
import { useState } from 'react'
import type { Buy, TradePosition } from '../../core'
import { errorMessage } from '../../state/backupActions'
import { useJournal } from '../../state/journal'
import { FieldRow, FormSection, NumberField, parseNum } from '../../ui/form'
import { price } from '../../ui/format'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/toast'

const fieldText = (v: number, foreign: boolean) => (foreign ? v.toFixed(2) : String(Math.round(v)))
const NOTE = '현재가는 수익률·손절 여유·현재수익 계산에만 쓰여요(총자산·경지엔 반영 안 돼요).'

function useSave() {
  const { data, persist } = useJournal()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  /** 포지션별 바꿀 값 → 그 포지션 매수 기록 전부에 같은 값. */
  async function save(changes: { tradeId: string; mark?: number; stop?: number }[], onClose: () => void) {
    const now = Date.now()
    const buys: Buy[] = []
    for (const c of changes) {
      for (const b of data.buys.filter((x) => x.tradeId === c.tradeId)) {
        buys.push({ ...b, ...(c.mark !== undefined ? { markPrice: c.mark, markDate: now } : {}), ...(c.stop !== undefined ? { stopLossPrice: c.stop } : {}) })
      }
    }
    if (!buys.length) return onClose()
    setBusy(true)
    try {
      await persist({ buys })
      onClose()
      toast('기록됨')
    } catch (e) {
      window.alert(`저장하지 못했어요: ${errorMessage(e)}`)
      setBusy(false)
    }
  }
  return { save, busy }
}

export function MarkPriceSheet({ position: p, onClose }: { position: TradePosition; onClose: () => void }) {
  const { save, busy } = useSave()
  const unit = p.isForeign ? '$' : '원'
  const [mark, setMark] = useState(p.mark ? fieldText(p.mark.price, p.isForeign) : '')
  const [stop, setStop] = useState(p.nativeStopLoss !== null ? fieldText(p.nativeStopLoss, p.isForeign) : '')
  const avg = p.nativeAverageBuyPrice
  // 본전 손절 — 손절가 = 평단(원화 1원·달러 1센트 단위로 올림, 반올림으로 평단 아래가 되지 않게).
  const breakeven = p.isForeign ? (Math.ceil(avg * 100 - 1e-6) / 100).toFixed(2) : String(Math.ceil(avg - 1e-6))

  function submit() {
    const m = parseNum(mark)
    const s = parseNum(stop)
    void save(
      [
        {
          tradeId: p.id,
          mark: m !== null && m > 0 && m !== p.mark?.price ? m : undefined,
          stop: s !== null && s > 0 && Math.abs(s - (p.nativeStopLoss ?? 0)) > 1e-9 ? s : undefined,
        },
      ].filter((c) => c.mark !== undefined || c.stop !== undefined),
      onClose,
    )
  }

  return (
    <Sheet
      title="현재가 · 손절가 기록"
      onClose={onClose}
      leading={<button type="button" className="bar-button" onClick={onClose}>취소</button>}
      trailing={<button type="button" className="bar-button bold" disabled={busy} onClick={submit}>저장</button>}
    >
      <FormSection
        title={`${p.assetName} · 평단 ${price(avg, p.currency)}`}
        footer={`${NOTE} 손절가를 평단 이상으로 올리면 리스크 대신 확보수익률·확보이익으로 보여요.`}
      >
        <FieldRow label="현재가">
          <NumberField label="현재가" value={mark} onChange={setMark} unit={unit} decimal={p.isForeign} />
        </FieldRow>
        <FieldRow label="손절가">
          <NumberField label="손절가" value={stop} onChange={setStop} unit={unit} decimal={p.isForeign} />
        </FieldRow>
        <button type="button" className="form-row text-row" disabled={avg <= 0} onClick={() => setStop(breakeven)}>
          손절가를 본전(평단)으로
        </button>
      </FormSection>
    </Sheet>
  )
}

export function BulkMarkSheet({ positions, onClose }: { positions: TradePosition[]; onClose: () => void }) {
  const { save, busy } = useSave()
  const initial = Object.fromEntries(positions.map((p) => [p.id, p.mark ? fieldText(p.mark.price, p.isForeign) : '']))
  const [texts, setTexts] = useState<Record<string, string>>(initial)

  function submit() {
    const changes = positions
      .filter((p) => texts[p.id] !== initial[p.id])
      .flatMap((p) => {
        const v = parseNum(texts[p.id] ?? '')
        return v !== null && v > 0 ? [{ tradeId: p.id, mark: v }] : []
      })
    void save(changes, onClose)
  }

  return (
    <Sheet
      title="현재가 한 번에 기록"
      onClose={onClose}
      leading={<button type="button" className="bar-button" onClick={onClose}>취소</button>}
      trailing={<button type="button" className="bar-button bold" disabled={busy} onClick={submit}>저장</button>}
    >
      <FormSection footer={`${NOTE} 고친 종목만 오늘 날짜로 기록돼요. 손절가는 종목 메뉴 "현재가 · 손절가 기록"에서 바꿔요.`}>
        {positions.map((p) => (
          <FieldRow key={p.id} label={p.assetName}>
            <NumberField label={`${p.assetName} 현재가`} placeholder="현재가" value={texts[p.id] ?? ''} onChange={(v) => setTexts((t) => ({ ...t, [p.id]: v }))} unit={p.isForeign ? '$' : '원'} decimal={p.isForeign} />
          </FieldRow>
        ))}
      </FormSection>
    </Sheet>
  )
}
