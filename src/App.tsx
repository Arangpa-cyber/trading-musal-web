// 임시 화면(1·2단계) — 백업 파일을 열어 계산 엔진 결과를 iOS 앱 숫자와 비교한다.
// 파일은 브라우저 안에서만 읽고 어디에도 보내지 않는다. 실제 화면(현황·거래내역·설정)은 4단계에서 만든다.
import { useState } from 'react'
import {
  blockAdjustedRatio,
  buildSnapshot,
  cardPeriod,
  parseBackup,
  periods,
  phaseStatusText,
  tierName,
  type ImportResult,
  type PortfolioSnapshot,
} from './core'

const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${v.toFixed(1)}%`)

export default function App() {
  const [result, setResult] = useState<ImportResult | null>(null)
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function open(file: File) {
    try {
      const parsed = parseBackup(await file.text())
      setResult(parsed)
      setSnapshot(buildSnapshot(parsed.data))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
      setSnapshot(null)
    }
  }

  const s = snapshot
  const g = s?.grading
  const card = s ? cardPeriod(periods(s.outcomes, 1)) : null

  return (
    <main>
      <h1>트레이딩:무살</h1>
      <p className="muted">웹 버전 준비 중 — 계산 엔진 확인용 화면이에요. 백업 파일은 이 브라우저 안에서만 읽어요.</p>

      <label className="file">
        백업 파일 열기 (iOS 앱 또는 웹 백업 JSON)
        <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
      </label>
      {error && <p className="warn">{error}</p>}

      {result?.kind === 'ios' && (
        <section>
          <h2>가져오기 결과</h2>
          <table>
            <tbody>
              <Row label="매수 · 매도 · 예수금 · 메모" value={`${result.report.buys} · ${result.report.sells} · ${result.report.cash} · ${result.report.journals}`} />
              <Row label="옛 자동 환전 매수 나눔" value={`${result.report.splitAutoExchangeBuys}건`} />
              <Row label="옛 원화 수령 달러 매도 나눔" value={`${result.report.splitAutoExchangeSells}건`} />
              <Row label="자산명 맞춤 · 겹친 거래 합침 · 보유 합침 · 매도 보정" value={`${result.report.syncedNames} · ${result.report.mergedClosed} · ${result.report.mergedOpen} · ${result.report.backfilledSells}`} />
            </tbody>
          </table>
          {result.report.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
        </section>
      )}

      {s && g && (
        <section>
          <h2>iOS 앱과 비교할 숫자</h2>
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
              <Row label="최근 20건 승률 · 손익비" value={`${pct(g.recentWinRate === null ? null : g.recentWinRate * 100)} · ${g.recentWinLossRatio === null ? '-' : `1:${g.recentWinLossRatio.toFixed(1)}`}`} />
              <Row label="완료 거래" value={`${s.outcomes.length}건`} />
              {card && <Row label={`확인표 ${card.block.label}`} value={`승률 ${pct(card.block.winRate)} · 조정 손익비 ${blockAdjustedRatio(card.block)?.toFixed(2) ?? '-'}`} />}
            </tbody>
          </table>

          <h2>보유 자산</h2>
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
        </section>
      )}
    </main>
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
