-- 002_vector.sql: 벡터 검색용 sqlite-vec 가상 테이블
-- 주의: sqlite-vec 확장이 로드된 상태에서만 실행 가능

CREATE VIRTUAL TABLE IF NOT EXISTS article_embeddings USING vec0(
  article_id INTEGER PRIMARY KEY,
  embedding  float[512]
);
