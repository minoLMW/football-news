import fs from "node:fs";
import path from "node:path";
import { getDb, closeDb } from "./client";
import "dotenv/config";

function ensureDataDir(): void {
  const dbPath = process.env.DB_PATH || "data/football-news.db";
  const dir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function migrate(): void {
  ensureDataDir();

  const db = getDb();
  const sqlDir = path.resolve("sql");

  // migrations 테이블이 없으면 먼저 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare("SELECT filename FROM migrations")
      .all()
      .map((row: any) => row.filename)
  );

  const files = fs
    .readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(sqlDir, file), "utf-8");

    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO migrations (filename) VALUES (?)").run(file);
    })();

    console.log(`[migrate] applied: ${file}`);
    count++;
  }

  if (count === 0) {
    console.log("[migrate] 모든 마이그레이션이 이미 적용됨");
  } else {
    console.log(`[migrate] 총 ${count}개 마이그레이션 적용 완료`);
  }

  closeDb();
}

migrate();
