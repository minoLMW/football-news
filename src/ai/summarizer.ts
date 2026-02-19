import { getAnthropicClient, getModelId } from "./client";
import { SYSTEM_PROMPT, buildUserPrompt, CATEGORIES, ArticleCategory } from "./prompts";

export interface SummaryResult {
  summary: string;
  category: ArticleCategory;
}

/**
 * 기사 제목+본문으로 Claude 요약/분류 요청
 * 실패 시 null 반환 → 호출측에서 status='failed' 처리
 */
export async function summarizeArticle(
  title: string,
  content: string
): Promise<SummaryResult | null> {
  if (!content || content.length < 20) {
    console.warn(`[ai] 본문이 너무 짧아 요약 불가: "${title}"`);
    return null;
  }

  try {
    const client = getAnthropicClient();
    const model = getModelId("sonnet");

    const response = await client.messages.create({
      model,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(title, content),
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return parseResponse(text);
  } catch (err) {
    console.error(`[ai] 요약 실패: "${title}"`, err);
    return null;
  }
}

/**
 * Claude 응답 JSON 파싱 + 유효성 검증
 */
function parseResponse(raw: string): SummaryResult | null {
  try {
    // JSON 블록이 ```로 감싸져 올 수 있음
    const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.summary || typeof parsed.summary !== "string") {
      console.warn("[ai] 응답에 summary 없음:", raw);
      return null;
    }

    // 카테고리 유효성 검증, 목록에 없으면 "기타"로 보정
    const category = CATEGORIES.includes(parsed.category)
      ? parsed.category
      : "기타";

    return {
      summary: parsed.summary,
      category: category as ArticleCategory,
    };
  } catch {
    console.error("[ai] JSON 파싱 실패:", raw);
    return null;
  }
}

/**
 * 여러 기사를 순차 요약 (API rate limit 고려)
 * 병렬 처리 시 429 에러 위험 → 순차가 안전
 */
export async function summarizeArticles(
  articles: { title: string; content: string }[]
): Promise<(SummaryResult | null)[]> {
  const results: (SummaryResult | null)[] = [];

  for (let i = 0; i < articles.length; i++) {
    const { title, content } = articles[i];
    console.log(`[ai] 요약 중 (${i + 1}/${articles.length}): ${title}`);

    const result = await summarizeArticle(title, content);
    results.push(result);

    // rate limit 방어: 요청 사이 간격
    if (i < articles.length - 1) {
      await sleep(500);
    }
  }

  const success = results.filter((r) => r !== null).length;
  console.log(`[ai] 요약 완료: ${success}/${articles.length}건 성공`);

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
