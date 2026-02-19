import { getDb } from "./client";
import type { RssItem } from "../rss";
import type { SummaryResult } from "../ai";

export interface ArticleRow {
  id: number;
  guid: string;
  source: string;
  title: string;
  link: string;
  pub_date: string | null;
  raw_content: string | null;
  summary: string | null;
  category: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * guid 존재 여부 확인 (중복 수집 방지)
 */
export function existsByGuid(guid: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT 1 FROM articles WHERE guid = ?").get(guid);
  return !!row;
}

/**
 * RSS 아이템을 pending 상태로 삽입
 * 이미 존재하면 무시 (INSERT OR IGNORE)
 */
export function insertArticle(item: RssItem): number | null {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO articles (guid, source, title, link, pub_date, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    )
    .run(item.guid, item.source, item.title, item.link, item.pubDate);

  return result.changes > 0 ? Number(result.lastInsertRowid) : null;
}

/**
 * 여러 RSS 아이템 일괄 삽입 (트랜잭션)
 * 반환: 신규 삽입된 건수
 */
export function insertArticles(items: RssItem[]): number {
  const db = getDb();
  let inserted = 0;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO articles (guid, source, title, link, pub_date, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  );

  const tx = db.transaction(() => {
    for (const item of items) {
      const result = insert.run(
        item.guid,
        item.source,
        item.title,
        item.link,
        item.pubDate
      );
      if (result.changes > 0) inserted++;
    }
  });

  tx();
  return inserted;
}

/**
 * 크롤링한 본문 저장
 */
export function updateRawContent(id: number, content: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE articles SET raw_content = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(content, id);
}

/**
 * AI 요약/분류 결과 저장
 */
export function updateSummary(
  id: number,
  result: SummaryResult
): void {
  const db = getDb();
  db.prepare(
    `UPDATE articles
     SET summary = ?, category = ?, status = 'summarized', updated_at = datetime('now')
     WHERE id = ?`
  ).run(result.summary, result.category, id);
}

/**
 * 요약 실패 상태로 업데이트
 */
export function markFailed(id: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE articles SET status = 'failed', updated_at = datetime('now') WHERE id = ?`
  ).run(id);
}

/**
 * pending 상태 기사 조회 (크롤링/요약 대상)
 */
export function findPendingArticles(limit = 20): ArticleRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM articles WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`
    )
    .all(limit) as ArticleRow[];
}

/**
 * 전체 기사 조회 (최신순, 페이지네이션)
 */
export function findArticles(
  opts: { limit?: number; offset?: number; category?: string; status?: string } = {}
): ArticleRow[] {
  const { limit = 20, offset = 0, category, status } = opts;
  const db = getDb();

  const conditions: string[] = [];
  const params: any[] = [];

  if (category) {
    conditions.push("category = ?");
    params.push(category);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit, offset);

  return db
    .prepare(
      `SELECT * FROM articles ${where} ORDER BY pub_date DESC, created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params) as ArticleRow[];
}

/**
 * 기사 통계
 */
export function getStats(): { total: number; pending: number; summarized: number; failed: number } {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'summarized' THEN 1 ELSE 0 END) as summarized,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM articles`
    )
    .get() as any;

  return {
    total: row.total || 0,
    pending: row.pending || 0,
    summarized: row.summarized || 0,
    failed: row.failed || 0,
  };
}
