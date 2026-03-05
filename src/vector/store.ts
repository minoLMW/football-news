import { getDb } from "../db/client";
import { EMBEDDING_DIMENSIONS } from "../ai/embedder";

/**
 * 벡터 테이블 존재 확인
 * migrate.ts에서 생성하지만, 런타임에서도 안전하게 확인
 */
export function ensureVectorTable(): void {
  const db = getDb();
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS article_embeddings USING vec0(
      article_id INTEGER PRIMARY KEY,
      embedding  float[${EMBEDDING_DIMENSIONS}]
    )
  `);
}

/**
 * 기사 임베딩 저장 (upsert)
 * vec0는 INSERT OR REPLACE를 지원하므로 중복 시 덮어씀
 */
export function upsertEmbedding(articleId: number, embedding: number[]): void {
  const db = getDb();
  const vec = new Float32Array(embedding);

  // vec0는 rowid 기반이라 DELETE + INSERT로 upsert 구현
  db.prepare("DELETE FROM article_embeddings WHERE article_id = ?").run(
    articleId
  );
  db.prepare(
    "INSERT INTO article_embeddings(article_id, embedding) VALUES (?, ?)"
  ).run(articleId, Buffer.from(vec.buffer));
}

/**
 * 여러 기사 임베딩 일괄 저장 (트랜잭션)
 */
export function upsertEmbeddings(
  items: { articleId: number; embedding: number[] }[]
): number {
  const db = getDb();
  let count = 0;

  const del = db.prepare(
    "DELETE FROM article_embeddings WHERE article_id = ?"
  );
  const ins = db.prepare(
    "INSERT INTO article_embeddings(article_id, embedding) VALUES (?, ?)"
  );

  const tx = db.transaction(() => {
    for (const { articleId, embedding } of items) {
      const vec = new Float32Array(embedding);
      del.run(articleId);
      ins.run(articleId, Buffer.from(vec.buffer));
      count++;
    }
  });

  tx();
  return count;
}

export interface VectorSearchResult {
  articleId: number;
  distance: number;
}

/**
 * 벡터 유사도 검색 (KNN)
 * 가까운 순서대로 topK개 반환 (distance 오름차순)
 */
export function searchSimilar(
  queryEmbedding: number[],
  topK = 5
): VectorSearchResult[] {
  const db = getDb();
  const vec = new Float32Array(queryEmbedding);

  const rows = db
    .prepare(
      `SELECT article_id, distance
       FROM article_embeddings
       WHERE embedding MATCH ?
       ORDER BY distance
       LIMIT ?`
    )
    .all(Buffer.from(vec.buffer), topK) as {
    article_id: number;
    distance: number;
  }[];

  return rows.map((row) => ({
    articleId: row.article_id,
    distance: row.distance,
  }));
}

/**
 * 특정 기사의 임베딩 존재 여부 확인
 */
export function hasEmbedding(articleId: number): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 FROM article_embeddings WHERE article_id = ?")
    .get(articleId);
  return !!row;
}

/**
 * 임베딩 통계
 */
export function getEmbeddingStats(): { total: number } {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as total FROM article_embeddings")
    .get() as { total: number };
  return { total: row.total || 0 };
}
