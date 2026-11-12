// 메모 — 한 거래(tradeId)에 쌓인 메모 목록(누르면 메뉴: 수정·삭제) + 작성/수정 화면(날짜·내용만).
// 시점(매수·보유·매도)은 메모를 연 위치로 자동(작성 화면에 고르는 칸 없음, 수정하면 원래 값 유지).
import { ExternalLink, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { fixedDateText, JOURNAL_CONTEXT_LABEL, memoAnchorId, type JournalContext, type JournalData, type JournalEntry, type Millis } from '../../core'
import { errorMessage } from '../../state/backupActions'
import { useJournal } from '../../state/journal'
import { useSheets } from '../../state/sheets'
import { Pill } from '../../ui/components'
import { FormSection } from '../../ui/form'
import { Menu } from '../../ui/Menu'
import { Alert, Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/toast'

/** 메모 삭제 확인 — 메모 목록·자산 상세 공용. */
export function useMemoDelete() {
  const { remove } = useJournal()
  const toast = useToast()
  const [target, setTarget] = useState<JournalEntry | null>(null)
  const alert = target && (
    <Alert
      title="메모를 삭제할까요?"
      message="삭제한 메모는 되돌릴 수 없어요."
      actions={[
        { label: '취소', onSelect: () => setTarget(null) },
        {
          label: '삭제',
          destructive: true,
          onSelect: () => {
            const id = target.id
            setTarget(null)
            remove({ journals: [id] }).then(
              () => toast('메모 삭제됨'),
              (e) => window.alert(`삭제하지 못했어요: ${errorMessage(e)}`),
            )
          },
        },
      ]}
    />
  )
  return { ask: setTarget, alert }
}

/**
 * 메모가 붙은 기록 — 매도 메모는 매도 카드, 매수·보유 메모는 매수 카드 중 작성 날짜의 기록(거래내역 카드 미리보기와 같은 규칙).
 */
export function memoRecordId(entry: JournalEntry, data: JournalData): string | null {
  const records = (entry.context === 'sell' ? data.sells : data.buys).filter((r) => r.tradeId === entry.tradeId)
  return memoAnchorId(entry.date, records)
}

/** 메모 한 줄 — 시점 알약·날짜·내용. 누르면 메뉴(거래 보기·수정·삭제). */
export function MemoRow({ entry, onEdit, onDelete }: { entry: JournalEntry; onEdit: () => void; onDelete: () => void }) {
  const { data } = useJournal()
  const { showRecord } = useSheets()
  const recordId = memoRecordId(entry, data)
  return (
    <Menu
      className="form-row memo-row"
      label="메모 메뉴"
      items={[
        ...(recordId ? [{ label: '거래 보기', icon: ExternalLink, onSelect: () => showRecord(recordId) }] : []),
        { label: '수정', icon: Pencil, onSelect: onEdit },
        { label: '삭제', icon: Trash2, destructive: true, onSelect: onDelete },
      ]}
    >
      <div className="row-between">
        <span className="pills">
          <Pill text={JOURNAL_CONTEXT_LABEL[entry.context]} />
          <span className="muted small">{fixedDateText(entry.date)}</span>
        </span>
      </div>
      <p className="memo-text">{entry.text}</p>
    </Menu>
  )
}

export function MemoThreadSheet({ tradeId, assetName, context, onClose }: { tradeId: string; assetName: string; context: JournalContext; onClose: () => void }) {
  const { data } = useJournal()
  const entries = data.journals.filter((j) => j.tradeId === tradeId).sort((a, b) => b.date - a.date)
  const [compose, setCompose] = useState<JournalEntry | 'new' | null>(null)
  const del = useMemoDelete()
  return (
    <Sheet
      title={`${assetName} 메모`}
      onClose={onClose}
      trailing={
        <button type="button" className="icon-button tone-accent" aria-label="새 메모" onClick={() => setCompose('new')}>
          <Plus size={24} />
        </button>
      }
    >
      {entries.length === 0 ? (
        <div className="empty">
          <NotebookPen size={40} className="tone-gold" />
          <p>아직 남긴 메모가 없어요. 오른쪽 위 + 버튼으로 첫 메모를 남겨보세요.</p>
        </div>
      ) : (
        <FormSection>
          {entries.map((e) => (
            <MemoRow key={e.id} entry={e} onEdit={() => setCompose(e)} onDelete={() => del.ask(e)} />
          ))}
        </FormSection>
      )}
      {compose && <MemoComposeSheet tradeId={tradeId} assetName={assetName} context={context} existing={compose === 'new' ? null : compose} onClose={() => setCompose(null)} />}
      {del.alert}
    </Sheet>
  )
}

const dateInput = (t: Millis) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function MemoComposeSheet({
  tradeId,
  assetName,
  context,
  existing,
  onClose,
}: {
  tradeId: string
  assetName: string
  context: JournalContext
  existing: JournalEntry | null
  onClose: () => void
}) {
  const { persist } = useJournal()
  const toast = useToast()
  const [date, setDate] = useState(existing?.date ?? Date.now())
  const [text, setText] = useState(existing?.text ?? '')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = text !== (existing?.text ?? '') || (existing !== null && date !== existing.date)
  const ctx = existing?.context ?? context
  const cancel = () => (dirty ? setConfirm(true) : onClose())

  async function save() {
    const trimmed = text.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const entry: JournalEntry = existing
        ? { ...existing, date, text: trimmed }
        : { id: crypto.randomUUID(), tradeId, assetName, date, text: trimmed, context: ctx }
      await persist({ journals: [entry] })
      onClose()
      toast('메모 저장됨')
    } catch (e) {
      window.alert(`저장하지 못했어요: ${errorMessage(e)}`)
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={assetName}
      onClose={onClose}
      blockDismiss={dirty}
      onAttemptDismiss={() => setConfirm(true)}
      leading={<button type="button" className="bar-button" onClick={cancel}>취소</button>}
      trailing={
        <button type="button" className="bar-button bold" disabled={!text.trim() || busy} onClick={() => void save()}>
          저장
        </button>
      }
    >
      <FormSection>
        <label className="form-row field-row">
          <span className="field-label">날짜</span>
          <input
            className="date-field"
            type="date"
            value={dateInput(date)}
            onChange={(e) => {
              if (!e.target.value) return
              const [y, m, d] = e.target.value.split('-').map(Number)
              const next = new Date(date)
              next.setFullYear(y, m - 1, d)
              setDate(next.getTime())
            }}
          />
        </label>
      </FormSection>
      <FormSection title={`${JOURNAL_CONTEXT_LABEL[ctx]} 메모`}>
        <textarea className="memo-editor" value={text} autoFocus onChange={(e) => setText(e.target.value)} aria-label="메모 내용" />
      </FormSection>
      {confirm && (
        <Alert
          title={existing ? '고친 내용을 버릴까요?' : '작성 중인 내용을 버릴까요?'}
          actions={[
            { label: existing ? '계속 수정' : '계속 작성', onSelect: () => setConfirm(false) },
            { label: '버리기', destructive: true, onSelect: onClose },
          ]}
        />
      )}
    </Sheet>
  )
}
