import * as cheerio from "cheerio";

const CRAWL_TIMEOUT = 10_000; // 10초

/**
 * URL에서 기사 본문 텍스트를 추출
 * 실패 시 null 반환 → 호출측에서 RSS description fallback 처리
 */
export async function crawlArticle(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CRAWL_TIMEOUT);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "football-news-bot/0.1",
        Accept: "text/html",
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[crawler] HTTP ${res.status}: ${url}`);
      return null;
    }

    const html = await res.text();
    const text = extractArticleText(html);

    if (!text || text.length < 100) {
      console.warn(`[crawler] 본문 추출 부족 (${text?.length || 0}자): ${url}`);
      return null;
    }

    return text;
  } catch (err) {
    console.warn(`[crawler] 크롤링 실패: ${url}`, err);
    return null;
  }
}

/**
 * HTML에서 기사 본문 텍스트만 추출
 * <article>, [role="main"], .article-body 등 일반적인 뉴스 사이트 구조 탐색
 */
function extractArticleText(html: string): string | null {
  const $ = cheerio.load(html);

  // 불필요한 요소 제거
  $(
    "script, style, nav, header, footer, aside, .ad, .ads, .advertisement, .social-share, .related-articles, [role='navigation'], [role='banner']"
  ).remove();

  // 본문 영역 우선순위 탐색
  const selectors = [
    "article",
    '[role="main"]',
    ".article-body",
    ".story-body",
    ".article__body",
    ".post-content",
    ".entry-content",
    "main",
  ];

  for (const selector of selectors) {
    const el = $(selector);
    if (el.length > 0) {
      const text = el.text().replace(/\s+/g, " ").trim();
      if (text.length >= 100) return text;
    }
  }

  // 최후 수단: body 전체에서 p 태그 텍스트 수집
  const paragraphs = $("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 30);

  if (paragraphs.length > 0) {
    return paragraphs.join("\n\n");
  }

  return null;
}

/**
 * 본문 크롤링 시도 → 실패 시 RSS description fallback
 */
export async function getArticleContent(
  url: string,
  rssDescription: string
): Promise<{ content: string; source: "crawled" | "rss_fallback" }> {
  const crawled = await crawlArticle(url);

  if (crawled) {
    return { content: crawled, source: "crawled" };
  }

  if (rssDescription && rssDescription.length > 20) {
    console.log(`[crawler] fallback to RSS description: ${url}`);
    return { content: rssDescription, source: "rss_fallback" };
  }

  return { content: "", source: "rss_fallback" };
}
