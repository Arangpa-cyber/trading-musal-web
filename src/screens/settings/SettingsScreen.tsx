// 설정 — iOS 순서: 프로필(별호·원칙) → 매매 기본값 → 경고 기준 → 매수 수수료율 → 환율 → 화면 설정 → 도움말(가이드)
// → 데이터 백업 → 초기화 → 계정(웹: 구글 로그인) → 앱 정보. 숫자 칸은 칸을 벗어나거나 Enter를 누르면 저장한다.
import { ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { fixedDateText, type Settings } from '../../core'
import { eraseAll } from '../../data/store'
import { signOut } from '../../data/useSession'
import { downloadBackup, errorMessage, importBackupFile } from '../../state/backupActions'
import { useJournal } from '../../state/journal'
import { parseNum } from '../../ui/form'
import { useLocalStorage } from '../../ui/hooks'
import { Alert } from '../../ui/Sheet'
import { useToast } from '../../ui/toast'
import { RulesSheet } from '../entry/RulesSheet'
import { CardOrderSheet } from './CardOrderSheet'
import { FxRateSheet, fxRateText } from './FxRateSheet'

/** 이 값을 넘는 기본 리스크율은 주황 경고. */
const RISK_WARNING_PERCENT = 2

export function SettingsScreen({ email, onOpenGuide }: { email: string | undefined; onOpenGuide: () => void }) {
  const { data, snapshot, persist, reload } = useJournal()
  const toast = useToast()
  const s = data.settings
  const [sheet, setSheet] = useState<'rules' | 'fx' | 'order' | null>(null)
  const [alert, setAlert] = useState<'nickname' | 'reset' | 'resetConfirm' | null>(null)
  const [nickname, setNickname] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastBackup, setLastBackup] = useLocalStorage<number>('lastBackupDate', 0)
  const fileInput = useRef<HTMLInputElement>(null)

  async function saveSettings(patch: Partial<Settings>) {
    try {
      await persist({ settings: { ...s, ...patch } })
    } catch (e) {
      window.alert(`저장하지 못했어요: ${errorMessage(e)}`)
    }
  }

  function exportFile() {
    downloadBackup(data)
    setLastBackup(Date.now())
  }

  async function erase() {
    setBusy(true)
    try {
      await eraseAll()
      await reload() // 프로필이 없어져 별호 정하기 화면으로 간다
    } catch (e) {
      setNotice(`초기화하지 못했어요: ${errorMessage(e)}`)
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Group title="프로필" footer="원칙은 매수·매도 입력 화면 오른쪽 위 아이콘으로도 열 수 있어요.">
        <button type="button" className="group-row" onClick={() => (setNickname(data.profile?.nickname ?? ''), setAlert('nickname'))}>
          <span>별호</span>
          <span className="muted">{data.profile?.nickname ?? '-'}</span>
        </button>
        <button type="button" className="group-row" onClick={() => setSheet('rules')}>
          <span>원칙</span>
          <span className="muted">{data.profile?.tradingRules ? '보기 · 수정' : '아직 없음'}</span>
        </button>
      </Group>

      <Group
        title="매매 기본값"
        footer="매수 입력을 열면 리스크율 칸이 이 값으로 채워져요. 기본 손절률은 손절가를 직접 안 적었을 때 목표 매수가에서 손절가를 계산하는 데 써요(0이면 안 씀). 통화와 상관없이 같은 값이고, 입력 화면에서 바꾸면 그 매매에만 적용돼요."
      >
        <RateRow label="기본 리스크율" value={s.defaultRiskPercent} max={100} onCommit={(v) => saveSettings({ defaultRiskPercent: v })} />
        <RateRow label="기본 손절률" value={s.defaultStopLossPercent} max={100} onCommit={(v) => saveSettings({ defaultStopLossPercent: v })} />
        {s.defaultRiskPercent > RISK_WARNING_PERCENT && (
          <div className="group-row small tone-orange">리스크율이 {RISK_WARNING_PERCENT}%를 넘어요. 한 번 손절에 계좌가 크게 줄 수 있어요.</div>
        )}
      </Group>

      <Group
        title="경고 기준"
        footer="넘으면 카드에서 주황색으로 알려줘요(0이면 끔). 최대 비중 — 한 종목이 총자산에서 차지하는 비중(비중 알약). 최대 손절폭 — 매수 때 정한 손절률(매수 카드 손절률 칸, 미너비니는 많아야 10%)."
      >
        <RateRow label="최대 비중" value={s.maxWeightPercent} max={100} onCommit={(v) => saveSettings({ maxWeightPercent: v })} />
        <RateRow label="최대 손절폭" value={s.maxStopLossPercent} max={100} onCommit={(v) => saveSettings({ maxStopLossPercent: v })} />
      </Group>

      <Group
        title="매수 수수료율"
        footer="분할매수 계산기에서 가격 × 수량 × 수수료율로 수수료가 자동 계산돼요(원화 1원·달러 1센트 미만 버림). 체결 행에서 직접 고치면 그 값이 우선이에요."
      >
        <RateRow label="국내 매수 수수료율" value={s.feeRateKRW} max={5} onCommit={(v) => saveSettings({ feeRateKRW: v })} />
        <RateRow label="해외 매수 수수료율" value={s.feeRateUSD} max={5} onCommit={(v) => saveSettings({ feeRateUSD: v })} />
      </Group>

      <Group
        title="환율"
        footer={'지금 시장 환율의 참고값이에요. 총자산엔 안 들어가고(달러 예수금은 평균 매입 환율 원가로 계산), 현황의 "미실현 환차"와 달러 예수금이 없을 때의 달러 매수 계획 환산에만 써요. 직접 입력값과 마지막 환전 환율 중 더 최근 것이 적용돼요.'}
      >
        <button type="button" className="group-row" onClick={() => setSheet('fx')}>
          <span>설정 환율 (1$)</span>
          <span className="muted small">{fxRateText(snapshot.fxRate)}</span>
        </button>
      </Group>

      <Group title="화면 설정">
        <button type="button" className="group-row" onClick={() => setSheet('order')}>
          <span>현황 카드 순서 바꾸기</span>
          <ChevronRight size={18} className="tone-muted" />
        </button>
      </Group>

      <Group title="도움말" footer="앱 사용 흐름과 경지·주화입마·확인표 등 용어 설명을 볼 수 있어요.">
        <button type="button" className="group-row" onClick={onOpenGuide}>
          <span>가이드 · 용어 사전</span>
          <ChevronRight size={18} className="tone-muted" />
        </button>
      </Group>

      <Group
        title="데이터 백업"
        footer="매수·매도·예수금 기록과 메모를 파일로 내려받아요. 기록은 구글 계정에 저장돼 있지만, 파일로도 따로 보관해 두면 안심이에요. 불러오면 지금 계정의 기록이 백업 내용으로 바뀌어요(iOS 앱 백업도 가능)."
      >
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setBusy(true)
            const message = await importBackupFile(file, data)
            if (message?.startsWith('가져왔어요')) await reload()
            if (message) setNotice(message)
            setBusy(false)
          }}
        />
        <div className="group-row">
          <span>마지막 내보내기</span>
          <span className="muted">{lastBackup > 0 ? fixedDateText(lastBackup) : '아직 내보낸 적이 없어요'}</span>
        </div>
        <button type="button" className="group-row button" disabled={busy} onClick={exportFile}>
          백업 내보내기
        </button>
        <button type="button" className="group-row button" disabled={busy} onClick={() => fileInput.current?.click()}>
          백업 불러오기
        </button>
      </Group>
      {notice && <p className="notice">{notice}</p>}

      <Group title="초기화" footer="모든 매수·매도·예수금 기록, 메모, 프로필을 지워요. 이 작업은 되돌릴 수 없어요.">
        <button type="button" className="group-row button destructive" disabled={busy} onClick={() => setAlert('reset')}>
          데이터 초기화
        </button>
      </Group>

      <Group title="계정" footer="같은 구글 계정으로 PC·폰 어디서 들어가도 같은 기록이 보여요.">
        <div className="group-row">
          <span>구글 계정</span>
          <span className="muted ellipsis">{email}</span>
        </div>
        <button type="button" className="group-row button" onClick={() => void signOut()}>
          로그아웃
        </button>
      </Group>

      <Group title="앱 정보">
        <div className="group-row">
          <span>이름</span>
          <span className="muted">트레이딩:무살</span>
        </div>
        <div className="group-row">
          <span>버전</span>
          <span className="muted">웹 {__BUILD_DATE__}</span>
        </div>
      </Group>

      {sheet === 'rules' && <RulesSheet onClose={() => setSheet(null)} />}
      {sheet === 'fx' && <FxRateSheet onClose={() => setSheet(null)} />}
      {sheet === 'order' && <CardOrderSheet onClose={() => setSheet(null)} />}

      {alert === 'nickname' && (
        <Alert
          title="별호 바꾸기"
          message="강호에 떨칠 새 이름을 적어요."
          actions={[
            { label: '취소', onSelect: () => setAlert(null) },
            {
              label: '저장',
              primary: true,
              disabled: !nickname.trim(),
              onSelect: () => {
                setAlert(null)
                void persist({ profile: { nickname: nickname.trim(), tradingRules: data.profile?.tradingRules ?? '' } }).then(() => toast('별호 저장됨'))
              },
            },
          ]}
        >
          <input value={nickname} maxLength={20} autoFocus aria-label="별호" onChange={(e) => setNickname(e.target.value)} />
        </Alert>
      )}
      {alert === 'reset' && (
        <Alert
          title="데이터를 초기화할까요?"
          message="초기화하면 모든 기록이 사라져요. 먼저 백업해두는 걸 추천해요."
          actions={[
            {
              label: '백업하고 초기화',
              onSelect: () => {
                setAlert(null)
                exportFile()
                void erase()
              },
            },
            { label: '바로 초기화', destructive: true, onSelect: () => setAlert('resetConfirm') },
            { label: '취소', onSelect: () => setAlert(null) },
          ]}
        />
      )}
      {alert === 'resetConfirm' && (
        <Alert
          title="정말 초기화할까요?"
          message="이 작업은 되돌릴 수 없어요."
          actions={[
            { label: '취소', onSelect: () => setAlert(null) },
            {
              label: '초기화',
              destructive: true,
              onSelect: () => {
                setAlert(null)
                void erase()
              },
            },
          ]}
        />
      )}
    </div>
  )
}

function Group({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return (
    <div className="group">
      <div className="group-title">{title}</div>
      {children}
      {footer && <div className="group-footer">{footer}</div>}
    </div>
  )
}

/** % 칸 — 0 ~ max 밖의 값은 끝값으로 맞춘다. 칸을 벗어나거나 Enter를 누르면 저장. */
function RateRow({ label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    // 다른 곳(백업 가져오기 등)에서 값이 바뀌면 따라간다.
    setShown(value)
    setText(String(value))
  }
  const commit = () => {
    const v = Math.min(Math.max(parseNum(text) ?? 0, 0), max)
    setText(String(v))
    if (v !== value) onCommit(v)
  }
  return (
    <label className="group-row">
      <span>{label}</span>
      <span className="number-field rate-input">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        <span className="unit">%</span>
      </span>
    </label>
  )
}
