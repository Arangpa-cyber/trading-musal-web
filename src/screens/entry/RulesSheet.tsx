// 원칙 — 계속 고쳐 쓰는 개인 매매 규칙 글 하나. 읽기 모드(끝까지 스크롤·복사) 기본, 오른쪽 위 연필로 수정 모드.
import { ListChecks, Pencil, Check } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../state/backupActions'
import { useJournal } from '../../state/journal'
import { InkDivider } from '../../ui/components'
import { Sheet } from '../../ui/Sheet'

export function RulesSheet({ onClose }: { onClose: () => void }) {
  const { data, persist } = useJournal()
  const saved = data.profile?.tradingRules ?? ''
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(saved)
  const [error, setError] = useState<string | null>(null)

  async function finish() {
    if (text !== saved) {
      try {
        await persist({ profile: { nickname: data.profile?.nickname ?? '', tradingRules: text } })
      } catch (e) {
        setError(`저장하지 못했어요: ${errorMessage(e)}`)
        return
      }
    }
    setEditing(false)
  }

  return (
    <Sheet
      title="원칙"
      onClose={onClose}
      blockDismiss={editing && text !== saved}
      onAttemptDismiss={() => void finish().then(onClose)}
      trailing={
        <button type="button" className="icon-button tone-accent" aria-label={editing ? '수정 완료' : '원칙 수정'} onClick={() => (editing ? void finish() : setEditing(true))}>
          {editing ? <Check size={22} /> : <Pencil size={20} />}
        </button>
      }
    >
      <div className="rules">
        <InkDivider />
        {editing ? (
          <textarea className="rules-editor" value={text} autoFocus onChange={(e) => setText(e.target.value)} placeholder="나만의 매매 원칙을 적어요" />
        ) : saved ? (
          <p className="rules-text">{saved}</p>
        ) : (
          <div className="empty">
            <ListChecks size={48} className="tone-muted" />
            <p>오른쪽 위 연필을 눌러 첫 원칙을 남겨보세요</p>
          </div>
        )}
        {error && <p className="form-note tone-orange">{error}</p>}
      </div>
    </Sheet>
  )
}
