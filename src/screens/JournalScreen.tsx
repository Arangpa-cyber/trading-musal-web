// 로그인 뒤 — 내 데이터를 불러와 온보딩(별호) 또는 앱 틀을 보여준다.
import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { JournalData } from '../core'
import { loadJournal, persistChanges, removeRecords } from '../data/store'
import { signOut } from '../data/useSession'
import { errorMessage, importBackupFile } from '../state/backupActions'
import { JournalProvider, type Changes, type Removals } from '../state/journal'
import { AppShell } from './AppShell'
import { OnboardingScreen } from './OnboardingScreen'

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: JournalData }

export function JournalScreen({ session }: { session: Session }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  // 온보딩의 백업 가져오기용 파일 선택(화면에 하나).
  const fileInput = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      setLoad({ state: 'ready', data: await loadJournal() })
    } catch (e) {
      setLoad({ state: 'error', message: errorMessage(e) })
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload, session.user.id])

  const persist = useCallback(
    async (changes: Changes) => {
      await persistChanges(changes)
      await reload()
    },
    [reload],
  )
  const remove = useCallback(
    async (removals: Removals) => {
      await removeRecords(removals)
      await reload()
    },
    [reload],
  )

  if (load.state === 'loading') return <main className="center"><p className="muted">불러오는 중…</p></main>
  if (load.state === 'error') {
    return (
      <main className="center">
        <p className="warn">데이터를 불러오지 못했어요: {load.message}</p>
        <button type="button" onClick={() => void reload()}>다시 시도</button>
        <button type="button" className="link" onClick={() => void signOut()}>로그아웃</button>
      </main>
    )
  }

  if (!load.data.profile) {
    return (
      <>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const message = await importBackupFile(file, load.data)
            if (message) setNotice(message)
            if (message?.startsWith('가져왔어요')) await reload()
          }}
        />
        <OnboardingScreen onDone={() => void reload()} onImport={() => fileInput.current?.click()} />
        {notice && <p className="warn center-text">{notice}</p>}
      </>
    )
  }

  return (
    <JournalProvider data={load.data} reload={reload} persist={persist} remove={remove}>
      <AppShell email={session.user.email} />
    </JournalProvider>
  )
}
