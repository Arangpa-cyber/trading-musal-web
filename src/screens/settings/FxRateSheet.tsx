// 설정 환율 — 설정 탭과 현황(총자산 숫자 누르기)이 같이 쓴다. 저장하면 수동 입력값과 입력 시각이 기록되고,
// 이후 환전 기록이 생기면 그 환율이 더 최근 값으로 자동 적용된다. 총자산·경지엔 안 들어가는 참고값.
import { useState } from 'react'
import { errorMessage } from '../../state/backupActions'
import { useJournal } from '../../state/journal'
import { FieldRow, FormSection, NumberField, positive } from '../../ui/form'
import { rate, shortDate } from '../../ui/format'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/toast'

/** "1,358.12원 (10/5 갱신 · 자동)" */
export function fxRateText(fx: { rate: number; date: number; source: 'manual' | 'auto' } | null): string {
  return fx ? `${rate(fx.rate)} (${shortDate(fx.date)} 갱신 · ${fx.source === 'manual' ? '직접 입력' : '자동'})` : '미설정'
}

export function FxRateSheet({ onClose }: { onClose: () => void }) {
  const { data, snapshot, persist } = useJournal()
  const toast = useToast()
  const [text, setText] = useState('')

  async function save(manualFxRate: number) {
    try {
      await persist({ settings: { ...data.settings, manualFxRate, manualFxRateDate: manualFxRate > 0 ? Date.now() : 0 } })
      toast('환율 저장됨')
      onClose()
    } catch (e) {
      window.alert(`저장하지 못했어요: ${errorMessage(e)}`)
    }
  }

  return (
    <Sheet
      title="설정 환율"
      onClose={onClose}
      leading={<button type="button" className="bar-button" onClick={onClose}>취소</button>}
      trailing={
        <button type="button" className="bar-button bold" disabled={positive(text) === null} onClick={() => void save(positive(text)!)}>
          저장
        </button>
      }
    >
      <FormSection footer={'지금 시장 환율 참고값이에요. 총자산·경지는 바뀌지 않고(달러 예수금은 평균 매입 환율 원가), 현황의 "미실현 환차" 계산에만 써요.'}>
        <FieldRow label="지금 적용 중">
          <span className="muted small">{fxRateText(snapshot.fxRate)}</span>
        </FieldRow>
        <FieldRow label="1$ =">
          <NumberField label="설정 환율" value={text} onChange={setText} placeholder="환율" unit="원" decimal autoFocus />
        </FieldRow>
      </FormSection>
      {data.settings.manualFxRate > 0 && (
        <FormSection>
          <button type="button" className="form-row text-row" onClick={() => void save(0)}>
            마지막 환전 환율로 되돌리기
          </button>
        </FormSection>
      )}
    </Sheet>
  )
}
