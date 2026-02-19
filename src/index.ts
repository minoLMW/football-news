import "dotenv/config";
import express from "express";
import path from "node:path";
import { closeDb } from "./db/client";
import { findArticles, getStats } from "./db/repository";
import { CATEGORIES } from "./ai";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.resolve("public")));

// --- Health Check ---
app.get("/health", (_req, res) => {
  try {
    const stats = getStats();
    res.json({ status: "ok", db: true, articles: stats.total });
  } catch (err) {
    res.status(500).json({ status: "error", message: String(err) });
  }
});

// --- 기사 목록 조회 ---
// GET /articles?limit=20&offset=0&category=이적/영입&status=summarized
app.get("/articles", (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;

    const articles = findArticles({ limit, offset, category, status });

    res.json({
      count: articles.length,
      limit,
      offset,
      data: articles,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- 통계 ---
app.get("/stats", (_req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- 카테고리 목록 ---
app.get("/categories", (_req, res) => {
  res.json({ categories: CATEGORIES });
});

// --- 서버 시작 ---
const server = app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
  console.log(`[server] endpoints:`);
  console.log(`  GET /health`);
  console.log(`  GET /articles?limit=20&offset=0&category=...&status=...`);
  console.log(`  GET /stats`);
  console.log(`  GET /categories`);
});

// 종료 처리
function shutdown() {
  console.log("\n[server] shutting down...");
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
