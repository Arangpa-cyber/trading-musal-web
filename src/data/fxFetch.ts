// 원/달러 환율 자동 가져오기 — 앱을 열 때 하루 한 번(JournalScreen). 공개 환율 API에 환율만 요청한다(계정·거래 정보는 보내지 않는다).
// 첫 번째 API가 실패하면 두 번째로, 둘 다 안 되면 null(조용히 건너뛰고 직전 값을 그대로 쓴다).

const SOURCES: { url: string; pick: (json: unknown) => unknown }[] = [
  { url: 'https://open.er-api.com/v6/latest/USD', pick: (j) => (j as { rates?: { KRW?: unknown } }).rates?.KRW },
  { url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW', pick: (j) => (j as { rates?: { KRW?: unknown } }).rates?.KRW },
]

/** 원/달러 환율(소수 둘째 자리까지). 값이 상식 범위(500~3000)를 벗어나면 버린다. */
export async function fetchUsdKrw(): Promise<number | null> {
  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const value = source.pick(await res.json())
      if (typeof value === 'number' && value >= 500 && value <= 3000) return Math.round(value * 100) / 100
    } catch {
      // 다음 API로
    }
  }
  return null
}

/** 같은 날(기기 시간대)인지 — 하루 한 번만 가져오기 위해. */
export function isSameLocalDay(a: number, b: number): boolean {
  return a > 0 && new Date(a).toDateString() === new Date(b).toDateString()
}
