// 현황 카드 순서 — 프로필 헤더·경지는 고정, 나머지 카드는 설정 "현황 카드 순서 바꾸기"에서 바꾼다(설정·백업에 저장).
// 키는 iOS 백업의 homeCardOrder와 같다(가져오면 순서가 그대로).
export const HOME_CARDS = ['holdings', 'portfolio', 'returnDistribution', 'trend', 'checklist'] as const
export type HomeCard = (typeof HOME_CARDS)[number]

export const HOME_CARD_TITLE: Record<HomeCard, string> = {
  holdings: '보유 자산',
  portfolio: '포트폴리오 구성',
  returnDistribution: '수익 분포',
  trend: '총자산 추이',
  checklist: '확인표',
}

/** 저장된 순서 — 모르는 키는 버리고, 빠진 카드는 기본 순서대로 뒤에 붙인다. */
export function cardOrder(stored: string | null): HomeCard[] {
  const saved = (stored ?? '').split(',').filter((k): k is HomeCard => (HOME_CARDS as readonly string[]).includes(k))
  return [...new Set([...saved, ...HOME_CARDS])]
}
