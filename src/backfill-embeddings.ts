import "dotenv/config";
import { findArticlesNeedingEmbeddings } from "./db/repository";
import { generateEmbeddings } from "./ai/embedder";
import { ensureVectorTable, upsertEmbeddings } from "./vector/store";
import { closeDb } from "./db/client";

/**
 * 기존 summarized 기사 중 임베딩이 없는 것들을 일괄 생성
 * 사용법: npx tsx src/backfill-embeddings.ts
 */
async function backfillEmbeddings(): Promise<void> {
  console.log("=== 임베딩 백필 시작 ===\n");

  ensureVectorTable();

  const batchSize = 50;
  let totalProcessed = 0;
  let totalEmbedded = 0;

  while (true) {
    const articles = findArticlesNeedingEmbeddings(batchSize);
    if (articles.length === 0) break;

    console.log(`[backfill] ${articles.length}건 처리 중...`);

    // 임베딩 대상 텍스트 준비 (title + summary)
    const texts = articles.map(
      (a) => `${a.title} ${a.summary || ""}`
    );

    // 일괄 임베딩 생성 (OpenAI batch API)
    const embeddings = await generateEmbeddings(texts);

    // 성공한 것만 벡터 저장
    const toStore = articles
      .map((article, i) => {
        const embedding = embeddings[i];
        return embedding ? { articleId: article.id, embedding } : null;
      })
      .filter((item) => item !== null);

    if (toStore.length > 0) {
      const stored = upsertEmbeddings(toStore);
      totalEmbedded += stored;
      console.log(`[backfill] ${stored}건 임베딩 저장 완료`);
    }

    totalProcessed += articles.length;

    // rate limit 방어
    if (articles.length === batchSize) {
      console.log("[backfill] 1초 대기 (rate limit)...");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== 임베딩 백필 완료 ===`);
  console.log(`  처리: ${totalProcessed}건, 임베딩 생성: ${totalEmbedded}건`);

  closeDb();
}

backfillEmbeddings().catch((err) => {
  console.error("백필 치명적 오류:", err);
  closeDb();
  process.exit(1);
});
