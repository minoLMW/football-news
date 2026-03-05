# ⚽ 축구 뉴스 AI 요약 서비스

## 한 줄 소개
해외 축구 뉴스를 RSS로 자동 수집하고, Claude AI로 한국어 요약 + 카테고리 분류하여 대시보드로 제공하는 풀스택 파이프라인

---

## 프로젝트 정보

| 항목 | 내용 |
| --- | --- |
| 기간 | 2026.02 (개인 프로젝트) |
| 인원 | 1인 |
| 역할 | 설계 · 백엔드 · AI 연동 · 프론트엔드 전체 |
| GitHub | (링크) |

---

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Runtime | Node.js (TypeScript) |
| Server | Express.js |
| Database | SQLite (better-sqlite3) |
| AI | Claude API (Anthropic SDK) |
| 수집 | rss-parser, cheerio |
| Frontend | Vanilla HTML/CSS/JS (단일 파일) |
| 개발환경 | Windows 11, tsx (watch mode) |

---

## 아키텍처

```
RSS 피드 (BBC, ESPN, Goal.com)
        ↓
  [1] RSS 파싱 (rss-parser)
        ↓
  [2] 본문 크롤링 (cheerio) — 실패 시 RSS description fallback
        ↓
  [3] Claude AI 요약 + 분류 (Anthropic SDK)
        ↓
  [4] SQLite 저장 (better-sqlite3, WAL 모드)
        ↓
  [5] Express REST API
        ↓
  [6] 웹 대시보드 (localhost:3000)
```

---

## 핵심 기능

### 1. 자동 뉴스 수집 파이프라인
- BBC Sport, ESPN, Goal.com 등 해외 축구 RSS 피드 병렬 수집
- `Promise.allSettled`로 **부분 실패 허용** — 피드 1개 다운돼도 나머지 정상 처리
- 본문 크롤링 실패 시 RSS description으로 자동 fallback → 파이프라인 중단 없음

### 2. Claude AI 한국어 요약·분류
- 영문 기사 → 3~4문장 한국어 요약 + 카테고리 자동 분류
- **요약과 분류를 단일 API 호출**로 처리 → 비용·지연 50% 절감
- 카테고리: 경기 결과, 이적/영입, 부상/복귀, 전술 분석, 리그 순위, 감독/팀 뉴스, 기타
- 선수명 한국어 표기 규칙 포함 (프롬프트 엔지니어링)

### 3. 상태 기반 데이터 관리
- 기사별 상태 추적: `pending → summarized | failed`
- `guid` UNIQUE 제약으로 **DB 레벨 중복 방지**
- **멱등성 보장** — 같은 파이프라인을 여러 번 돌려도 안전

### 4. REST API
- `GET /articles` — 필터링(카테고리, 상태) + 페이지네이션
- `GET /stats` — 전체/완료/대기/실패 통계
- `GET /categories` — 동적 카테고리 목록

### 5. 웹 대시보드
- 통계 카드, 기사 목록, 카테고리·상태 필터, 페이지네이션
- 빌드 없는 단일 HTML — Express static으로 바로 서빙
- 반응형 디자인 (모바일 대응)

---

## 기술 선택 근거

### better-sqlite3 (← node-sqlite3, TypeORM)
- **동기 API** → 코드가 직관적, 트랜잭션 관리 간단
- 단일 서버·적은 동시 요청 환경에서 동기 I/O 성능 충분
- WAL 모드로 읽기/쓰기 동시성 확보
- ORM 없이 순수 SQL → 소규모 프로젝트에서 유지보수 유리

### CJS (← ESM)
- `better-sqlite3`가 네이티브 C++ addon → ESM에서 import 충돌 가능성
- Node.js 생태계 CJS 호환성이 아직 가장 넓음
- tsx가 CJS/ESM 모두 지원 → 개발 편의성 유지

### cheerio (← Puppeteer)
- 뉴스 사이트 대부분 SSR → JS 렌더링 불필요
- 메모리: Puppeteer 500MB+ vs cheerio 수 MB
- 다단계 selector fallback으로 사이트별 HTML 구조 차이 대응

### 자체 마이그레이션 시스템 (← Knex, Prisma)
- `sql/` 폴더에 `.sql` 파일 추가만 하면 자동 적용
- `migrations` 테이블로 중복 실행 방지
- 외부 의존성 최소화 + SQL 직접 제어

---

## AI 활용 상세

### 모델 티어 분리
| 용도 | 모델 | 이유 |
| --- | --- | --- |
| 요약/분류 | claude-sonnet-4-5 | 빠르고 저렴, 요약에 충분한 품질 |
| 심층 분석 | claude-opus-4-5 | 비용 10배+, 필요한 경우만 사용 |

- `.env`로 모델 ID 관리 → 모델 업데이트 시 코드 변경 불필요

### 프롬프트 엔지니어링
- **System prompt**: 역할 부여 + JSON 출력 형식 강제 + 카테고리 목록 명시
- **User prompt**: 제목·본문 분리 제공 + 본문 3000자 컷 (토큰 비용 제어)
- 선수명 한국어 표기 규칙 → 일관된 요약 품질

### 방어적 설계
- Claude 응답이 ````json` 코드블록이면 정규식으로 제거
- 카테고리가 목록 외이면 "기타"로 자동 보정
- 파싱 실패 시 해당 기사만 `failed` → 전체 파이프라인 계속

---

## 설계 패턴

| 패턴 | 적용 위치 | 효과 |
| --- | --- | --- |
| Repository 패턴 | `db/repository.ts` | SQL 변경 범위 격리, 테스트 용이 |
| Pipeline 패턴 | `pipeline.ts` | 수집→요약→저장 단계별 독립 실행 |
| Singleton | DB 연결, AI 클라이언트 | 리소스 재사용, 연결 관리 |
| Graceful Fallback | 크롤링·요약 전체 | 부분 실패 허용, 파이프라인 연속성 |

---

## 트러블슈팅

### better-sqlite3 네이티브 빌드 실패 (Windows)
- **문제**: VS2022 BuildTools에 Windows SDK 누락 → node-gyp 컴파일 실패
- **원인 분석**: `gyp ERR! find VS - missing any Windows SDK` 에러 추적
- **해결**: VS BuildTools에 "Desktop development with C++" 워크로드 + Windows SDK 컴포넌트 추가 설치
- **교훈**: 네이티브 addon 의존성은 환경별 빌드 요구사항을 사전 파악해야 함

---

## 프로젝트 구조

```
football-news/
├── public/
│   └── index.html              # 웹 대시보드
├── sql/
│   └── 001_init.sql            # DB 스키마
├── src/
│   ├── ai/                     # Claude AI 연동
│   │   ├── client.ts           # Anthropic SDK 싱글턴
│   │   ├── prompts.ts          # 프롬프트 + 카테고리
│   │   └── summarizer.ts       # 요약/분류 로직
│   ├── db/                     # 데이터 계층
│   │   ├── client.ts           # SQLite 연결
│   │   ├── migrate.ts          # 마이그레이션
│   │   └── repository.ts       # CRUD
│   ├── rss/                    # 뉴스 수집
│   │   ├── feeds.ts            # 피드 소스
│   │   ├── parser.ts           # RSS 파싱
│   │   └── crawler.ts          # 본문 크롤링
│   ├── index.ts                # Express 서버
│   └── pipeline.ts             # 파이프라인 오케스트레이터
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 실행 방법

```bash
npm install
copy .env.example .env    # ANTHROPIC_API_KEY 설정
npm run db:migrate         # DB 스키마 적용
npm run pipeline           # 뉴스 수집 + AI 요약
npm run dev                # 서버 시작 → http://localhost:3000
```
