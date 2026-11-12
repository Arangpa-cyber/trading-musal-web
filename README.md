# 트레이딩:무살 (웹)

개인 트레이딩 저널 웹앱 — "트레이딩: 무림에서 살아남기". 무협 테마 경지 시스템으로 개인 트레이더 실력을 추적한다.

## 개발

```bash
npm install
npm run dev        # 개발 서버
npm test           # 계산 엔진 테스트 (TZ=Asia/Seoul)
npm run typecheck
npm run build
```

## 진행 상황

1. 뼈대 · 작업 규칙(CLAUDE.md) — 완료
2. 계산 엔진(`src/core`) + 테스트 — 완료
3. Supabase 로그인(구글) · 데이터 저장 — 완료 (`supabase/schema.sql`을 SQL Editor에서 실행)
4. 화면(현황 · 거래내역 · 입력 · 설정 · 가이드) — 예정
5. PWA · 배포 — 예정

실제 거래 데이터와 백업 파일은 저장소에 올리지 않는다.
