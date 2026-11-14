import { describe, expect, it } from 'vitest'
import { cardOrder, HOME_CARDS } from './cardOrder'

describe('현황 카드 순서', () => {
  it('저장한 적 없으면 기본 순서 — 수익 분포 → 총자산 추이 → 확인표 → 승급 심사 → 포트폴리오 → 보유 자산', () => {
    expect(cardOrder(null)).toEqual(['returnDistribution', 'trend', 'checklist', 'tierReview', 'portfolio', 'holdings'])
    expect(cardOrder('')).toEqual([...HOME_CARDS])
  })
  it('순서를 저장해 둔 계정에 새로 생긴 승급 심사 카드는 맨 앞에 붙는다', () => {
    expect(cardOrder('holdings,portfolio,returnDistribution,trend,checklist')).toEqual([
      'tierReview',
      'holdings',
      'portfolio',
      'returnDistribution',
      'trend',
      'checklist',
    ])
  })
  it('저장된 순서는 존중하고, 모르는 키는 버리고, 중복은 한 번만', () => {
    expect(cardOrder('checklist,nope,tierReview,checklist,trend')).toEqual(['checklist', 'tierReview', 'trend', 'returnDistribution', 'portfolio', 'holdings'])
  })
})
