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
    <main className="center login-screen">
      <img className="app-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={96} height={96} />
      <h1>트레이딩:무살</h1>
      <div className="login-tagline">
        <span className="login-tagline-rule" aria-hidden="true" />
        <b>무림에서 살아남기</b>
        <span className="login-tagline-rule" aria-hidden="true" />
      </div>
      <p className="login-motto">
        <span className="loss">손실</span>은 짧게, <span className="gain">수익</span>은 길게
        <br />
        <span className="loss">손실</span>은 내가, <span className="gain">수익</span>은 시장이
      </p>
      <div className="login-seal-spacer">
        <div className="login-seal" aria-hidden="true">
          武
          <br />
          殺
        </div>
      </div>
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
