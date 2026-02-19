import RssParser from "rss-parser";
import { FeedSource } from "./feeds";

const rssParser = new RssParser({
  timeout: 10_000, // 10초 타임아웃
  headers: {
    "User-Agent": "football-news-bot/0.1",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
});

export interface RssItem {
  guid: string;
  source: string;
  title: string;
  link: string;
  pubDate: string | null;
  description: string; // RSS description (fallback 본문)
}

/**
 * 단일 RSS 피드를 파싱하여 아이템 배열 반환
 */
export async function parseFeed(feed: FeedSource): Promise<RssItem[]> {
  try {
    const result = await rssParser.parseURL(feed.url);
    const items: RssItem[] = [];

    for (const entry of result.items) {
      // guid가 없으면 link를 대체 키로 사용
      const guid = entry.guid || entry.link || "";
      if (!guid) continue;

      items.push({
        guid,
        source: feed.name,
        title: entry.title || "(제목 없음)",
        link: entry.link || "",
        pubDate: entry.isoDate || entry.pubDate || null,
        description: entry.contentSnippet || entry.content || "",
      });
    }

    console.log(`[rss] ${feed.name}: ${items.length}건 수집`);
    return items;
  } catch (err) {
    console.error(`[rss] ${feed.name} 파싱 실패:`, err);
    return [];
  }
}

/**
 * 모든 피드를 병렬로 파싱
 */
export async function parseAllFeeds(
  feeds: FeedSource[]
): Promise<RssItem[]> {
  const results = await Promise.allSettled(
    feeds.map((feed) => parseFeed(feed))
  );

  const items: RssItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    }
  }

  console.log(`[rss] 전체 수집 완료: 총 ${items.length}건`);
  return items;
}
