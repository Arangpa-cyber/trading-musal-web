// 임시 요약 화면 — 계산 엔진 결과를 iOS 앱 숫자와 비교하는 용도. 4단계에서 현황·거래내역으로 바뀐다.
import {
  blockAdjustedRatio,
  cardPeriod,
  periods,
  phaseStatusText,
  tierName,
  type PortfolioSnapshot,
} from '../core'

const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${v.toFixed(1)}%`)

export function SummaryView({ snapshot: s }: { snapshot: PortfolioSnapshot }) {
  const g = s.grading
  const card = cardPeriod(periods(s.outcomes, 1))
  return (
    <section>
      <h2>요약 (iOS 앱과 비교용)</h2>
      <table>
        <tbody>
          <Row label="총자산" value={won(s.totalAssets)} />
          <Row label="순입금액" value={won(s.netContributions)} />
          <Row label="총 누적손익" value={won(s.totalAssets - s.netContributions)} />
          <Row label="누적 수수료" value={won(s.cumulativeFees)} />
          <Row label="원화 예수금" value={won(s.cash.krw)} />
          <Row label="달러 예수금" value={`$${s.cash.usd.toFixed(2)} (평균 ${s.cash.usdAverageRate?.toFixed(2) ?? '-'}원)`} />
          <Row label="확정 환차손익" value={won(s.cash.realizedFx)} />
          <Row label="경지" value={`${tierName(g.currentTier)}${g.beominProgress ? ` (${g.beominProgress.closed}/${g.beominProgress.needed})` : ''}`} />
          <Row label="주화입마" value={phaseStatusText(g.juhwaipma)} />
          <Row
            label="최근 20건 승률 · 손익비"
            value={`${pct(g.recentWinRate === null ? null : g.recentWinRate * 100)} · ${g.recentWinLossRatio === null ? '-' : `1:${g.recentWinLossRatio.toFixed(1)}`}`}
          />
          <Row label="완료 거래" value={`${s.outcomes.length}건`} />
          {card && (
            <Row
              label={`확인표 ${card.block.label}`}
              value={`승률 ${pct(card.block.winRate)} · 조정 손익비 ${blockAdjustedRatio(card.block)?.toFixed(2) ?? '-'}`}
            />
          )}
        </tbody>
      </table>

      <h2>보유 자산</h2>
      {s.openPositions.length === 0 ? (
        <p className="muted">보유 중인 종목이 없어요.</p>
      ) : (
        <table>
          <thead>
            <tr><th>종목</th><th>수량</th><th>평단</th><th>원가</th><th>손절 시</th></tr>
          </thead>
          <tbody>
            {s.openPositions.map((p) => (
              <tr key={p.id}>
                <td>{p.assetName} <span className="muted">{p.nextLotLabel}</span></td>
                <td>{p.remainingQuantity}</td>
                <td>{p.isForeign ? `$${p.nativeAverageBuyPrice.toFixed(2)}` : won(p.averageBuyPrice)}</td>
                <td>{won(p.positionCost)}</td>
                <td>{p.pnlAtStop === null ? '-' : `${won(p.pnlAtStop)} (${pct(p.pnlAtStopPercent)})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value}</td>
    </tr>
  )
}
