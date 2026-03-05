import OpenAI from "openai";

let client: OpenAI | null = null;

/** 임베딩 벡터 차원 수 (text-embedding-3-small 기본 1536, 비용 절감 위해 512로 축소) */
export const EMBEDDING_DIMENSIONS = 512;

function getOpenAIClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 환경변수가 설정되지 않았습니다");
  }

  client = new OpenAI({ apiKey });
  return client;
}

/**
 * 텍스트를 임베딩 벡터로 변환
 * 실패 시 null 반환 → 호출측에서 처리
 */
export async function generateEmbedding(
  text: string
): Promise<number[] | null> {
  if (!text || text.trim().length < 5) {
    console.warn("[embedding] 텍스트가 너무 짧아 임베딩 불가");
    return null;
  }

  try {
    const openai = getOpenAIClient();

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000), // 토큰 제한 방어
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data[0].embedding;
  } catch (err) {
    console.error("[embedding] 임베딩 생성 실패:", err);
    return null;
  }
}

/**
 * 여러 텍스트를 일괄 임베딩 (OpenAI batch API 활용)
 * 최대 2048개까지 한 번에 처리 가능
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  // 빈 텍스트 필터링 후 batch 요청
  const validEntries = texts.map((text, idx) => ({ text: text.trim(), idx }));
  const toEmbed = validEntries.filter((e) => e.text.length >= 5);

  if (toEmbed.length === 0) {
    return texts.map(() => null);
  }

  try {
    const openai = getOpenAIClient();

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: toEmbed.map((e) => e.text.slice(0, 8000)),
      dimensions: EMBEDDING_DIMENSIONS,
    });

    // 결과를 원래 인덱스에 매핑
    const results: (number[] | null)[] = texts.map(() => null);
    for (let i = 0; i < response.data.length; i++) {
      results[toEmbed[i].idx] = response.data[i].embedding;
    }

    const success = results.filter((r) => r !== null).length;
    console.log(`[embedding] 일괄 임베딩: ${success}/${texts.length}건 성공`);

    return results;
  } catch (err) {
    console.error("[embedding] 일괄 임베딩 실패:", err);
    return texts.map(() => null);
  }
}
