// 이 종목 모아보기 — 종목 요약 · 현재 보유 · 피라미딩별 표 · 거래 히스토리 · 메모를 한 화면에.
import { useState } from 'react'
import {
  fixedDateText,
  recordWeights,
  sellAmountKRW,
  winLossRatio,
  winRate,
  type JournalEntry,
  type TradePosition,
} from '../core'
import { useJournal } from '../state/journal'
import { Pill, Text } from '../ui/components'
import { FieldRow, FormRow, FormSection } from '../ui/form'
import { percent, price, ratio, shortDate, signColor, won, wonCompact } from '../ui/format'
import { useBlind } from '../ui/hooks'
import { Sheet } from '../ui/Sheet'
import { MemoComposeSheet, MemoRow, useMemoDelete } from './memo/MemoSheets'

export function AssetDetailSheet({ assetName, onClose }: { assetName: string; onClose: () => void }) {
  const { data, snapshot } = useJournal()
  const [blind] = useBlind()
  const [editMemo, setEditMemo] = useState<JournalEntry | null>(null)
  const memoDelete = useMemoDelete()

  const positions = snapshot.positions.filter((p) => p.assetName === assetName)
  const byTrade = new Map(positions.map((p) => [p.id, p]))
  const open = positions.filter((p) => !p.isClosed)
  const outcomes = positions.flatMap((p) => p.outcomes)
  const sells = snapshot.sells.filter((s) => s.assetName === assetName)
  const buys = snapshot.buys.filter((b) => b.assetName === assetName)
  const memos = data.journals.filter((j) => j.assetName === assetName).sort((a, b) => b.date - a.date)
  // 통산 실현손익 = 매도 건별 실현손익 합(보유 중 나눠 판 매도 포함).
  const realized = sells.reduce((a, s) => a + sellAmountKRW(s) - (byTrade.get(s.tradeId)?.costBasis(s) ?? sellAmountKRW(s)), 0)
  const fees = buys.reduce((a, b) => a + (b.fee + b.tax) * b.rate, 0) + sells.reduce((a, s) => a + (s.fee + s.tax) * s.rate, 0)
  const currency = buys[0]?.currency ?? sells[0]?.currency ?? 'KRW'
  const pyramids = positions.filter((p) => p.buys.length > 1).sort((a, b) => (b.firstBuyDate ?? 0) - (a.firstBuyDate ?? 0))
  const history = [...buys.map((r) => ({ kind: 'buy' as const, r })), ...sells.map((r) => ({ kind: 'sell' as const, r }))].sort((a, b) => b.r.date - a.r.date)
  const weights = recordWeights(snapshot)

  const qty = open.reduce((a, p) => a + p.remainingQuantity, 0)
  const nativeCost = open.reduce((a, p) => a + p.nativeAverageBuyPrice * p.remainingQuantity, 0)
  const cost = open.reduce((a, p) => a + p.positionCost, 0)

  return (
    <Sheet title={assetName} onClose={onClose}>
      <FormSection title="종목 요약">
        <FieldRow label="통산 실현손익">
          <Text tone={realized >= 0 ? 'red' : 'blue'}>{blind ? '•••' : (realized >= 0 ? '+' : '') + won(realized)}</Text>
        </FieldRow>
        {fees > 0 && (
          <FieldRow label="누적 수수료">
            <span className="muted">{blind ? '•••' : won(fees)}</span>
          </FieldRow>
        )}
        <FieldRow label="완료 거래">
          <span>{outcomes.length}건</span>
        </FieldRow>
        {outcomes.length > 0 && (
          <>
            <FieldRow label="승률">
              <span>{percent(winRate(outcomes) * 100)}</span>
            </FieldRow>
            <FieldRow label="손익비">
              <span>{ratio(winLossRatio(outcomes))}</span>
            </FieldRow>
          </>
        )}
      </FormSection>

      {open.length > 0 && (
        <FormSection title="현재 보유">
          <FieldRow label="수량">
            <span>{blind ? '•••' : `${qty}주`}</span>
          </FieldRow>
          <FieldRow label="평균단가">
            <span>{price(qty > 0 ? nativeCost / qty : 0, currency)}</span>
          </FieldRow>
          <FieldRow label="매수원가">
            <span>{blind ? '•••' : wonCompact(cost)}</span>
          </FieldRow>
        </FormSection>
      )}

      {pyramids.map((p) => (
        <PyramidTable key={p.id} position={p} afterBuy={weights.afterBuy} blind={blind} />
      ))}

      {history.length > 0 && (
        <FormSection title="거래 히스토리">
          {history.map(({ kind, r }) => {
            const realizedRow = kind === 'sell' ? sellAmountKRW(r) - (byTrade.get(r.tradeId)?.costBasis(r) ?? sellAmountKRW(r)) : null
            return (
              <FormRow key={`${kind}-${r.id}`}>
                <div className="row-between">
                  <span className="pills">
                    <Pill text={kind === 'buy' ? '매수' : '매도'} tone={kind === 'buy' ? 'red' : 'blue'} prominent />
                    <span className="small">{blind ? '•••' : `${r.quantity}주`}</span>
                    <span className="small muted">@ {price(r.unitPrice, r.currency)}</span>
                  </span>
                  <span className="tiny muted">{fixedDateText(r.date)}</span>
                </div>
                {realizedRow !== null && (
                  <Text bold size="small" tone={realizedRow >= 0 ? 'red' : 'blue'}>
                    실현손익 {blind ? '•••' : (realizedRow >= 0 ? '+' : '') + wonCompact(realizedRow)}
                  </Text>
                )}
              </FormRow>
            )
          })}
        </FormSection>
      )}

      {memos.length > 0 && (
        <FormSection title="메모">
          {memos.map((m) => (
            <MemoRow key={m.id} entry={m} onEdit={() => setEditMemo(m)} onDelete={() => memoDelete.ask(m)} />
          ))}
        </FormSection>
      )}
      {history.length === 0 && memos.length === 0 && <p className="empty">이 종목 기록이 없어요.</p>}

      {editMemo && <MemoComposeSheet tradeId={editMemo.tradeId} assetName={editMemo.assetName} context={editMemo.context} existing={editMemo} onClose={() => setEditMemo(null)} />}
      {memoDelete.alert}
    </Sheet>
  )
}

/**
 * 피라미딩별 — 매수(N-n) | 매수일 | 단가 | 수량 | 누적 비중 | 계좌기여율(완결만, 맨 아래 합계 = 포지션 전체).
 * 각 줄 아래 "→ M/d 매도 · 가격 · ±X%" 또는 "보유"(옛 매도 섞이면 없음).
 */
function PyramidTable({ position: p, afterBuy, blind }: { position: TradePosition; afterBuy: Map<string, number>; blind: boolean }) {
  const ordered = p.orderedBuys
  const tranches = p.trancheContributions
  const total = p.positionContribution
  return (
    <FormSection
      title={`피라미딩별 · ${p.entryNumber}번째 거래 (${p.firstBuyDate !== null ? shortDate(p.firstBuyDate) : ''} 시작)`}
      footer={
        tranches
          ? '누적 비중 = 그 매수 직후 이 종목이 총자산에서 차지한 비중. 계좌기여율 = 각 매수분이 계좌를 몇 % 움직였나(첫 매수 때 총자산 기준, 합계 = 포지션 전체). 매도 줄의 % = 그 매수 수익률(그 매수가 기준, 경지 1건).'
          : '누적 비중 = 그 매수 직후 이 종목이 총자산에서 차지한 비중. 계좌기여율은 다 팔고 나면 보여요. 매도 줄의 % = 그 매수 수익률(그 매수가 기준, 경지 1건).'
      }
    >
      <div className="form-row table-scroll plain">
        <table className="pyramid-table">
          <thead>
            <tr>
              <th className="left">매수</th>
              <th>매수일</th>
              <th>단가</th>
              <th>수량</th>
              <th>누적 비중</th>
              {tranches && <th>계좌기여율</th>}
            </tr>
          </thead>
          <tbody>
            {ordered.map((b, i) => {
              const sold = p.hasLegacySells ? null : p.sellOfLot(b)
              const r = sold ? p.lotReturn(b, sold.unitPrice) : null
              return [
                <tr key={b.id}>
                  <td className="left">{p.trancheLabel(i)}</td>
                  <td>{shortDate(b.date)}</td>
                  <td>{price(b.unitPrice, b.currency)}</td>
                  <td>{blind ? '•••' : `${b.quantity}주`}</td>
                  <td className="tone-accent">{afterBuy.has(b.id) ? percent(afterBuy.get(b.id)!) : '-'}</td>
                  {tranches && <td className={`bold tone-${signColor(tranches[i])}`}>{percent(tranches[i], true)}</td>}
                </tr>,
                !p.hasLegacySells && (
                  <tr key={`${b.id}-sell`} className="sub">
                    <td />
                    <td colSpan={tranches ? 5 : 4} className="left">
                      {sold ? (
                        <>
                          <span className="muted">
                            → {shortDate(sold.date)} 매도 · {price(sold.unitPrice, sold.currency)}
                          </span>
                          {r !== null && <Text tone={r > 0 ? 'red' : 'blue'}> · {percent(r, true)}</Text>}
                        </>
                      ) : (
                        <span className="muted">보유</span>
                      )}
                    </td>
                  </tr>
                ),
              ]
            })}
            {tranches && total !== null && (
              <tr className="total">
                <td className="left">합계</td>
                <td />
                <td />
                <td>{blind ? '•••' : `${ordered.reduce((a, b) => a + b.quantity, 0)}주`}</td>
                <td />
                <td className={`tone-${signColor(total)}`}>{percent(total, true)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </FormSection>
  )
}
