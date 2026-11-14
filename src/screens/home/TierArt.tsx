// 경지 그림 부품 — 경지 카드의 히어로(큰 한자·수묵 번짐·금빛 붓 줄·낙관 서명)와 죽간 띠, 낙관(로그인 화면과 같은 도장),
// 승급·주화입마 연출 모달. 한자는 `core/tier.ts`의 TIER_HANJA.
import { createPortal } from 'react-dom'
import { hanjaLines, TIER_HANJA, tierName, type SkillTier } from '../../core'

export type SealVariant = 'normal' | 'warn' | 'gold'

/** 낙관 — 한자 두 줄(二/流). 빨강 · 주황 점선(주화입마) · 금빛(승급). */
export function TierSeal({ tier, variant = 'normal', size = 40 }: { tier: SkillTier; variant?: SealVariant; size?: number }) {
  const [a, b] = hanjaLines(tier)
  return (
    <span className={`tier-seal ${variant}`} style={{ fontSize: size }} aria-hidden="true">
      {a}
      <br />
      {b}
    </span>
  )
}

/** 경지 카드 히어로 — 큰 한자 + 수묵 번짐 + 금빛 붓 줄 + 작은 낙관 서명(한글 경지명). */
export function TierHero({ tier }: { tier: SkillTier }) {
  return (
    <>
      <div className="tier-hero" role="img" aria-label={`현재 경지 ${tierName(tier)}`}>
        <span className="tier-wash a" />
        <span className="tier-wash b" />
        <span className="tier-hanja">{TIER_HANJA[tier]}</span>
        <span className="tier-sign">{tierName(tier)}</span>
      </div>
      <div className="tier-brush" aria-hidden="true" />
    </>
  )
}

/** 죽간 띠 — 아홉 경지를 끈으로 엮은 죽간으로. 지나온 경지는 먹색, 현재는 금빛으로 올라오고, 남은 경지는 윤곽만. */
export function TierSlips({ tier }: { tier: SkillTier }) {
  return (
    <div className="tier-slips" role="img" aria-label={`경지 단계 — 현재 ${tierName(tier)}`}>
      {TIER_HANJA.map((h, i) => (
        <span key={h} className={`tier-slip ${i < tier ? 'passed' : i === tier ? 'current' : ''}`}>
          {h}
        </span>
      ))}
    </div>
  )
}

/**
 * 승급 · 주화입마 연출 — 한 번 뜨는 알림. 승급(up) = 금빛 낙관이 도장 찍히며 먹 물결이 번진다.
 * 경고(warn) = 어두운 배경에 주황 점선 낙관이 흔들리고 금이 간다(주화입마·퇴보·강등). 모션 줄이기 설정이면 정지 화면.
 */
export function TierEventModal({ kind, tier, title, message, onClose }: { kind: 'up' | 'warn'; tier: SkillTier; title: string; message: string; onClose: () => void }) {
  return createPortal(
    <div className={`sheet-backdrop alert-backdrop tier-event ${kind}`}>
      <div className="alert" role="alertdialog" aria-modal aria-label={title}>
        <div className="tier-event-seal">
          {kind === 'up' && (
            <>
              <span className="tier-ring" />
              <span className="tier-ring r2" />
            </>
          )}
          <TierSeal tier={tier} variant={kind === 'up' ? 'gold' : 'warn'} size={44} />
          {kind === 'warn' && (
            <svg className="tier-crack" viewBox="0 0 100 120" aria-hidden="true">
              <path d="M52 4 L44 34 L58 52 L40 80 L54 116" />
            </svg>
          )}
        </div>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="alert-actions">
          <button type="button" className="bold" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
