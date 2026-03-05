import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "node:path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DB_PATH || "data/football-news.db";
  const resolved = path.resolve(dbPath);

  db = new Database(resolved);

  // SQLite 성능 최적화
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // sqlite-vec 확장 로드 (벡터 검색용)
  sqliteVec.load(db);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
