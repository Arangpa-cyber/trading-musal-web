// 현황 카드 순서 — 프로필 헤더·경지는 고정, 나머지 카드(승급 심사 포함)는 설정 "현황 카드 순서 바꾸기"에서 바꾼다(설정·백업에 저장).
// 키는 iOS 백업의 homeCardOrder와 같다(가져오면 순서가 그대로).
/** 기본 순서 — 수익 분포 → 총자산 추이 → 확인표 → 승급 심사 → 포트폴리오 구성 → 보유 자산(2026-11-14). */
export const HOME_CARDS = ['returnDistribution', 'trend', 'checklist', 'tierReview', 'portfolio', 'holdings'] as const
/** 순서를 이미 저장한 계정에 새로 생긴 카드는 맨 앞에 붙인다(맨 뒤에 붙으면 아래로 묻혀 안 보인다). */
const NEW_CARDS_FIRST: readonly string[] = ['tierReview']
export type HomeCard = (typeof HOME_CARDS)[number]

export const HOME_CARD_TITLE: Record<HomeCard, string> = {
  tierReview: '승급 심사',
  holdings: '보유 자산',
  portfolio: '포트폴리오 구성',
  returnDistribution: '수익 분포',
  trend: '총자산 추이',
  checklist: '확인표',
}

/** 저장된 순서 — 모르는 키는 버리고, 빠진 카드는 새 카드(승급 심사)만 맨 앞, 나머지는 기본 순서대로 뒤에 붙인다. 저장한 적 없으면 기본 순서. */
export function cardOrder(stored: string | null): HomeCard[] {
  const saved = [...new Set((stored ?? '').split(',').filter((k): k is HomeCard => (HOME_CARDS as readonly string[]).includes(k)))]
  if (!saved.length) return [...HOME_CARDS]
  const missing = HOME_CARDS.filter((c) => !saved.includes(c))
  return [...missing.filter((c) => NEW_CARDS_FIRST.includes(c)), ...saved, ...missing.filter((c) => !NEW_CARDS_FIRST.includes(c))]
}
