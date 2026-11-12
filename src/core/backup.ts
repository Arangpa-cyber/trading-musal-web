// 웹 백업(JSON) 내보내기·가져오기. 가져오기는 웹 백업과 iOS 앱 백업을 모두 받는다.
import { BackupFormatError, importIosBackup, looksLikeIosBackup, type ImportReport } from './importIos'
import {
  DEFAULT_SETTINGS,
  orderSellReasons,
  type Buy,
  type CashTx,
  type JournalData,
  type JournalEntry,
  type Sell,
} from './types'

export const BACKUP_FORMAT = 'trading-musal-web'
export const BACKUP_VERSION = 1

export interface WebBackup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: JournalData
}

export function exportBackup(data: JournalData, now: number = Date.now()): string {
  const payload: WebBackup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), data }
  return JSON.stringify(payload, null, 2)
}

export function backupFileName(now: number = Date.now()): string {
  const d = new Date(now)
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `트레이딩무살_백업_${ymd}.json`
}

export type ImportResult =
  | { kind: 'web'; data: JournalData }
  | { kind: 'ios'; data: JournalData; report: ImportReport }

/** 백업 파일 글 → 데이터. 형식을 알아서 판별한다. */
export function parseBackup(text: string): ImportResult {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new BackupFormatError('JSON 파일을 읽을 수 없어요')
  }
  if (typeof obj === 'object' && obj !== null && (obj as { format?: unknown }).format === BACKUP_FORMAT) {
    return { kind: 'web', data: normalizeWebData((obj as WebBackup).data) }
  }
  if (looksLikeIosBackup(obj)) {
    const { data, report } = importIosBackup(obj)
    return { kind: 'ios', data, report }
  }
  throw new BackupFormatError('트레이딩:무살 백업 파일이 아니에요')
}

/** 웹 백업 데이터 — 나중에 생긴 필드는 기본값으로 채운다. */
function normalizeWebData(raw: Partial<JournalData> | undefined): JournalData {
  if (!raw || !Array.isArray(raw.buys) || !Array.isArray(raw.sells) || !Array.isArray(raw.cash)) {
    throw new BackupFormatError('백업 파일 내용이 비어 있거나 깨졌어요')
  }
  return {
    buys: raw.buys.map((b: Buy) => ({ ...b, markDate: b.markDate ?? null, fallbackRate: b.fallbackRate || 1 })),
    sells: raw.sells.map((s: Sell) => ({
      ...s,
      sellReasons: orderSellReasons(s.sellReasons ?? []),
      legacyReason: s.legacyReason ?? '',
      reasonNote: s.reasonNote ?? '',
      soldBuyIds: s.soldBuyIds ?? [],
    })),
    cash: raw.cash.map((t: CashTx) => ({ ...t, memo: t.memo ?? '', direction: t.direction ?? null })),
    journals: (raw.journals ?? []).map((j: JournalEntry) => ({ ...j })),
    profile: raw.profile ?? null,
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
  }
}
