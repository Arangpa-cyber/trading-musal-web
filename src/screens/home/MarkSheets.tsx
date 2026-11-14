// 현재가 기록 — 종목 하나 / 보유 종목 전부(고친 칸만). 현재가는 같은 종목의 모든 매수 건에 같은 값으로 기록된다.
// 현재가는 수익률·손절 여유·현재수익에만 쓰이고 총자산·경지엔 반영되지 않는다. 손절가는 매수 기록에 쓴 값 그대로라 여기서 못 바꾼다.
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
  /** 종목(포지션)별 바꿀 현재가 → 그 종목 매수 기록 전부에 같은 값. */
  async function save(changes: { tradeId: string; mark: number }[], onClose: () => void) {
    const now = Date.now()
    const buys: Buy[] = []
    for (const c of changes) {
      for (const b of data.buys.filter((x) => x.tradeId === c.tradeId)) buys.push({ ...b, markPrice: c.mark, markDate: now })
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

  function submit() {
    const m = parseNum(mark)
    void save(m !== null && m > 0 && m !== p.mark?.price ? [{ tradeId: p.id, mark: m }] : [], onClose)
  }

  return (
    <Sheet
      title="현재가 기록"
      onClose={onClose}
      leading={<button type="button" className="bar-button" onClick={onClose}>취소</button>}
      trailing={<button type="button" className="bar-button bold" disabled={busy} onClick={submit}>저장</button>}
    >
      <FormSection title={`${p.assetName} · 평단 ${price(p.nativeAverageBuyPrice, p.currency)}`} footer={`${NOTE} 같은 종목의 모든 매수 건(1-1, 1-2…)에 같은 현재가가 적용돼요. 손절가는 매수 기록에 쓴 값 그대로라 여기서 바꿀 수 없어요.`}>
        <FieldRow label="현재가">
          <NumberField label="현재가" value={mark} onChange={setMark} unit={unit} decimal={p.isForeign} />
        </FieldRow>
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
      <FormSection footer={`${NOTE} 고친 종목만 오늘 날짜로 기록돼요.`}>
        {positions.map((p) => (
          <FieldRow key={p.id} label={p.assetName}>
            <NumberField label={`${p.assetName} 현재가`} placeholder="현재가" value={texts[p.id] ?? ''} onChange={(v) => setTexts((t) => ({ ...t, [p.id]: v }))} unit={p.isForeign ? '$' : '원'} decimal={p.isForeign} />
          </FieldRow>
        ))}
      </FormSection>
    </Sheet>
  )
}
