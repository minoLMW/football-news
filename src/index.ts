import "dotenv/config";
import express from "express";
import path from "node:path";
import { closeDb } from "./db/client";
import { findArticles, findArticleById, getStats } from "./db/repository";
import { CATEGORIES } from "./ai";
import { generateEmbedding } from "./ai/embedder";
import { ensureVectorTable, searchSimilar, getEmbeddingStats } from "./vector/store";
import { askWithRag } from "./ai/rag";

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

// --- 벡터 검색 (시맨틱 검색) ---
// GET /search?q=손흥민+활약&limit=5
app.get("/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim().length < 2) {
      res.status(400).json({ error: "검색어(q)를 2자 이상 입력하세요" });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 5, 20);

    const embedding = await generateEmbedding(query);
    if (!embedding) {
      res.status(500).json({ error: "검색어 임베딩 생성 실패" });
      return;
    }

    const results = searchSimilar(embedding, limit);

    // article 상세 정보 첨부
    const articles = results.map((r) => {
      const article = findArticleById(r.articleId);
      return {
        ...article,
        distance: r.distance,
      };
    });

    res.json({
      query,
      count: articles.length,
      data: articles,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- RAG 질의 (AI 답변 생성) ---
// POST /ask { "question": "손흥민 최근 활약은?" }
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== "string" || question.trim().length < 2) {
      res.status(400).json({ error: "question을 2자 이상 입력하세요" });
      return;
    }

    const topK = Math.min(Number(req.body.topK) || 5, 10);

    const result = await askWithRag(question, topK);
    if (!result) {
      res.status(500).json({ error: "RAG 답변 생성 실패" });
      return;
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- 서버 시작 ---
// 벡터 테이블 보장
ensureVectorTable();

const server = app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
  console.log(`[server] endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /articles?limit=20&offset=0&category=...&status=...`);
  console.log(`  GET  /stats`);
  console.log(`  GET  /categories`);
  console.log(`  GET  /search?q=검색어&limit=5`);
  console.log(`  POST /ask  { "question": "질문" }`);
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
