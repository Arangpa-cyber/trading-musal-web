import { useSession } from './data/useSession'
import { JournalScreen } from './screens/JournalScreen'
import { LoginScreen } from './screens/LoginScreen'

export default function App() {
  const session = useSession()
  if (session === undefined) return <main className="center"><p className="muted">불러오는 중…</p></main>
  if (session === null) return <LoginScreen />
  return <JournalScreen key={session.user.id} session={session} />
}
