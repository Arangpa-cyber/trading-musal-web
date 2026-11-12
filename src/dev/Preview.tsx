import { useState } from 'react'
import { AppShell } from '../screens/AppShell'
import { JournalProvider } from '../state/journal'
import { sampleData } from './sampleData'

/** 개발용 — 예시 데이터로 앱 틀을 띄운다(저장 안 됨). */
export default function Preview() {
  const [data] = useState(sampleData)
  return (
    <JournalProvider data={data} reload={async () => {}}>
      <AppShell email="preview@example.com" />
    </JournalProvider>
  )
}
