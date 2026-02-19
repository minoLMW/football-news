import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다");
  }

  client = new Anthropic({ apiKey });
  return client;
}

/**
 * 용도별 모델 ID 반환
 * - sonnet: 요약/분류 (빠르고 저렴)
 * - opus: 심층 분석 (필요 시)
 */
export function getModelId(tier: "sonnet" | "opus"): string {
  if (tier === "opus") {
    return process.env.CLAUDE_OPUS_MODEL || "claude-opus-4-5-20251101";
  }
  return process.env.CLAUDE_SONNET_MODEL || "claude-sonnet-4-5-20250929";
}
