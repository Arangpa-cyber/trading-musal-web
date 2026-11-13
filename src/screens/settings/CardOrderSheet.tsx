// 현황 카드 순서 바꾸기 — iOS처럼 줄을 위아래로 끌어서 옮긴다(오른쪽 ≡ 손잡이). 놓는 순간 저장(설정·백업 포함).
// 현황 화면에서 바로 끌면 보유 자산 카드 안 종목(탭 = 메뉴)과 손동작이 겹쳐서 여기서 따로 바꾼다.
import { GripVertical } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { errorMessage } from '../../state/backupActions'
import { useJournal } from '../../state/journal'
import { FormSection } from '../../ui/form'
import { Sheet } from '../../ui/Sheet'
import { cardOrder, HOME_CARD_TITLE, type HomeCard } from '../home/cardOrder'

const ROW_HEIGHT = 48

export function CardOrderSheet({ onClose }: { onClose: () => void }) {
  const { data, persist } = useJournal()
  const [order, setOrder] = useState<HomeCard[]>(() => cardOrder(data.settings.homeCardOrder))
  const drag = useRef<{ card: HomeCard; startY: number; startIndex: number } | null>(null)
  const [dragging, setDragging] = useState<HomeCard | null>(null)
  const [offset, setOffset] = useState(0)

  function down(e: PointerEvent<HTMLSpanElement>, card: HomeCard) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { card, startY: e.clientY, startIndex: order.indexOf(card) }
    setDragging(card)
    setOffset(0)
  }

  function move(e: PointerEvent<HTMLSpanElement>) {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    const target = Math.max(0, Math.min(order.length - 1, d.startIndex + Math.round(dy / ROW_HEIGHT)))
    const current = order.indexOf(d.card)
    if (target !== current) {
      const next = order.filter((c) => c !== d.card)
      next.splice(target, 0, d.card)
      setOrder(next)
    }
    // 잡은 줄은 손가락을 따라가고, 자리가 바뀐 만큼은 이미 옮겨졌으니 뺀다.
    setOffset(dy - (target - d.startIndex) * ROW_HEIGHT)
  }

  async function up() {
    drag.current = null
    setDragging(null)
    setOffset(0)
    const value = order.join(',')
    if (value === cardOrder(data.settings.homeCardOrder).join(',')) return
    try {
      await persist({ settings: { ...data.settings, homeCardOrder: value } })
    } catch (e) {
      window.alert(`저장하지 못했어요: ${errorMessage(e)}`)
    }
  }

  return (
    <Sheet title="카드 순서 바꾸기" onClose={onClose}>
      <FormSection footer="오른쪽 ≡를 누른 채 위아래로 끌면 순서가 바뀌어요. 프로필·경지 카드는 항상 맨 위예요.">
        {order.map((card) => (
          <div
            key={card}
            className={`form-row row-between order-row ${dragging === card ? 'dragging' : ''}`}
            style={{ height: ROW_HEIGHT, transform: dragging === card ? `translateY(${offset}px)` : undefined }}
          >
            <span>{HOME_CARD_TITLE[card]}</span>
            <span
              className="drag-handle"
              role="button"
              aria-label={`${HOME_CARD_TITLE[card]} 옮기기`}
              onPointerDown={(e) => down(e, card)}
              onPointerMove={move}
              onPointerUp={() => void up()}
              onPointerCancel={() => void up()}
            >
              <GripVertical size={20} />
            </span>
          </div>
        ))}
      </FormSection>
    </Sheet>
  )
}
