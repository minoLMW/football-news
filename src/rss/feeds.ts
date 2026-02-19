/**
 * RSS 피드 소스 정의
 * 새 피드 추가 시 이 배열에 항목을 추가하면 됨
 */
export interface FeedSource {
  name: string;       // 출처 표시명
  url: string;        // RSS 피드 URL
  language: string;   // 피드 언어 (ko, en 등)
}

export const FEED_SOURCES: FeedSource[] = [
  {
    name: "BBC Football",
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    language: "en",
  },
  {
    name: "ESPN FC",
    url: "https://www.espn.com/espn/rss/soccer/news",
    language: "en",
  },
  {
    name: "Goal.com",
    url: "https://www.goal.com/feeds/en/news",
    language: "en",
  },
];
