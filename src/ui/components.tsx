// 공용 부품 — 카드·머리글·알약·칸 격자. 화면마다 따로 만들지 않고 여기 것을 쓴다.
import type { ComponentType, ReactNode } from 'react'
import type { Tone } from './format'

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>

const toneClass = (tone: Tone | undefined) => (tone && tone !== 'default' ? `tone-${tone}` : '')

/** 독립된 둥근 카드(현황). `highlighted` = 금색 테두리(경지). */
export function Card({ children, highlighted, onClick, className = '' }: { children: ReactNode; highlighted?: boolean; onClick?: () => void; className?: string }) {
  const cls = `card ${highlighted ? 'card-gold' : ''} ${onClick ? 'card-button' : ''} ${className}`
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  ) : (
    <section className={cls}>{children}</section>
  )
}

export function SectionHeader({ title, icon: IconC, trailing }: { title: string; icon?: Icon; trailing?: ReactNode }) {
  return (
    <div className="section-header">
      <h2>
        {IconC && <IconC size={17} strokeWidth={2.4} />}
        {title}
      </h2>
      {trailing}
    </div>
  )
}

/** 금액처럼 규모를 드러내는 값 — 블라인드 모드면 •••. */
export function Blind({ text, blind, className }: { text: string; blind: boolean; className?: string }) {
  return <span className={className}>{blind ? '•••' : text}</span>
}

/** 알약 — 작은 상태 배지(기본) 또는 사유·구분 칩(prominent). */
export function Pill({ text, tone = 'muted', prominent }: { text: string; tone?: Tone; prominent?: boolean }) {
  return <span className={`pill ${prominent ? 'pill-big' : ''} ${toneClass(tone)}`}>{text}</span>
}

/** 격자 한 칸 — 라벨·값(+색·블라인드). */
export interface Cell {
  label: string
  value: string
  tone?: Tone
  blind?: boolean
  /** 라벨 색 — 경고면 주황(낡은 현재가 등) */
  labelTone?: Tone
}

/** 리스크·현재가 칸 격자(4열). 칸 너비는 같게, 좁으면 글자만 작아진다. */
export function PlanGrid({ rows }: { rows: Cell[][] }) {
  return (
    <div className="plan-grid">
      {rows.flat().map((c, i) => (
        <div key={i} className="plan-cell">
          <span className={`plan-label ${toneClass(c.labelTone ?? 'muted')}`}>{c.label}</span>
          <span className={`plan-value ${toneClass(c.tone)}`}>{c.blind ? '•••' : c.value}</span>
        </div>
      ))}
    </div>
  )
}

/** 통계 칸(3열 격자 안) — 라벨 위, 굵은 값 아래. */
/**
 * 통계 칸 — 라벨·값 2줄. `arrow` = 값 옆 작은 ▲▼(통산과 눈에 띄게 달라졌을 때만, 나빠졌으면 주황·아니면 회색).
 * `compact` = 라벨이 길 때 글자를 조금 줄여 칸 높이(2줄)를 지킨다. `highlight` = 금색 띠로 두른 대표 칸(조정 손익비).
 */
export function StatCell({ label, value, tone, arrow, compact, highlight }: { label: string; value: string; tone?: Tone; arrow?: { up: boolean; worse: boolean }; compact?: boolean; highlight?: boolean }) {
  return (
    <div className={`stat-cell ${highlight ? 'gold' : ''}`}>
      <span className={`stat-label ${compact ? 'compact' : ''}`}>{label}</span>
      <span className={`stat-value ${toneClass(tone)}`}>
        {value}
        {arrow && <span className={`stat-arrow ${arrow.worse ? 'tone-orange' : 'tone-muted'}`} aria-label={arrow.up ? '평소보다 높음' : '평소보다 낮음'}>{arrow.up ? '▲' : '▼'}</span>}
      </span>
    </div>
  )
}

/** 경지 카드의 점 장식 구분선. */
export function InkDivider() {
  return (
    <div className="ink-divider" aria-hidden>
      <span />
      <i />
      <span />
    </div>
  )
}

export function Gauge({ label, progress, valueText, warn }: { label: string; progress: number; valueText: string; warn?: boolean }) {
  const p = Math.min(Math.max(progress, 0), 1)
  return (
    <div className="gauge">
      <div className="gauge-head">
        <span>{label}</span>
        <span className="muted small">{valueText}</span>
      </div>
      <div className="gauge-track">
        <div className={`gauge-fill ${p >= 1 ? 'done' : warn ? 'warn' : ''}`} style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  )
}

export function Text({ children, tone, size, bold, className = '' }: { children: ReactNode; tone?: Tone; size?: 'small' | 'tiny'; bold?: boolean; className?: string }) {
  return <span className={`${toneClass(tone)} ${size ?? ''} ${bold ? 'bold' : ''} ${className}`}>{children}</span>
}
