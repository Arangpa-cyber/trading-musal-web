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

/** 백업 가져오기 — 기록을 통째로 바꾼다(DB 함수 하나, 실패하면 아무것도 안 바뀜). 프로필이 null이면 지금 것을 둔다. */
export async function replaceJournal(data: JournalData): Promise<void> {
  const { error } = await supabase.rpc('replace_journal', { p: data })
  if (error) throw error
}

/** 데이터 초기화 — 매수·매도·예수금·메모를 지운다(프로필·설정은 남김). 지우기 진입점은 이것 하나. */
export async function eraseJournal(): Promise<void> {
  const { error } = await supabase.rpc('erase_journal')
  if (error) throw error
}
