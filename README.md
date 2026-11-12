# 인컴 세이프 · AI 제안 검증 도구

재무설계사가 AI 자산배분안(A안)의 오류·적합성을 점검하고, 수정안(B안)과 같은 시나리오로 비교해 근거를 남겨 채택하는 모바일 웹앱입니다. 고객 데이터는 브라우저에만 저장합니다. 금액 단위는 만 원입니다.

```
npm install
npm run dev     # 개발 서버 (http://localhost:5173, /api 서버 함수도 같이 동작)
npm test        # 기획서 6장 정답값 대조 + 서버 함수 테스트
npm run build   # dist/
```

## 환경변수 (키)

`.env.example`을 보고 `.env.local`(로컬) 또는 Vercel 프로젝트 Settings → Environment Variables(배포)에 **같은 이름**으로 넣습니다. 실제 키는 `.env.example`에 넣지 마세요(GitHub에 올라갑니다).

| 이름 | 쓰는 곳 |
|---|---|
| `GEMINI_API_KEY` | ①-1 서류로 자동 입력 (Gemini) |
| `ECOS_API_KEY` | ⓪-2b 기준금리·예금·대출 금리 (한국은행 ECOS) |
| `KOSIS_API_KEY` | ⓪-2b 소비자물가 (KOSIS) |
| `DATA_GO_KR_KEY` | ⓪-2b 코스피 지수 (공공데이터포털 · 금융위원회 지수시세정보 **활용 신청 필요**) |
| `APP_ACCESS_CODE` (선택) | 설정하면 코드를 아는 사람만 `/api`를 쓸 수 있음 |
| `GEMINI_MODEL` (선택) | 비우면 gemini-3.1-flash-lite → 3.5-flash → flash-latest 순으로 시도 |

키 값은 서버 함수에서만 읽고 브라우저로 내보내지 않습니다. 키가 없으면 해당 기능만 "연결 안 됨"으로 표시되고 나머지는 그대로 동작합니다.

## 구조

- `src/engine.js` 월별 계산 엔진(기획서 4장), 확률 시뮬레이션
- `src/rules.js` AI 원안 점검 7개 규칙, 안전선, 상품·세제, 노후, 이벤트 템플릿, 입력 검증
- `src/Wire.jsx`, `src/Screens.jsx`, `src/Integ.jsx` 화면
- `api/extract.js` 서류 읽기(Gemini), `api/market.js` 시장 데이터(ECOS·KOSIS·공공데이터포털)
- `public/data/*.json` 고객 프리셋 2명(서윤·민준), 시장 환경

## 남용 방지

`/api`는 요청 횟수 제한(IP당), 일일 총량, 5분 캐시를 둡니다. 서버리스 인스턴스 단위의 방어라서 비용 한도는 Google AI Studio와 각 기관 쪽 쿼터로도 반드시 걸어 두세요.
