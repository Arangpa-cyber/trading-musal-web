// 로그인 뒤 화면 — 내 데이터를 불러와 온보딩(별호) 또는 요약을 보여주고, 백업 가져오기·내보내기·초기화를 한다.
import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { backupFileName, buildSnapshot, exportBackup, parseBackup, type ImportResult, type JournalData } from '../core'
import { eraseJournal, loadJournal, replaceJournal } from '../data/store'
import { signOut } from '../data/useSession'
import { OnboardingScreen } from './OnboardingScreen'
import { SummaryView } from './SummaryView'

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: JournalData }

const message = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e))

export function JournalScreen({ session }: { session: Session }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 파일 선택은 화면에 하나만 둔다(온보딩·요약 공용).
  const fileInput = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      setLoad({ state: 'ready', data: await loadJournal() })
    } catch (e) {
      setLoad({ state: 'error', message: message(e) })
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload, session.user.id])

  const snapshot = useMemo(() => (load.state === 'ready' ? buildSnapshot(load.data) : null), [load])

  async function importFile(file: File) {
    let parsed: ImportResult
    try {
      parsed = parseBackup(await file.text())
    } catch (e) {
      setNotice(message(e))
      return
    }
    const d = parsed.data
    const summary = `매수 ${d.buys.length}건 · 매도 ${d.sells.length}건 · 예수금 ${d.cash.length}건 · 메모 ${d.journals.length}개`
    const hasData = load.state === 'ready' && load.data.buys.length + load.data.sells.length + load.data.cash.length + load.data.journals.length > 0
    if (!window.confirm(`${parsed.kind === 'ios' ? 'iOS 앱' : '웹'} 백업: ${summary}\n\n${hasData ? '지금 계정의 기록을 모두 지우고 이 백업으로 바꿀까요?' : '이 백업을 가져올까요?'}`)) return
    setBusy(true)
    try {
      // 백업에 프로필이 없으면 지금 프로필을 둔다(온보딩이 다시 뜨지 않게).
      await replaceJournal(d)
      await reload()
      const warn = parsed.kind === 'ios' && parsed.report.warnings.length ? `\n확인 필요: ${parsed.report.warnings.join(' / ')}` : ''
      setNotice(`가져왔어요 — ${summary}${warn}`)
    } catch (e) {
      setNotice(`가져오지 못했어요: ${message(e)}`)
    } finally {
      setBusy(false)
    }
  }

  function exportFile() {
    if (load.state !== 'ready') return
    const blob = new Blob([exportBackup(load.data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = backupFileName()
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function erase() {
    if (!window.confirm('매수·매도·예수금·메모를 모두 지울까요? 되돌릴 수 없어요. (별호·설정은 남아요)')) return
    setBusy(true)
    try {
      await eraseJournal()
      await reload()
      setNotice('모든 기록을 지웠어요.')
    } catch (e) {
      setNotice(`지우지 못했어요: ${message(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const picker = (
    <input
      ref={fileInput}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) void importFile(file)
      }}
    />
  )

  if (load.state === 'loading') return <main className="center"><p className="muted">불러오는 중…</p></main>
  if (load.state === 'error') {
    return (
      <main className="center">
        <p className="warn">데이터를 불러오지 못했어요: {load.message}</p>
        <button onClick={() => void reload()}>다시 시도</button>
        <button className="link" onClick={() => void signOut()}>로그아웃</button>
      </main>
    )
  }

  if (!load.data.profile) {
    return (
      <>
        {picker}
        <OnboardingScreen onDone={() => void reload()} onImport={() => fileInput.current?.click()} />
        {notice && <p className="warn center-text">{notice}</p>}
      </>
    )
  }

  return (
    <main>
      {picker}
      <header className="bar">
        <h1>트레이딩:무살</h1>
        <span className="muted">{load.data.profile.nickname} · {session.user.email}</span>
      </header>
      {notice && <p className="notice">{notice}</p>}
      {snapshot && <SummaryView snapshot={snapshot} />}

      <section>
        <h2>데이터</h2>
        <div className="actions">
          <button onClick={() => fileInput.current?.click()} disabled={busy}>백업 가져오기 (iOS · 웹)</button>
          <button onClick={exportFile} disabled={busy}>백업 내보내기</button>
          <button className="danger" onClick={() => void erase()} disabled={busy}>데이터 초기화</button>
          <button className="link" onClick={() => void signOut()}>로그아웃</button>
        </div>
        <p className="muted">화면(현황·거래내역·입력·설정)은 다음 단계에서 만들어요. 지금은 저장과 계산이 맞는지 확인하는 화면이에요.</p>
      </section>
    </main>
  )
}
