/**
 * Claude 프롬프트 템플릿
 * 요약과 카테고리 분류를 단일 호출로 처리 (비용 절감)
 */

export const CATEGORIES = [
  "이적/영입",
  "경기 결과",
  "경기 프리뷰",
  "부상/선수 상태",
  "감독/전술",
  "리그 순위/통계",
  "국가대표",
  "기타",
] as const;

export type ArticleCategory = (typeof CATEGORIES)[number];

export const SYSTEM_PROMPT = `당신은 축구 뉴스 전문 편집자입니다.
영문 축구 기사를 한국어로 요약하고, 카테고리를 분류합니다.

규칙:
1. 요약은 한국어로, 2~3문장으로 핵심만 전달
2. 선수명·팀명은 널리 알려진 한국어 표기 사용 (예: Manchester United → 맨체스터 유나이티드)
3. 카테고리는 반드시 아래 목록 중 하나를 선택:
   ${CATEGORIES.join(", ")}
4. 반드시 아래 JSON 형식으로만 응답:
   {"summary": "...", "category": "..."}
5. JSON 외의 텍스트를 출력하지 마세요`;

export function buildUserPrompt(title: string, content: string): string {
  // 본문이 너무 길면 잘라서 토큰 절약
  const trimmed = content.length > 3000 ? content.slice(0, 3000) + "..." : content;

  return `다음 축구 기사를 요약하고 카테고리를 분류하세요.

제목: ${title}

본문:
${trimmed}`;
}
