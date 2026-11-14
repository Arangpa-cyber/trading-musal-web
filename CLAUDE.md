# 트레이딩:무살 (웹) — Claude Code 작업 지침

개인 트레이딩 저널 웹앱(PWA). 정식 이름 "트레이딩: 무림에서 살아남기", 짧은 이름 "트레이딩:무살".
미너비니 철학 기반 무협 테마 경지(등급) 시스템, 개인 트레이더 실력 추적이 핵심. 기관/가치투자 스타일 아님.
**iOS 앱(SwiftUI, `~/Downloads/XcodeProj`)을 대체한다**(2026-11-12 결정 — 웹 하나로 진행, iOS 앱은 더 고치지 않음).
iOS 코드는 규칙·계산을 확인하는 참고 자료로만 읽고 수정하지 않는다. PC·모바일 브라우저, 다른 사람도 쓰는 서비스.

## 지금 상태 · 다음 할 일 (2026-11-13 — 새 세션은 여기부터)

- 1~4단계 완료: 계산 엔진·테스트, 구글 로그인·Supabase 저장, 화면 전부(현황·거래내역·입력·수정·메모·모아보기·차트·설정·가이드).
  배포: https://arangpa-cyber.github.io/trading-musal-web/ (`npm run deploy`).
- 5단계 PWA 완료(2026-11-13): 아이콘 = **iOS 앱 아이콘 그대로**(빨간 칼·파란 칼 수묵화, `public/icons/` 32·180·192·512 — 원본
  `XcodeProj/TradingJournal/Assets.xcassets/AppIcon.appiconset/icon-1024.png`에서 `sips`로), `public/manifest.webmanifest`(standalone),
  `index.html` apple-touch-icon·theme-color. Chrome 설치 가능 검사(CDP `Page.getInstallabilityErrors`) 오류 0.
  서비스 워커(오프라인 캐시)는 없음 — 데이터가 서버에 있어 우선순위 낮음, 하려면 먼저 물어볼 것.
- 빌드 확인: `npm run build && npx vite preview`(4173, 배포와 같은 `/trading-musal-web/` 경로 — vite.config `isPreview`).
- 공개 준비(2026-11-13): 개인정보 처리방침 `public/privacy.html`(정적 페이지, 로그인 없이 열림 — 운영자 Arangpa, 연락처 arangpa86@gmail.com,
  로그인 화면·설정 앱 정보에서 링크), 회원 탈퇴(설정 → 계정, DB 함수 `delete_account`). **사용자가 할 일**: `schema.sql`을 SQL Editor에서 다시 Run
  (탈퇴 함수), Google 인증 플랫폼 → 브랜딩(홈페이지·방침 주소·승인된 도메인 `arangpa-cyber.github.io`) → 대상 → 앱 게시. 방침 내용이 바뀌면(모으는 정보·업체) 페이지도 고친다.
- 경지 개편 완료(2026-11-14, 미너비니 원서 2권 분석 기반): 요건·증거 구간·강등·주화입마 개선, 현황 카드 3종(경지 통산 / 승급 심사 / 확인표). 자세한 규칙은 아래 "경지(등급)".
  원서 분석 논의의 EPUB 위치·읽은 범위는 Claude 메모리(`minervini-book-study`)에 있다. 아직 안 한 것: 경지 상세 시트(9단계 요건표), 총자산 추이에 연환산수익률 이동(필요하면), 반 매도 지원(통계 집계 단위 결정 필요).
- 보유 자산 개편 완료(2026-11-14): 매수 건(1-1·1-2…)마다 카드, 손절가는 건별 고정·현황에서 수정 불가, 수익쿠션·본전 확보 폐지, 현재가만 종목 공통,
  총자산 추이는 연도별만, 연환산수익률 삭제. 자세한 건 아래 "현황 보유 자산(2026-11-14)"·"매매 기록 핵심 규칙".
- 다음 후보: 사용자가 실제로 쓰면서 나오는 수정 요청.
- 실제 계정(Supabase)으로 확인 못 한 것: 데이터 초기화(프로필까지 지움 → 별호 화면), 설정 저장. 사용자 확인 필요.
  회원 탈퇴는 확인됨(2026-11-13 — `delete_account` 함수가 Supabase에 없어 실패했던 것을 SQL Editor에서 만들어 해결).
- 개발 서버: `npm run dev`(5173). 확인: `npm test`, `node scripts/e2e-entry.mjs /tmp`, `e2e-history.mjs`, `e2e-settings.mjs`, `scripts/shot.mjs`.
- **iOS 화면 디자인을 임의로 바꾸지 않는다** — 바꿔야 하면 코딩 전에 이유와 대안을 묻는다(파이 지시선 라벨을 단순화했다가 되돌림, 2026-11-13).

## 새 세션 시작하는 법 (Claude 데스크톱 앱 Code 탭 등)

- 작업 폴더 = `~/Downloads/trading-musal-web`. 이 파일과 README, `git log --oneline | head -20`으로 상황을 파악한다.
  이전 대화(Xcode 안 Claude Code)는 기억하지 못한다 — 필요한 결정은 모두 이 파일에 있다.
- iOS 원본(참고만, 수정 금지): `~/Downloads/XcodeProj/TradingJournal`(SwiftUI). 화면·문구를 옮기거나 확인할 때 읽는다.
- Node는 `/usr/local/bin/node`(셸에서 못 찾으면 `export PATH="/usr/local/bin:$PATH"`). 개발 서버 `npm run dev`(5173)를 켜 두고 확인한다.
- GitHub push: 토큰이 macOS 키체인에 저장돼 있어 `git push`가 그냥 된다(원격 https://github.com/Arangpa-cyber/trading-musal-web).
- 자주 쓰는 명령은 `.claude/settings.json`에 허용해 뒀다(npm·확인 스크립트·git).

## 외부 서비스 · 계정 (사용자 구글 계정 kimkkomkkom@gmail.com, GitHub Arangpa-cyber)

- **Supabase** 프로젝트 `vwwrazzwzbaqfvsasvhb`(서울). 주소·publishable 키는 `src/data/supabase.ts`(공개값). DB 구조는 `supabase/schema.sql` —
  바꾸면 사용자가 Supabase **SQL Editor**에 붙여넣고 Run 해야 한다(Claude는 DB에 직접 못 붙는다 — service_role 키·DB 비밀번호 없음, 받지 않는다).
  Authentication → URL Configuration: Site URL = 배포 주소, Redirect URLs = 배포 주소 + `http://localhost:5173/`.
  Sign In / Providers → Google 켜짐(클라이언트 ID·보안 비밀번호는 Supabase에만 있음).
- **Google Cloud** OAuth 클라이언트(웹, 리디렉션 URI = `https://vwwrazzwzbaqfvsasvhb.supabase.co/auth/v1/callback`). 앱이 "테스트" 상태면
  등록한 테스트 사용자만 로그인된다 — 다른 사람에게 공개할 땐 Google 인증 플랫폼 → 대상 → **앱 게시**.
- 공개 서비스로 열 때: 개인정보 처리방침 = 배포 주소 + `privacy.html`. 남은 일은 위 "공개 준비"의 사용자 할 일.

## 진행 방식 (반드시 지킬 것)

- **"코딩해"라고 명시적으로 말하기 전까지는 절대 파일을 수정하지 않는다.** 기능 요청·버그 제보를 받으면 먼저
  원인·전략만 설명하고 확인을 기다린다. 의도를 정확히 모르면 코딩 전에 질문한다.
- "코딩해" 뒤에는 중간에 멈추고 미루지 않는다. 막히면 그 자리에서 묻고 계속한다.
- 새 기능을 만들 때 좋은 개선 아이디어가 있으면 같이 제안한다.
- 초심자가 알아야 할 새 기능은 가이드(용어사전)에도 반영한다. 사소한 UI 변경은 넣지 않는다.
- **테스트는 고친 부분에 관련된 것만 돌린다**(사용자 결정, iOS 때부터 — 매번 전체를 돌리지 않는다).
  화면만 바꿨으면(문구·배치·색·차트 모양) 타입 검사·빌드 + 그 화면 스크린샷만. 계산(`src/core`)을 고쳤으면 그 영역 테스트만
  (`npx vitest run src/core/__tests__/position.test.ts` 등, `TZ=Asia/Seoul` 필요 → `npm test -- <파일>`). 입력·저장·삭제 흐름을 바꿨을 때만
  그 흐름의 e2e 스크립트. 무엇을 왜 돌렸는지(안 돌렸는지) 보고에 한 줄로 밝힌다. (`npm run deploy`는 배포 전에 전체 테스트를 자동으로 돌린다 — 1초 미만.)
- 코드 정리: 떠다니는 코드는 지운다. 중복 로직은 공용으로 모은다. **계산·판정은 `src/core`에만** 둔다(화면에서 계산 금지).
- 폐기된 아이디어 — 다시 제안하지 않는다: 리마인더 배너(마지막 백업 며칠 전 등), 생체인증 앱 잠금, 홈 화면 위젯,
  예약(지정가) 매수/매도, 목표가·목표 손익비, 실현 R, 감정·규율 태그·장세·메모 분석, CSV, 증권사 PDF 가져오기,
  "총 오픈 리스크 한도" 경고, 수동 "기존 포지션에 합치기" 메뉴, 확인표 "피라미딩 성적".

## 기술 구성

- Vite + React + TypeScript(strict, `erasableSyntaxOnly` — `enum`·파라미터 프로퍼티 금지, 문자열 유니언 사용).
- 테스트: Vitest, **`TZ=Asia/Seoul`로 실행**(`npm test`). 날짜 계산은 기기 시간대 기준.
- Supabase(프로젝트 `vwwrazzwzbaqfvsasvhb`, 서울) — 구글 로그인 + DB + RLS(본인 기록만). 주소·publishable 키는 공개값이라
  `src/data/supabase.ts`에 기본값으로 둔다(.env.local의 `VITE_SUPABASE_URL`·`VITE_SUPABASE_KEY`로 바꿀 수 있음). service_role 키는 절대 코드에 넣지 않는다.
- **배포 = GitHub Pages** https://arangpa-cyber.github.io/trading-musal-web/ — `npm run deploy`(타입 검사·테스트·빌드 후 `dist`를 `gh-pages` 브랜치에
  강제 push, 반영 1~2분). 빌드 base = `/trading-musal-web/`(vite.config.ts). 화면을 바꾸면 커밋·push와 함께 배포까지 한다.
  Supabase Authentication → URL Configuration의 Redirect URLs에 배포 주소와 `http://localhost:5173`이 있어야 로그인된다.
- (예정) PWA(홈 화면에 추가 — 아이콘·manifest).
- **실제 거래 데이터·백업 JSON·`.env`는 절대 커밋하지 않는다**(`.gitignore`).

## 폴더

- `src/core/` — 계산 엔진(순수 함수, React·Supabase 의존 없음). `index.ts`로 모두 내보낸다.
  - `types.ts` 저장 기록 타입·라벨, `records.ts` 기록 1건 계산, `position.ts` 포지션·원가 장부·완료 거래,
    `fx.ts` 달러 장부·환율 정하기·예수금, `analytics.ts` 총자산·자산 추이·스냅샷·비중, `tier.ts` 경지·승급 심사·주화입마(조건 목록·구간 증거·유지 심사까지 `evaluate`가 한 번에),
    `checklist.ts` 확인표, `memo.ts` 메모 위치, `deletePlan.ts` 매수 삭제, `maintenance.ts` 옛 데이터 보정,
    `importIos.ts` iOS 백업 가져오기, `backup.ts` 웹 백업.
  - `__tests__/` — iOS `CoreServiceTests` 시나리오를 옮긴 회귀 테스트. 계산 수정 시 반드시 통과.
- `src/data/` — 저장(Supabase). `store.ts` 테이블 ↔ 웹 형식, `useSession.ts` 구글 로그인. 계산은 하지 않는다.
- `src/screens/` — 화면. `JournalScreen`(불러오기 → 온보딩 또는 앱) → `AppShell`(위 막대·아래 3탭·#/주소 라우팅·시트) →
  `home/`(현황), `history/`, `entry/`, `edit/`, `memo/`, `settings/`(`SettingsScreen` iOS 순서·`FxRateSheet`·`CardOrderSheet`),
  `guide/`(`GuideScreen` 흐름 설명 + 용어 사전 + 검색, `helpText.ts` = iOS HelpText 이식 — **명칭이 바뀌면 반드시 같이 고친다**,
  승급 조건 표는 `tierRequirementsText()`로 자동). 라우트: #/home #/history #/settings #/checklist #/guide.
- `src/state/` — `journal.tsx`(데이터+스냅샷 컨텍스트, `useJournal()` — 화면은 계산을 여기 스냅샷에서만 가져온다), `entry.ts`(입력 시트 요청),
  `backupActions.ts`(가져오기·내보내기 공용).
- `src/ui/` — 공용 부품: `components.tsx`(Card·SectionHeader·Pill·PlanGrid·StatCell·Gauge·Blind), `Menu.tsx`(탭하면 누른 자리에 뜨는 메뉴),
  `Sheet.tsx`(시트·Alert), `layout.tsx`(TopBar·TabBar·Page), `cells.ts`(카드 4칸 내용), `format.ts`(원·$·%·날짜 표기), `hooks.ts`(localStorage·블라인드·#라우팅).
  스타일은 `src/index.css` 하나(CSS 변수로 색상 규칙·다크 모드).
- `src/dev/` — 개발용 예시 데이터. `npm run dev` 후 `http://localhost:5173/?preview#/home`이면 로그인 없이 화면을 본다(배포본 제외).
  **화면을 고치면 `node scripts/shot.mjs "#/home" /tmp/x.png`(폰 390px, PC는 폭 1280)로 찍어 직접 확인한다.**
  입력 흐름은 `node scripts/e2e-entry.mjs /tmp`(미리보기에서 입금 → 매수 → 매도를 실제로 입력·저장, ✓ 목록 출력),
  거래내역 흐름은 `node scripts/e2e-history.mjs /tmp`(수정·메모·삭제·캘린더·모아보기·매도 전 메모 확인·현재가 기록) — 해당 부분을 고치면 돌린다.
  ⚠️ 메뉴는 스크롤하면 닫힌다(iOS와 같게) — 자동 조작에선 스크롤한 뒤 잠깐 기다렸다 누른다.
- 저장·삭제는 `useJournal().persist(changes)`·`remove(removals)`만 쓴다(실제 = Supabase 후 다시 불러오기, 미리보기 = 메모리).
  화면에서 `data/store`를 직접 부르지 않는다(백업 가져오기·초기화만 예외).
- 입력 시트(`screens/entry/`): `EntrySheet`(날짜·구분·쓰던 내용 보호·원칙) + `BuyForm`·`SellForm`·`CashForm`, `draft.ts`(작성 중 판단),
  `RulesSheet`(원칙). 공용 입력 부품은 `ui/form.tsx`(FormSection·FieldRow·NumberField·Segmented·SummaryBox·CashChangeBox·ExchangeFields·SaveFooter).
  자동 계산값(손절가·손절률·체결 수수료)은 칸의 회색 placeholder로 보이고 직접 적으면 우선. Enter = 다음 칸. 숫자 칸엔 항상 `label`을 준다.
  현황 매도 요청에 보유 메모가 있으면 AppShell이 "매도 전 확인" 시트를 먼저 띄운다.
- 시트는 `useSheets()`(state/sheets.tsx)로 연다 — openEntry·openEdit·openMemos·openAsset·openMark·openBulkMark. AppShell이 띄운다(어느 화면에서든 같은 시트).
- 거래내역(`screens/history/`): `HistoryScreen`(검색·종류/통화 필터·월 머리 실현손익·카드 탭 = 메뉴), `TradeCalendar`(오른쪽 위 목록↔캘린더),
  `deleteFlow`(삭제 확인 — 거래내역·수정 화면 공용, 매수는 `buyDeletePlan`). 수정 화면 `screens/edit/EditSheets.tsx`(고친 칸만 저장, 자산명은 거래 전체),
  메모 `screens/memo/MemoSheets.tsx`, 모아보기 `screens/AssetDetailSheet.tsx`, 현재가 `screens/home/MarkSheets.tsx`.
- 저장·삭제·수정이 끝나면 화면 아래 토스트(`ui/toast.tsx`, 1.8초 — 반복 배너 아님, 그 순간의 확인).
- 매수 체결 가격이 목표 매수가와 ±20% 넘게 다르면 계산기에 주황 "가격을 확인하세요"(0 하나 빠뜨림 방지, 2026-11-13 채택).
- **현황 보유 자산(2026-11-14)**: 종목 머리글(합계 비중·수량·평균단가·메모, 메뉴 = 추가 매수·매도·메모·현재가 기록·모아보기) 아래에 **아직 안 판 매수 건마다 카드**(1-1·1-2…).
  카드 = 그 건의 매수가·수량·손절가·손절률·리스크율·허용손실(진입 기준 `buyEntryCells`) + 현재가·수익률·손절 여유·현재수익(`lotMarkCells`). 카드 메뉴 = N-n 매도 / N-n까지 매도(LIFO 유지, 반 매도 없음) + 현재가 기록.
  현재가만 같은 종목 공통(저장은 그 종목 모든 매수 기록에 같은 값). 파이 차트는 종목 합계 그대로. 판 매수 구분이 없는 옛 기록 포지션은 전체 매수를 보여 주고 "전량 매도"만.
- 거래내역 무한 스크롤(2026-11-13 채택): 최근 3개월(적어도 30건)부터, 바닥에 닿으면(IntersectionObserver) 3개월씩 더 + "이전 기록 더 보기" 버튼.
  검색 중이면 전부. 그래서 카드 개수로 삭제를 확인하면 안 된다(밖의 카드가 들어온다) — 카드 id(`record-<id>`)로 본다.
- 메모 "거래 보기"(2026-11-13 채택): 메모가 붙은 카드(`memoRecordId` — 매도 메모 = 매도 카드, 매수·보유 메모 = 매수 카드, 작성 날짜 기준)로
  거래내역 이동 `#/history?focus=<id>` → 그 날짜까지 목록을 넓히고 스크롤 + 금색 강조 후 주소에서 focus를 지운다(`useHashRoute` replace).
- 현황 차트(Recharts, `screens/home/`): `ReturnDistributionCard`(5% 구간·양 끝 합산·배경 4톤·평균 점선, 양 끝 막대 누르면 목록),
  `PortfolioCard`(iOS 파이 그대로 — SVG + `pieLayout.ts`(iOS PieChartLayout 이식: 안쪽 두 줄 라벨/바깥 지시선 라벨, 겹침 밀어내기, 교차 없는
  계단 기둥, 1% 미만은 누를 때만, 글자 폭은 canvas로 재고 가운데 "…"), 통화 노출 막대), `TrendCard`(총자산|누적손익 세그먼트 =
  localStorage `assetTrendMode`, **연도별 페이지만**(‹ 2026년 › — 3개월·6개월·1년·전체 칩은 2026-11-14 삭제), 계단선 stepAfter, ▲▼★, 최고점 대비, 총자산 숫자 누르면 설정 환율).
  수익분포 막대를 누르면 그 구간 거래 목록 → 누르면 그 매도 카드로(`TradeOutcome.sellId` → `showRecord`). 카드 순서 = `settings.homeCardOrder`(iOS 백업 키와 같음 + 새 키 `tierReview`(승급 심사) — **기본 순서: 수익 분포 → 총자산 추이 → 확인표 → 승급 심사 → 포트폴리오 구성 → 보유 자산**, 순서를 이미 저장한 계정엔 새 카드가 맨 앞에 붙는다(`cardOrder`),
  `cardOrder.ts`), 설정 "현황 카드 순서 바꾸기"(`settings/CardOrderSheet` — iOS처럼 ≡ 손잡이로 끌기, 놓으면 저장). ⚠️ Recharts 라벨 함수는 index 대신 `payload`를 쓴다(종목이 빠진 직후 index가 옛 목록을 가리켜 오류).
- `supabase/schema.sql` — DB 구조. **바꾸면 Supabase SQL Editor에서 다시 실행**해야 한다(여러 번 실행해도 안전하게 작성).

## DB (2026-11-13)

- 테이블 6개: `buys`·`sells`·`cash_txs`·`journals`(기록 = `data` JSONB에 웹 형식 그대로, 키 = (user_id, id)),
  `profiles`(별호·원칙), `settings`(`data` JSONB). 기록에 칸이 늘어도 DB를 안 바꾼다 — 대신 `core/backup.ts`·`store.ts`의
  `loadJournal`에서 옛 데이터에 없는 칸을 기본값으로 채운다.
- 모든 테이블 RLS "own rows"(user_id = auth.uid()). DB 함수 `replace_journal(p)`(백업 가져오기 — 한 트랜잭션으로 통째로 교체,
  profile이 null이면 지금 프로필 유지)·`erase_journal()`(데이터 초기화 — 지우기 진입점 하나), 둘 다 security invoker.
- 웹 지우기: `eraseJournal`(기록만 — 백업 가져오기 DB 함수가 씀), `eraseAll`(설정 "데이터 초기화" — 기록 + 프로필, iOS와 같게, 설정은 남김).
  초기화는 "백업하고 초기화 / 바로 초기화(한 번 더 확인)" 중 고른다.
- 회원 탈퇴 = `deleteAccount`(store.ts) → DB 함수 `delete_account()`(security definer, 부른 사람의 auth.users 한 줄만 지움 → 모든 테이블 on delete cascade)
  → 이 기기 세션만 로그아웃(`signOut({ scope: 'local' })`). 탈퇴도 "백업하고 탈퇴 / 바로 탈퇴(한 번 더 확인)".
- 기록 한 건 저장·삭제 = `saveRecords`·`deleteRecords`. 로그인 뒤 전부 불러와(`loadJournal`) `buildSnapshot`으로 계산한다.

## 저장 모델 — 웹에서 바뀐 것 (설계 결정 1~3, 2026-11-12)

1. **가격·수수료는 거래 통화 원래 값으로 저장**(원화 종목 = 원, 달러 종목 = $). 원화 금액은 저장하지 않는다.
   환율은 `resolveRates`(fx.ts)가 달러 장부를 날짜순으로 재생해 정한다 — 달러 매수 = 그 시점 달러 평균 매입 환율
   (달러 예수금이 없었으면 저장된 `fallbackRate`), 달러 매도 = 그 포지션 원가 환율(매도 시점 환차 0).
   그래서 iOS의 `normalize`·`rescale`(저장값 다시 쓰기)이 없다. 계산은 `RatedBuy`/`RatedSell`(환율이 붙은 사본)로만 한다.
   화면은 `buildSnapshot(data)` 하나로 스냅샷을 받아 쓴다.
2. **옛 데이터 보정은 iOS 백업을 가져올 때 한 번만**(`importIosBackup`): 옛 자동 환전 달러 매수 → 환전 + 달러 매수,
   원화로 받은 옛 달러 매도 → 달러 매도 + 달러→원화 환전, 갈린 자산명 맞추기 → 겹친 다 판 거래 합치기 → 같은 종목 보유
   포지션 합치기 → 다 판 포지션 마지막 매도 보정. 웹 DB엔 항상 정리된 데이터만 들어간다.
3. **옛 호환 필드는 없다**: `krwAmount`·`autoExchange`·`usdFromBalance`·`exchangeRate`·`isPending` 등. 옛 매도 이유 글자는
   `Sell.legacyReason`("목표가 도달"·"직접 입력"), 옛 직접 입력 글은 `reasonNote`에만 남는다. 옛 `feeExpense` 예수금은 종류로만 남고 입력 불가.
- ID: iOS에서 가져온 ID는 소문자로 바꾼다. 같은 시각 정렬 등 iOS와 순서를 맞출 땐 `idKey`(대문자)로 비교.
- 날짜는 epoch 밀리초(`Millis`).

## 앱 구조 (iOS 3탭 + 입력 시트)

현황 / 거래내역 / 설정. 가이드는 설정 안 "가이드 · 용어 사전". 매매일지 탭은 없다(메모만, 캘린더는 거래내역, 확인표는 현황 카드).
입력은 탭이 아니라 시트(모달) — 현황·거래내역 `+`, 현황 보유 자산 메뉴(추가 매수·매도·입출금).
- **툴바 규칙**: 탭 화면 = 왼쪽 위 블라인드, 오른쪽 위 `+`. 시트 = 왼쪽 위 닫기/취소, 오른쪽 위 확인·보조.
- **리스트 항목은 탭하면 바로 메뉴**(롱프레스 아님). 매도 메뉴 항목은 빨강 금지(빨강 = 삭제만).
- 쓰던 내용이 있으면 쓸어내려/바깥 눌러 닫기 막고 "작성 중인 내용을 버릴까요?" 확인.
- 앱 화면에 '묶음'·'매수분'이라는 말은 쓰지 않는다 — 매수 이름 "N-n"·"매수"·"완료 거래"로 표현.
- 카드(경지·수익분포·파이차트·총자산추이·보유자산·확인표) = 독립된 둥근 박스, 화면 가장자리 여백 좁게.
  목록형(거래내역·메모·가이드·설정) = 시스템 그룹 목록 스타일. 결과 박스는 하나의 스타일(연한 강조색 배경).
- 블라인드 모드: 금액만 •••(비율은 보임), 기기별 설정(백업 미포함, localStorage `blindMode`).
- PC 화면 = 폰과 같은 한 줄을 가운데에(폭 720px, 사용자 결정 A). 시트는 폰에선 아래에서, PC에선 가운데 창.
- 진행(2026-11-13): 4-1 앱 틀 + 현황(경지·보유자산·확인표) 완료 → 4-2 입력 시트 완료 → 4-3 거래내역·메모·수정·모아보기·현재가 기록 완료 → 4-4 차트 카드·카드 순서 완료 → 4-5 설정·가이드 완료
  → 4-5 설정·원칙·가이드. 아직 없는 메뉴 항목은 비활성 + "다음 단계에서 만들어요".

## 매매 기록 핵심 규칙 (iOS와 같음 — 자세한 근거는 iOS CLAUDE.md)

- 자산명 자유텍스트, 분할매수는 한 건으로 압축 저장. 매도는 보유 포지션에서 선택(직접 입력 없음).
- 거래 완결 = 포지션 전체 청산. `totalAssetsAtEntry` = 리스크율·계좌기여율의 고정 분모.
- 리스크 = 총자산×리스크율 하나(2026-11-14 — 수익쿠션·본전 확보·"손절가 올리기" 폐지). **손절가는 매수 건마다 따로**, 그 매수를 기록할 때 쓴 값 그대로이고
  현황에서 못 고친다(거래내역의 매수 기록 수정으로만 정정). 같은 종목에 비중을 더하는 "추가 매수"도 총자산 기준 새 매수 건(N-n)이다.
  `RiskMode`의 'profitCushion'은 옛 기록·iOS 백업을 읽기 위해 타입에만 남아 있다(새로 만들지 않음). `TradePosition.plan`(가장 최근 매수건)·`nativeStopLoss`는
  옛 매도 기록의 손절가 대체값·유지 보수용.
- **같은 종목 = 항상 한 포지션**: 같은 자산명·통화로 보유 중이면 새 매수는 그 포지션으로. 전량 매도 후 재매수는 새 포지션.
- **매수별 매도**: 수량 칸 없음, 매수(N-n) 단위로만, **가장 최근 매수부터**(LIFO). `soldBuyIds` 저장. 평단·실현손익은 이동평균.
  매도일이 팔 매수의 매수일보다 빠르면 저장 막음, 같은 날이면 그 매수 1초 뒤로(`TradePosition.sellDate`).
  N = 같은 자산명의 몇 번째 거래(첫 매수일 순), n = 그 거래 안 몇 번째 매수(같은 시각은 단가 낮은 쪽 먼저).
- 매도 이유 4개 중복 선택(손절가 도달·박스권 이탈·이평선 이탈·강세 매도), 하나는 꼭.
- 매수 삭제(`buyDeletePlan`): 마지막 매수 → 거래 전체(매도·메모), 판 매수 → 그 매도도, 안 판 매수 → 그것만.
- 자산명 수정 시 같은 tradeId의 매수·매도·메모 이름을 모두 바꾼다.
- 보유일 = 거래일(주말 제외, 휴장일 미반영). 달러 종목 입력 기본 날짜 = 뉴욕 날짜(`defaultTradeDate`).
- 수수료·거래세: 현금 차감 + 누적 수수료에만, 순입금액·수익률·손익비·경지엔 미반영(gross). 매수 계산기 행 수수료만 수수료율로 자동.
- 배당·이자: 현금 증가, 순입금액 미반영. 양도소득세는 다루지 않는다.
- 용어: 순입금액, 허용손실, 계좌기여율, 손절률, 원칙, 피라미딩("불타기" 안 씀).
- **색상 규칙: 돈 유입/자산 증가 = 빨강, 유출/감소 = 파랑**(매수 빨강·매도 파랑, 입금·배당 빨강·출금 파랑). 경고 = 주황.
  매수·매도는 현금 방향이 아니라 **보유자산 증감** 기준이다(현금으로 보면 매수 = 유출이지만 그렇게 해석하지 않는다 — 한국 증시 관례).
  새 색은 `signColor`(`ui/format.ts`, ≥0 빨강 / <0 파랑), 예수금 종류는 `increasesCash`.

## 원화·달러 이중통화

① 장부 통화는 원화(총자산·순입금액·TWR·경지 총자산·수익쿠션). ② 실력 지표는 거래 통화 기준(달러 가격 수익률, 주화입마는 환차 뺀 매매손익).
③ 환전은 입출금이 아니다. ④ 총자산 = 원화 예수금 + 보유 매수원가 + 달러 예수금 × 달러 평균 매입 환율 — 설정 환율은 안 들어간다.
달러→원화 환전 때 환차손익 확정(받은 원화 − 바꾼 달러 × 평균 환율). 설정 환율 = 수동값과 마지막 환전 환율 중 최근 것(참고용).
달러 매수는 항상 달러 예수금에서, 환전은 예수금 기록("환전도 같이 기록" 보조).

## 리스크·경고

- 목표가 개념 없음. 손절률 = (손절가 − 포지션 평단) ÷ 평단, 손절 시 손익은 달러로 계산 후 원가 환율 하나로 환산.
  매수 건의 손절가 ≥ 매수가 → 그 건만 확보(리스크율·허용손실 칸이 확보수익률·확보이익으로 — 기록을 직접 그렇게 정한 경우에만 생긴다).
  총 오픈 리스크 = 보유 중인 매수 건이 각자 손절가에서 팔릴 때 잃는 금액의 합(`TradePosition.openRiskKRW`, 손절가가 매수가 이상인 건은 0). 매도 저장 때 손절가는
  팔리는 매수 건들의 손절가 수량 가중평균(`TradePosition.averageStop`).
- 매도 카드 격자: 손절가대비 | 손익률 | 계좌기여율 | 실현손익. 매수 카드: 손절가 | 손절률 | 리스크율 | 허용손실(진입 시 손절가 기준).
- **주황 경고 ①~⑪**(배너 없이 칸·알약 색만): ① 진입 리스크 > 허용손실 ② 손절폭 > 최대 손절폭 ③ 평단 아래 추가 매수
  ④ 종목 합계 비중 > 최대 비중 ⑤ (없어짐) ⑥ 현재가 7일 넘음 ⑦ 계좌기여율 < −진입 리스크율 ⑧ 손절가대비 −1% 초과
  ⑨ 손실 매도 보유일 > 수익 거래 평균 보유일(수익 5건 이상) ⑩ (없어짐) ⑪ 매수 건 보유 50거래일 초과.
  경고 기준(최대 비중 25%·최대 손절폭 10%, 0 = 끔)은 설정·백업 포함.
- 평단 = 이동평균(증권사 방식, `CostLedger`). 매도 원가는 항상 `TradePosition`으로 — 직접 평균 내지 않는다.

## 경지(등급) — 2026-11-14 개편 (원서 근거: `미너비니 원서 분석`)

9단계(범인→삼류→이류→일류→절정→초절정→화경→현경→생사경). 집계 단위 = 완료 거래(팔린 매수 1개 = 1건,
수익률은 그 매수 자기 매수가 기준). 단계 진행은 매도 1회당 한 번. 범인 = 완료 20건 미만, 20건이면 삼류(바닥, 요건 없음).
- **승급 요건**(`tier.ts` REQUIREMENTS — 숫자를 고치면 가이드 승급 표가 자동으로 따라간다): 총자산 + **조정 손익비**(승률×평균수익 ÷ 패률×평균손실,
  승률 하한 없음) + 손익비 + 평균 손실 상한 + 기준(설정 최대 손절폭)을 넘은 손실 횟수 + **증거 = 겹치지 않는 20건 구간 N개 연속 통과**.
  이류 1구간(자산 3천만·조정 1.0·손익비 1.5·평균 손실 10%) / 일류 2구간(1억·1.3·2.0·8%, 저자의 최소 목표 2:1) /
  절정 2(3억·1.6·2.0·7%) / 초절정 3(10억·1.9·2.0·6%, 미너비니 본인 수준) / 화경 3(30억·2.5) / 현경 4(100억·3.0, 저자의 "기쁜 수준" 3:1@50%) /
  생사경 5(300억·3.0, 같은 수준을 100건). 절정부터 **대박 1건 제외** 조정 손익비도 한 단계 아래 경지 기준을 넘어야 한다.
- **강등**: 현재 경지 기준 90% 아래(조정 손익비·손익비·평균 손실)인 구간이 2개 연속이면 한 단계(새 구간이 쌓일 때까지 재심사 없음).
  총자산이 경지 최소 밑이면 즉시 — **출금으로 줄어도 그대로 반영**(입출금 점마다 확인, 출금 입력 화면이 미리 안내).
- **주화입마**(원화 순손익 기대값 — 경지 요건의 % 지표와 일부러 다름): 최근 **20건·10건이 둘 다** 마이너스인 매도가 이어지면 역류 1–4 → 주화 5–9 →
  입마 10–14 → 퇴보 15+(한 단계 강등, 삼류 바닥은 입마). 리스크 제한 = **설정의 평소 리스크율(defaultRiskPercent) × 0.5(주화) / × 0.25(입마·퇴보)**,
  매수 입력에서 허용손실 숫자로 안내(매수를 막지는 않음). 순손실 매도 3연속부터 "크기를 줄여 보세요" 안내. 운기조식 = 5회 연속 플러스(역류는 1회),
  주화입마 중엔 승급 심사 멈춤. 경고 색은 모두 **주황**(빨강 = 자산 증가).
- 판정 시점 총자산은 타임라인 스냅샷 — 설정 환율로 경지가 바뀌지 않는다. 기록에서 100% 파생(저장 상태 없음).
- **경지 카드 그림(2026-11-14)**: 위쪽 히어로 = 큰 한자(`TIER_HANJA`, 二流…) + 수묵 번짐 + 금빛 붓 줄 + 작은 낙관 서명(한글 경지명), 그 아래 **죽간 띠**(아홉 경지 — 지나온 먹색·현재 금빛·남은 윤곽).
  조정 손익비 칸은 금색 띠(`StatCell highlight`, 경지·확인표 둘 다). 승급 = 금빛 낙관 도장 연출, 주화입마·강등 = 주황 점선 낙관 흔들림·균열 연출(`TierEventModal`,
  `screens/home/TierArt.tsx`; `prefers-reduced-motion`이면 정지). 사건 알림은 기기별 `lastSeenTier`·`lastSeenJuhwaipmaSeverity`로 한 번만.
- **현황 카드 3종**(시간 단위가 다르다 — 한 카드 = 한 기준): 경지 = **통산** 성적표(승률·평균수익률·평균손실률 / 손익비·조정 손익비(둘 다 소수 1자리 "2.3")·기준(-10%) 넘은 손실 /
  수익·손실 보유 평균·완료 거래, 누적수익률·연환산수익률은 총자산 추이 카드), 승급 심사 = **최근 20건 구간**(주화입마 패널·막힌 조건 게이지·증거 구간 ✓✗·
  유지 심사·자산 여유. **범인(완료 20건 미만)이면 삼류까지 완료 거래 N/20 진행 바** — 경지 카드엔 진행 바를 두지 않는다), 확인표 = **달력 기간**(승률·평균수익률·평균손실률 / 손절가대비·최대 수익·최대 손실 / 손익비·조정 손익비·기준 넘은 손실 /
  수익·손실 보유·거래 + 통산 대비 값 옆 작은 ▲▼(칸은 모두 라벨·값 2줄, 표본 적음 표시 없음) + 점검 한 줄, 평균 손실 7% 초과 주황). 확인표 상세 표·YTD·통산 요약은 같은 항목을 모두 보여 준다.
- 개발용 시나리오: 미리보기 주소에 `&tier=juhwa`(연패) / `&tier=rich`(입금 증가) / `&tier=both` / `&tier=beomin`(완료 12건) / `&order=old`(예전 카드 순서 저장) — `node scripts/shot.mjs "&tier=both#/home" /tmp/x.png`.
  (shot.mjs는 `lastSeenTier=1`이라 승급 알림이 뜬다 — 패널을 보려면 localStorage `lastSeenTier`·`lastSeenJuhwaipmaSeverity`를 맞춰 찍는다.)

## 백업·데이터

- 백업 JSON = 매수·매도·예수금·메모·프로필(별호+원칙)·설정(카드 순서·설정 환율·매매 기본값·경고 기준·수수료율). 블라인드 제외.
- 가져오기(`parseBackup`)는 웹 백업과 iOS 백업 모두 받는다. "전부 지우기"는 진입점 하나로.
- **온보딩은 데모 데이터를 심지 않는다**, "프로필이 비면 온보딩 + 온보딩이 데이터를 심음" 패턴 금지(iOS 중복 삽입 버그의 원인).
- 파일 선택 입력은 한 화면에 하나만 두는 쪽을 우선(iOS에서 익스포터 겹침으로 먹통된 경험).
