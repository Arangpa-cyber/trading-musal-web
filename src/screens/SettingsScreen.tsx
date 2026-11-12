// 설정 — 지금은 계정·데이터 백업·초기화만. 매매 기본값·경고 기준·수수료율·환율·원칙·가이드는 4-5단계에서 더한다.
import { useRef, useState } from 'react'
import { eraseJournal } from '../data/store'
import { signOut } from '../data/useSession'
import { downloadBackup, errorMessage, importBackupFile } from '../state/backupActions'
import { useJournal } from '../state/journal'

export function SettingsScreen({ email }: { email: string | undefined }) {
  const { data, reload } = useJournal()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function run(task: () => Promise<string | null>) {
    setBusy(true)
    try {
      const message = await task()
      if (message) setNotice(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="group">
        <div className="group-title">계정</div>
        <div className="group-row">
          <span>별호</span>
          <span className="muted">{data.profile?.nickname}</span>
        </div>
        <div className="group-row">
          <span>구글 계정</span>
          <span className="muted ellipsis">{email}</span>
        </div>
        <button type="button" className="group-row button" onClick={() => void signOut()}>
          로그아웃
        </button>
      </div>

      <div className="group">
        <div className="group-title">데이터 백업</div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file)
              void run(async () => {
                const message = await importBackupFile(file, data)
                if (message?.startsWith('가져왔어요')) await reload()
                return message
              })
          }}
        />
        <button type="button" className="group-row button" disabled={busy} onClick={() => downloadBackup(data)}>
          백업 내보내기
        </button>
        <button type="button" className="group-row button" disabled={busy} onClick={() => fileInput.current?.click()}>
          백업 가져오기 (iOS 앱 · 웹)
        </button>
        <div className="group-footer">가져오면 지금 계정의 기록이 백업 내용으로 바뀌어요.</div>
      </div>

      <div className="group">
        <button
          type="button"
          className="group-row button destructive"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('매수·매도·예수금·메모를 모두 지울까요? 되돌릴 수 없어요. (별호·설정은 남아요)')) return
            void run(async () => {
              try {
                await eraseJournal()
                await reload()
                return '모든 기록을 지웠어요.'
              } catch (e) {
                return `지우지 못했어요: ${errorMessage(e)}`
              }
            })
          }}
        >
          데이터 초기화
        </button>
      </div>

      {notice && <p className="notice">{notice}</p>}
      <p className="muted small center-text">매매 기본값·경고 기준·수수료율·환율·원칙·가이드는 다음 단계에서 추가돼요.</p>
    </div>
  )
}
