// 저장소 — Supabase 테이블과 웹 형식(src/core/types.ts) 사이를 옮긴다. 계산은 하지 않는다.
import { DEFAULT_SETTINGS, type Buy, type CashTx, type JournalData, type JournalEntry, type Profile, type Sell, type Settings } from '../core'
import { supabase } from './supabase'

/** 기록 테이블 이름 ↔ JournalData 키. */
export const RECORD_TABLES = { buys: 'buys', sells: 'sells', cash: 'cash_txs', journals: 'journals' } as const
export type RecordKind = keyof typeof RECORD_TABLES
type RecordOf<K extends RecordKind> = JournalData[K][number]

const PAGE = 1000

/** 한 테이블의 내 기록 전부(1,000건씩 나눠 읽는다). */
async function loadTable<T>(table: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('data').order('id').range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data as { data: T }[]).map((r) => r.data))
    if (data.length < PAGE) return rows
  }
}

/** 로그인한 사용자의 데이터 전부. */
export async function loadJournal(): Promise<JournalData> {
  const [buys, sells, cash, journals, profileRes, settingsRes] = await Promise.all([
    loadTable<Buy>(RECORD_TABLES.buys),
    loadTable<Sell>(RECORD_TABLES.sells),
    loadTable<CashTx>(RECORD_TABLES.cash),
    loadTable<JournalEntry>(RECORD_TABLES.journals),
    supabase.from('profiles').select('nickname, trading_rules, created_at').maybeSingle(),
    supabase.from('settings').select('data').maybeSingle(),
  ])
  if (profileRes.error) throw profileRes.error
  if (settingsRes.error) throw settingsRes.error
  const p = profileRes.data
  const profile: Profile | null = p
    ? { nickname: p.nickname, tradingRules: p.trading_rules, createdAt: Date.parse(p.created_at) }
    : null
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((settingsRes.data?.data as Partial<Settings>) ?? {}) }
  return { buys, sells, cash, journals, profile, settings }
}

/** 기록 저장(새로 넣기·고치기 공용). */
export async function saveRecords<K extends RecordKind>(kind: K, records: RecordOf<K>[]): Promise<void> {
  if (!records.length) return
  const rows = records.map((r) => ({ id: r.id, data: r, updated_at: new Date().toISOString() }))
  const { error } = await supabase.from(RECORD_TABLES[kind]).upsert(rows, { onConflict: 'user_id,id' })
  if (error) throw error
}

/** 기록 지우기. */
export async function deleteRecords(kind: RecordKind, ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from(RECORD_TABLES[kind]).delete().in('id', ids)
  if (error) throw error
}

export async function saveProfile(profile: Pick<Profile, 'nickname' | 'tradingRules'>): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .upsert({ nickname: profile.nickname, trading_rules: profile.tradingRules }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function saveSettings(settings: Settings): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({ data: settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}

/** 여러 종류를 한 번에 저장 — 환전(예수금) → 매수 → 매도 → 메모 순(같이 기록한 환전이 매수보다 먼저). */
export async function persistChanges(changes: import('../state/journal').Changes): Promise<void> {
  await saveRecords('cash', changes.cash ?? [])
  await saveRecords('buys', changes.buys ?? [])
  await saveRecords('sells', changes.sells ?? [])
  await saveRecords('journals', changes.journals ?? [])
  if (changes.profile) await saveProfile(changes.profile)
  if (changes.settings) await saveSettings(changes.settings)
}

/** 여러 종류를 한 번에 지우기 — 매도 → 매수 순(판 매수를 가리키는 매도를 먼저). */
export async function removeRecords(removals: import('../state/journal').Removals): Promise<void> {
  await deleteRecords('sells', removals.sells ?? [])
  await deleteRecords('buys', removals.buys ?? [])
  await deleteRecords('cash', removals.cash ?? [])
  await deleteRecords('journals', removals.journals ?? [])
}

/** 백업 가져오기 — 기록을 통째로 바꾼다(DB 함수 하나, 실패하면 아무것도 안 바뀜). 프로필이 null이면 지금 것을 둔다. */
export async function replaceJournal(data: JournalData): Promise<void> {
  const { error } = await supabase.rpc('replace_journal', { p: data })
  if (error) throw error
}

/** 기록(매수·매도·예수금·메모)만 지운다 — 백업 가져오기가 DB 함수 안에서 같이 쓴다. */
export async function eraseJournal(): Promise<void> {
  const { error } = await supabase.rpc('erase_journal')
  if (error) throw error
}

/**
 * 데이터 초기화(설정) — 기록과 프로필(별호·원칙)까지 지운다(iOS와 같게). 다음에 열면 별호 정하기부터.
 * 설정(매매 기본값 등)은 남는다. 지우기 진입점은 이것과 `eraseJournal` 둘뿐이다.
 */
export async function eraseAll(): Promise<void> {
  await eraseJournal()
  const { error } = await supabase.from('profiles').delete().not('user_id', 'is', null)
  if (error) throw error
}

/** 회원 탈퇴 — 로그인 계정과 모든 기록·프로필·설정을 지운다(DB 함수 `delete_account`, 되돌릴 수 없음). 끝나면 이 기기에서도 로그아웃. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_account')
  if (error) throw error
  await supabase.auth.signOut({ scope: 'local' }) // 계정이 없어져 서버 로그아웃은 실패하므로 이 기기 세션만 지운다
}
