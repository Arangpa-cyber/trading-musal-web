// 현황 카드 순서 바꾸기 — 위·아래 화살표로 옮기고 "완료"하면 저장(설정·백업 포함). 프로필 헤더·경지는 항상 맨 위.
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../state/backupActions'
import { useJournal } from '../../state/journal'
import { FormSection } from '../../ui/form'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/toast'
import { cardOrder, HOME_CARD_TITLE, type HomeCard } from './cardOrder'

export function CardOrderSheet({ onClose }: { onClose: () => void }) {
  const { data, persist } = useJournal()
  const toast = useToast()
  const [order, setOrder] = useState<HomeCard[]>(() => cardOrder(data.settings.homeCardOrder))
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const next = [...o]
      ;[next[i], next[i + d]] = [next[i + d], next[i]]
      return next
    })

  async function save() {
    const value = order.join(',')
    if (value !== cardOrder(data.settings.homeCardOrder).join(',')) {
      try {
        await persist({ settings: { ...data.settings, homeCardOrder: value } })
        toast('카드 순서 저장됨')
      } catch (e) {
        window.alert(`저장하지 못했어요: ${errorMessage(e)}`)
        return
      }
    }
    onClose()
  }

  return (
    <Sheet
      title="현황 카드 순서"
      onClose={onClose}
      leading={<button type="button" className="bar-button" onClick={onClose}>취소</button>}
      trailing={<button type="button" className="bar-button bold" onClick={() => void save()}>완료</button>}
    >
      <FormSection footer="프로필·경지 카드는 항상 맨 위에 있어요.">
        {order.map((card, i) => (
          <div key={card} className="form-row row-between">
            <span>{HOME_CARD_TITLE[card]}</span>
            <span className="pills">
              <button type="button" className="icon-button small-icon tone-accent" aria-label={`${HOME_CARD_TITLE[card]} 위로`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={18} />
              </button>
              <button type="button" className="icon-button small-icon tone-accent" aria-label={`${HOME_CARD_TITLE[card]} 아래로`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={18} />
              </button>
            </span>
          </div>
        ))}
      </FormSection>
    </Sheet>
  )
}
