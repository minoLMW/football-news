import "dotenv/config";
import { FEED_SOURCES, parseAllFeeds, getArticleContent } from "./rss";
import { summarizeArticle } from "./ai";
import { generateEmbedding } from "./ai/embedder";
import {
  insertArticles,
  findPendingArticles,
  updateRawContent,
  updateSummary,
  markFailed,
  getStats,
} from "./db/repository";
import { ensureVectorTable, upsertEmbedding, getEmbeddingStats } from "./vector/store";
import { closeDb } from "./db/client";

/**
 * 전체 파이프라인: RSS 수집 → 크롤링 → 요약 → DB 저장
 */
async function runPipeline(): Promise<void> {
  console.log("=== 파이프라인 시작 ===\n");

  // 벡터 테이블 존재 확인
  ensureVectorTable();

  // 1. RSS 수집 + DB 삽입
  console.log("[1/3] RSS 피드 수집 중...");
  const rssItems = await parseAllFeeds(FEED_SOURCES);
  const newCount = insertArticles(rssItems);
  console.log(`[1/3] 완료: ${rssItems.length}건 수집, ${newCount}건 신규\n`);

  // 2. pending 기사 크롤링 + 요약
  console.log("[2/3] 본문 크롤링 + AI 요약 중...");
  const pending = findPendingArticles(20);
  console.log(`[2/3] 처리 대상: ${pending.length}건\n`);

  let successCount = 0;
  let failCount = 0;
  let embeddingCount = 0;

  for (let i = 0; i < pending.length; i++) {
    const article = pending[i];
    console.log(`\n--- (${i + 1}/${pending.length}) ${article.title}`);

    try {
      // 크롤링
      const { content, source } = await getArticleContent(
        article.link,
        "" // DB에는 description이 없으므로 빈 문자열
      );
      console.log(`  크롤링: ${source} (${content.length}자)`);

      if (content) {
        updateRawContent(article.id, content);
      }

      // 요약
      const result = await summarizeArticle(article.title, content);

      if (result) {
        updateSummary(article.id, result);
        console.log(`  요약: ${result.category} - ${result.summary.slice(0, 50)}...`);
        successCount++;

        // 임베딩 생성 + 벡터 저장
        const textToEmbed = `${article.title} ${result.summary}`;
        const embedding = await generateEmbedding(textToEmbed);
        if (embedding) {
          upsertEmbedding(article.id, embedding);
          embeddingCount++;
          console.log(`  임베딩: 저장 완료 (${embedding.length}차원)`);
        } else {
          console.warn(`  임베딩: 생성 실패 (요약은 성공)`);
        }
      } else {
        markFailed(article.id);
        console.log(`  요약 실패`);
        failCount++;
      }
    } catch (err) {
      markFailed(article.id);
      console.error(`  처리 오류:`, err);
      failCount++;
    }
  }

  // 3. 결과 리포트
  console.log("\n[3/3] 파이프라인 완료");
  console.log(`  이번 실행: 성공 ${successCount}, 실패 ${failCount}, 임베딩 ${embeddingCount}`);

  const stats = getStats();
  const embeddingStats = getEmbeddingStats();
  console.log(`  전체 현황: 총 ${stats.total}건 (요약완료 ${stats.summarized} / 대기 ${stats.pending} / 실패 ${stats.failed})`);
  console.log(`  벡터 현황: 임베딩 ${embeddingStats.total}건 저장`);

  closeDb();
  console.log("\n=== 파이프라인 종료 ===");
}

runPipeline().catch((err) => {
  console.error("파이프라인 치명적 오류:", err);
  closeDb();
  process.exit(1);
});
