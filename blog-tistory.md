# 해외 축구 뉴스를 Claude AI로 자동 요약하는 서비스 만들기

> Node.js + TypeScript + Claude API로 RSS 수집 → AI 요약 → 대시보드까지 풀스택 개발한 과정을 정리합니다.

---

## 왜 만들었나?

해외 축구 뉴스를 매일 챙겨보는데, 영어 기사를 하나하나 읽기가 번거로웠습니다. BBC Sport, ESPN, Goal.com 등의 RSS 피드를 자동으로 수집하고, Claude AI가 한국어로 요약해주는 서비스를 만들면 어떨까 싶어 시작했습니다.

**목표는 간단했습니다:**
1. RSS 피드에서 최신 축구 뉴스를 자동으로 긁어오고
2. 기사 본문을 크롤링해서
3. Claude AI로 한국어 요약 + 카테고리 분류하고
4. 웹 대시보드에서 보기 좋게 보여주기

---

## 기술 스택

- **Runtime**: Node.js + TypeScript
- **서버**: Express.js
- **DB**: SQLite (better-sqlite3)
- **AI**: Claude API (Anthropic SDK)
- **크롤링**: rss-parser + cheerio
- **프론트**: 순수 HTML/CSS/JS (빌드 없음)

---

## 전체 아키텍처

```
RSS 피드 (BBC, ESPN, Goal.com)
        ↓
  [1] RSS 파싱
        ↓
  [2] 본문 크롤링 (실패 시 RSS description fallback)
        ↓
  [3] Claude AI 요약 + 카테고리 분류
        ↓
  [4] SQLite에 저장
        ↓
  [5] REST API로 제공
        ↓
  [6] 웹 대시보드
```

---

## 1단계: 프로젝트 뼈대 잡기

가장 먼저 고민한 건 **모듈 시스템**이었습니다.

ESM이 트렌드이긴 하지만, `better-sqlite3`가 네이티브 C++ addon이라 ESM에서 import 충돌이 날 수 있습니다. 안정성을 위해 **CJS(CommonJS)로 통일**했고, 개발 서버는 `tsx`를 사용해서 타입스크립트를 바로 실행합니다.

DB는 **better-sqlite3**를 선택했습니다. `node-sqlite3`보다 동기 API를 제공하기 때문에 코드가 훨씬 직관적입니다. 단일 서버에서 적은 동시 요청을 처리하는 환경이라 동기 I/O도 성능 문제가 없고, WAL 모드를 켜서 읽기/쓰기 동시성도 확보했습니다.

마이그레이션은 별도 라이브러리 없이 직접 만들었습니다. `sql/` 폴더에 `001_init.sql` 같은 파일을 추가하면 자동으로 순차 적용되는 구조입니다.

---

## 2단계: 뉴스 수집 모듈

### RSS 파싱

`rss-parser` 라이브러리로 BBC Sport, ESPN, Goal.com의 RSS 피드를 파싱합니다. 핵심은 **`Promise.allSettled`**로 병렬 수집한다는 점입니다.

```typescript
// Promise.all은 하나 실패하면 전체 실패
// Promise.allSettled는 개별 실패를 허용
const results = await Promise.allSettled(
  feeds.map(feed => parseFeed(feed))
);
```

피드 3개 중 1개가 다운되어도 나머지 2개는 정상 처리됩니다. 이런 **부분 실패 허용(fault tolerance)** 설계가 안정적인 수집의 핵심입니다.

### 본문 크롤링

Puppeteer 대신 **cheerio**를 선택했습니다. 뉴스 사이트는 대부분 SSR이라 JS 렌더링이 필요 없고, 메모리도 Puppeteer 500MB+ vs cheerio 수 MB로 차이가 큽니다.

문제는 뉴스 사이트마다 HTML 구조가 다르다는 점입니다. 이를 해결하기 위해 **다단계 selector fallback**을 적용했습니다:

```
<article> → [role="main"] → .article-body → ... → <p> 태그 수집
```

nav, ad, footer 같은 불필요 요소는 사전 제거하고, 크롤링 자체가 실패하면 **RSS description으로 fallback**합니다. 어떤 상황에서도 파이프라인이 멈추지 않습니다.

---

## 3단계: Claude AI 요약 파이프라인

### 모델 티어 분리

모든 요청에 고성능 모델을 쓸 필요는 없습니다. 요약/분류에는 **Sonnet** (빠르고 저렴), 심층 분석에만 **Opus** (고품질)를 사용합니다. 모델 ID는 `.env`로 관리해서 코드 변경 없이 교체할 수 있습니다.

### 요약 + 분류를 한 번에

별도 API 호출로 나누면 비용 2배, 지연 2배입니다. **단일 호출로 요약과 분류를 동시에** 처리하도록 프롬프트를 설계했습니다.

```json
{
  "summary": "손흥민이 토트넘 더비에서 결승골을 터뜨리며...",
  "category": "경기 결과"
}
```

카테고리는 미리 정의한 목록(경기 결과, 이적/영입, 부상/복귀, 전술 분석 등)에서 선택하도록 강제하고, 목록 밖의 값이 오면 "기타"로 자동 보정합니다.

### 프롬프트 엔지니어링 포인트

- 본문을 **3000자에서 컷** → 뉴스 핵심은 리드 문단에 집중되므로 토큰 비용 절약
- **선수명 한국어 표기 규칙**을 프롬프트에 명시 → 일관된 번역 품질
- JSON 출력을 강제하되, Claude가 ````json` 코드블록으로 감쌀 수 있으므로 정규식으로 제거하는 방어 코드 추가

### 순차 처리를 선택한 이유

Claude API에는 분당 요청 수 제한(rate limit)이 있습니다. 병렬로 쏘면 429 에러가 나고 재시도 로직이 필요해져서 복잡해집니다. 뉴스 수집은 실시간이 아닌 배치 작업이니까 **순차 + 500ms 간격**이 가장 안정적입니다.

---

## 4단계: DB 저장과 파이프라인 통합

### 중복 방지

RSS의 `guid`에 UNIQUE 제약을 걸고 `INSERT OR IGNORE`를 사용합니다. 애플리케이션 코드가 아닌 **DB 레벨에서 중복을 방지**하는 게 핵심입니다.

### 상태 기반 처리

각 기사는 `pending → summarized | failed` 상태를 가집니다. 파이프라인을 여러 번 돌려도 이미 처리된 기사는 건너뛰고, 실패한 기사만 재처리할 수 있습니다. 이걸 **멱등성(idempotency)**이라고 합니다.

### 기사별 격리

한 기사 처리가 실패해도 try-catch로 감싸져 있어서 전체 파이프라인이 중단되지 않습니다. 실패한 기사는 `failed` 상태로 마킹되어 나중에 원인을 파악할 수 있습니다.

---

## 5단계: REST API

```
GET /health                    → 서버 상태 확인
GET /articles?limit=20&offset=0&category=이적/영입&status=summarized
GET /stats                     → 전체/완료/대기/실패 통계
GET /categories                → 카테고리 목록
```

limit 최대값을 100으로 제한하고, DB 쿼리 레벨에서 WHERE 조건을 동적으로 조합합니다. 카테고리 목록을 별도 엔드포인트로 분리해서 프론트엔드가 필터 UI를 동적으로 구성할 수 있게 했습니다.

---

## 6단계: 웹 대시보드

프레임워크 없이 **단일 HTML 파일**로 만들었습니다. 이 프로젝트의 본질은 백엔드 파이프라인이고, UI는 결과 확인용이라 React/Vue는 과잉입니다.

Express의 `express.static`으로 `public/` 폴더를 바로 서빙하니 빌드 스텝도 필요 없고, 같은 오리진이라 CORS 문제도 없습니다.

대시보드 기능:
- 통계 카드 (전체/요약완료/대기/실패)
- 카테고리·상태 필터
- 기사 카드 (소스 배지, 한국어 요약, 상대 시간)
- 페이지네이션
- 반응형 (모바일 대응)

모든 동적 데이터는 **XSS 방어를 위해 HTML 이스케이프** 처리합니다.

---

## 트러블슈팅: better-sqlite3 빌드 실패

Windows에서 `npm install` 시 `better-sqlite3`가 네이티브 C++ 컴파일에 실패하는 문제가 발생했습니다.

```
gyp ERR! find VS - missing any Windows SDK
```

VS2022 BuildTools는 설치되어 있었지만 **Windows SDK 컴포넌트가 누락**된 상태였습니다. Visual Studio Installer에서 "Desktop development with C++" 워크로드에 Windows SDK를 추가 설치하니 해결되었습니다.

**교훈**: 네이티브 addon 의존성을 사용할 때는 환경별 빌드 요구사항을 README에 명시해야 합니다.

---

## 프로젝트 구조

```
football-news/
├── public/index.html           # 웹 대시보드
├── sql/001_init.sql            # DB 스키마
├── src/
│   ├── ai/                     # Claude AI 연동
│   ├── db/                     # 데이터 계층 (Repository 패턴)
│   ├── rss/                    # 뉴스 수집
│   ├── index.ts                # Express 서버
│   └── pipeline.ts             # 파이프라인 오케스트레이터
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 배운 점

1. **AI API 연동은 방어적으로** — 응답 형식이 항상 기대대로 오지 않는다. JSON 파싱 방어, 카테고리 자동 보정 같은 fallback이 필수다.

2. **부분 실패를 허용하는 설계** — `Promise.allSettled`, 기사별 try-catch, RSS description fallback 등 어디서 실패해도 전체가 멈추지 않게 만드는 것이 실서비스 안정성의 핵심이다.

3. **비용 최적화는 아키텍처 레벨에서** — 모델 티어 분리, 요약+분류 단일 호출, 본문 3000자 컷 등 작은 결정들이 모이면 비용 차이가 크다.

4. **멱등성은 배치 시스템의 생명** — 같은 파이프라인을 여러 번 돌려도 안전해야 크론잡이나 재시도가 가능하다.

5. **기술 선택에는 이유가 있어야 한다** — "왜 이 라이브러리를?" "왜 이 패턴을?"에 답할 수 있어야 의미 있는 프로젝트다.

---

## 실행 방법

```powershell
cd D:\workspace\football-news
npm install
copy .env.example .env          # ANTHROPIC_API_KEY 설정
npm run db:migrate              # DB 스키마 적용
npm run pipeline                # 뉴스 수집 + AI 요약
npm run dev                     # 서버 시작 → http://localhost:3000
```
