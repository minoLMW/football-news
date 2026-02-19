-- 001_init.sql: 축구 뉴스 초기 스키마

CREATE TABLE IF NOT EXISTS articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guid          TEXT    NOT NULL UNIQUE,          -- RSS item guid (중복 방지 키)
  source        TEXT    NOT NULL,                 -- RSS 피드 출처명
  title         TEXT    NOT NULL,                 -- 원문 제목
  link          TEXT    NOT NULL,                 -- 원문 URL
  pub_date      TEXT,                             -- 발행일 (ISO 8601)
  raw_content   TEXT,                             -- 크롤링한 본문 (HTML 제거 후)
  summary       TEXT,                             -- Claude 요약 (한국어)
  category      TEXT,                             -- Claude 분류 카테고리
  status        TEXT    NOT NULL DEFAULT 'pending', -- pending | summarized | failed
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_guid   ON articles(guid);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date);

-- 마이그레이션 이력 추적
CREATE TABLE IF NOT EXISTS migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT    NOT NULL UNIQUE,
  applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
