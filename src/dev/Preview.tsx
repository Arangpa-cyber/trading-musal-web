import { useCallback, useState } from 'react'
import { AppShell } from '../screens/AppShell'
import { applyChanges, JournalProvider, type Changes, type Removals } from '../state/journal'
import { sampleData } from './sampleData'

/** 개발용 — 예시 데이터로 앱 틀을 띄운다(저장은 메모리에만, 새로고침하면 처음으로). */
export default function Preview() {
  const [data, setData] = useState(sampleData)
  const persist = useCallback(async (changes: Changes) => setData((d) => applyChanges(d, changes)), [])
  const remove = useCallback(async (removals: Removals) => setData((d) => applyChanges(d, {}, removals)), [])
  return (
    <JournalProvider data={data} reload={async () => {}} persist={persist} remove={remove}>
      <AppShell email="preview@example.com" />
    </JournalProvider>
  )
}
