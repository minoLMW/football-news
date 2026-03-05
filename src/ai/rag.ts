import { getAnthropicClient, getModelId } from "./client";
import { generateEmbedding } from "./embedder";
import { searchSimilar } from "../vector/store";
import { findArticleById } from "../db/repository";

export interface RagResult {
  answer: string;
  sources: {
    id: number;
    title: string;
    category: string | null;
    distance: number;
  }[];
}

const RAG_SYSTEM_PROMPT = `당신은 축구 뉴스 전문 AI 어시스턴트입니다.
아래에 제공되는 기사 정보만을 근거로 사용자의 질문에 답변하세요.

규칙:
1. 제공된 기사에 없는 내용은 추측하지 마세요
2. 근거가 부족하면 "제공된 기사에서는 관련 정보를 찾을 수 없습니다"라고 답하세요
3. 답변은 한국어로, 자연스럽게 대화하듯 작성하세요
4. 관련 기사의 핵심 내용을 종합해서 답변하세요
5. 어떤 기사를 참고했는지 간략히 언급하세요`;

/**
 * RAG: 질문 → 벡터 검색 → 관련 기사 수집 → Claude 답변 생성
 */
export async function askWithRag(
  question: string,
  topK = 5
): Promise<RagResult | null> {
  // 1. 질문을 벡터로 변환
  const queryEmbedding = await generateEmbedding(question);
  if (!queryEmbedding) {
    console.error("[rag] 질문 임베딩 생성 실패");
    return null;
  }

  // 2. 벡터 유사도 검색
  const searchResults = searchSimilar(queryEmbedding, topK);
  if (searchResults.length === 0) {
    return {
      answer: "아직 저장된 기사가 없어 답변할 수 없습니다.",
      sources: [],
    };
  }

  // 3. 검색된 기사 상세 정보 조회
  const articles = searchResults
    .map((r) => {
      const article = findArticleById(r.articleId);
      return article ? { ...article, distance: r.distance } : null;
    })
    .filter((a) => a !== null);

  if (articles.length === 0) {
    return {
      answer: "관련 기사를 찾지 못했습니다.",
      sources: [],
    };
  }

  // 4. 컨텍스트 구성 (기사 정보를 프롬프트에 포함)
  const context = articles
    .map(
      (a, i) =>
        `[기사 ${i + 1}] (카테고리: ${a.category || "미분류"})
제목: ${a.title}
요약: ${a.summary || "요약 없음"}
발행일: ${a.pub_date || "알 수 없음"}`
    )
    .join("\n\n");

  // 5. Claude에게 컨텍스트 + 질문 전달
  try {
    const client = getAnthropicClient();
    const model = getModelId("sonnet");

    const response = await client.messages.create({
      model,
      max_tokens: 1000,
      system: RAG_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `참고 기사:\n${context}\n\n질문: ${question}`,
        },
      ],
    });

    const answer =
      response.content[0].type === "text" ? response.content[0].text : "";

    return {
      answer,
      sources: articles.map((a) => ({
        id: a.id,
        title: a.title,
        category: a.category,
        distance: a.distance,
      })),
    };
  } catch (err) {
    console.error("[rag] Claude 답변 생성 실패:", err);
    return null;
  }
}
