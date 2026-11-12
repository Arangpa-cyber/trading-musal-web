// 기록 삭제 확인 — 거래내역 메뉴 "삭제"와 수정 화면 "이 기록 삭제"가 같은 확인 창을 쓴다.
// 매수는 매수별 매도 규칙(`buyDeletePlan`)으로 같이 지울 매도·메모를 정하고, 장부가 꼬이면 막는다.
import { useState, type ReactNode } from 'react'
import { buyDeletePlan, deletePlanMessage } from '../../core'
import { errorMessage } from '../../state/backupActions'
import { useJournal } from '../../state/journal'
import type { EditTarget } from '../../state/sheets'
import { Alert } from '../../ui/Sheet'
import { useToast } from '../../ui/toast'

const TITLE = { buy: '이 매수 기록을 삭제할까요?', sell: '이 매도 기록을 삭제할까요?', cash: '이 예수금 기록을 삭제할까요?' }

export function useDeleteFlow(onDeleted?: () => void): { ask: (target: EditTarget) => void; alert: ReactNode } {
  const { data, remove } = useJournal()
  const toast = useToast()
  const [target, setTarget] = useState<EditTarget | null>(null)

  let alert: ReactNode = null
  if (target) {
    const close = () => setTarget(null)
    const run = async (removals: Parameters<typeof remove>[0]) => {
      close()
      try {
        await remove(removals)
        toast('삭제됨')
        onDeleted?.()
      } catch (e) {
        window.alert(`삭제하지 못했어요: ${errorMessage(e)}`)
      }
    }
    if (target.kind === 'buy') {
      const buy = data.buys.find((b) => b.id === target.id)
      if (buy) {
        const plan = buyDeletePlan(buy, data.buys, data.sells, data.journals)
        alert = plan.blockedReason ? (
          <Alert title="이 매수 기록은 지울 수 없어요" message={plan.blockedReason} actions={[{ label: '확인', primary: true, onSelect: close }]} />
        ) : (
          <Alert
            title={TITLE.buy}
            message={deletePlanMessage(plan)}
            actions={[
              { label: '취소', onSelect: close },
              { label: '삭제', destructive: true, onSelect: () => void run({ buys: [buy.id], sells: plan.sells.map((s) => s.id), journals: plan.memos.map((m) => m.id) }) },
            ]}
          />
        )
      }
    } else {
      alert = (
        <Alert
          title={TITLE[target.kind]}
          message="되돌릴 수 없어요."
          actions={[
            { label: '취소', onSelect: close },
            { label: '삭제', destructive: true, onSelect: () => void run(target.kind === 'sell' ? { sells: [target.id] } : { cash: [target.id] }) },
          ]}
        />
      )
    }
  }
  return { ask: setTarget, alert }
}
