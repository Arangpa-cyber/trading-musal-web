import { useState } from 'react'
import { signInWithGoogle } from '../data/useSession'

export function LoginScreen() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function start() {
    setBusy(true)
    try {
      await signInWithGoogle() // 구글 로그인 화면으로 넘어갔다가 돌아온다
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <main className="center">
      <img className="app-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={96} height={96} />
      <h1>트레이딩:무살</h1>
      <p className="muted">무림에서 살아남기 — 손실은 내가 통제하고, 이익은 시장이 준다.</p>
      <button className="primary" onClick={start} disabled={busy}>
        {busy ? '구글로 이동 중…' : '구글로 시작하기'}
      </button>
      {error && <p className="warn">{error}</p>}
      <a className="link small" href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener">
        개인정보 처리방침
      </a>
    </main>
  )
}
