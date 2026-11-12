import { useState } from 'react'
import { saveProfile } from '../data/store'

/**
 * 처음 온 사용자 — 별호만 정한다. 데이터는 하나도 넣지 않는다
 * (iOS에서 "프로필 없으면 온보딩 + 온보딩이 데이터를 심음"이 겹쳐 시드가 중복 삽입되던 버그의 교훈).
 */
export function OnboardingScreen({ onDone, onImport }: { onDone: () => void; onImport: () => void }) {
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const trimmed = nickname.trim()

  async function save() {
    setBusy(true)
    try {
      await saveProfile({ nickname: trimmed, tradingRules: '' })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <main className="center">
      <h1>강호에 오신 걸 환영해요</h1>
      <p className="muted">무림에서 쓸 별호(닉네임)를 정해 주세요. 나중에 설정에서 바꿀 수 있어요.</p>
      <input
        className="text"
        placeholder="별호"
        value={nickname}
        maxLength={20}
        onChange={(e) => setNickname(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && trimmed && save()}
      />
      <button className="primary" onClick={save} disabled={!trimmed || busy}>
        시작하기
      </button>
      <button className="link" onClick={onImport}>
        iOS 앱 백업이 있어요 — 가져오기
      </button>
      {error && <p className="warn">{error}</p>}
    </main>
  )
}
