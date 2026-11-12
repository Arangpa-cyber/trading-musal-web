import { lazy, Suspense } from 'react'
import { useSession } from './data/useSession'
import { JournalScreen } from './screens/JournalScreen'
import { LoginScreen } from './screens/LoginScreen'

// 개발 서버에서만 — 주소 끝 ?preview 로 로그인 없이 예시 데이터 화면(배포본엔 안 들어간다).
const Preview = import.meta.env.DEV ? lazy(() => import('./dev/Preview')) : null

export default function App() {
  const session = useSession()
  if (Preview && new URLSearchParams(window.location.search).has('preview')) {
    return (
      <Suspense>
        <Preview />
      </Suspense>
    )
  }
  if (session === undefined) return <main className="center"><p className="muted">불러오는 중…</p></main>
  if (session === null) return <LoginScreen />
  return <JournalScreen key={session.user.id} session={session} />
}
