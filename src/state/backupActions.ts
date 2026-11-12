// 백업 가져오기·내보내기 — 온보딩과 설정 화면이 같이 쓴다.
import { backupFileName, exportBackup, parseBackup, type ImportResult, type JournalData } from '../core'
import { replaceJournal } from '../data/store'

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)

/** 파일을 읽어 확인을 받은 뒤 계정 데이터를 통째로 바꾼다. 결과 문구를 돌려준다(취소하면 null). */
export async function importBackupFile(file: File, current: JournalData | null): Promise<string | null> {
  let parsed: ImportResult
  try {
    parsed = parseBackup(await file.text())
  } catch (e) {
    return errorMessage(e)
  }
  const d = parsed.data
  const summary = `매수 ${d.buys.length}건 · 매도 ${d.sells.length}건 · 예수금 ${d.cash.length}건 · 메모 ${d.journals.length}개`
  const hasData = !!current && current.buys.length + current.sells.length + current.cash.length + current.journals.length > 0
  const question = hasData ? '지금 계정의 기록을 모두 지우고 이 백업으로 바꿀까요?' : '이 백업을 가져올까요?'
  if (!window.confirm(`${parsed.kind === 'ios' ? 'iOS 앱' : '웹'} 백업: ${summary}\n\n${question}`)) return null
  try {
    // 백업에 프로필이 없으면 지금 프로필을 둔다(온보딩이 다시 뜨지 않게).
    await replaceJournal(d)
  } catch (e) {
    return `가져오지 못했어요: ${errorMessage(e)}`
  }
  const warn = parsed.kind === 'ios' && parsed.report.warnings.length ? `\n확인 필요: ${parsed.report.warnings.join(' / ')}` : ''
  return `가져왔어요 — ${summary}${warn}`
}

export function downloadBackup(data: JournalData): void {
  const blob = new Blob([exportBackup(data)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = backupFileName()
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
