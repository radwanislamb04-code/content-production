import { createFileRoute } from "@tanstack/react-router";

type TrendItem = { title: string; metric: string; source: string };

const CACHE_TTL = 21600; // 6 hours

export const Route = createFileRoute("/api/trends")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;
        const kv = env?.KV;
        const serApiKey = env?.SERPAPI_KEY;
        const youtubeApiKey = env?.YOUTUBE_API_KEY;

        const url = new URL(request.url);
        const platform = url.searchParams.get("platform") ?? "google";
        const category = platform === "youtube" ? (url.searchParams.get("category") ?? url.searchParams.get("q") ?? "") : "";
        const cacheKey = `trends:${platform}${category ? ":" + category : ""}`;

        // --- Try cache first ---
        try {
          const cached = await kv?.get(cacheKey);
          if (cached) {
            return Response.json(JSON.parse(cached));
          }
        } catch {
          // KV unavailable — fall through to live fetch
        }

        let items: TrendItem[];

        if (platform === "google") {
          items = await fetchGoogleTrends(serApiKey);
        } else if (platform === "youtube") {
          items = await fetchYouTubeTrends(youtubeApiKey, category);
        } else {
          return Response.json(
            { error: "Invalid platform. Use ?platform=google|youtube" },
            { status: 400 },
          );
        }

        // --- Cache the result ---
        try {
          await kv?.put(cacheKey, JSON.stringify(items), { expirationTtl: CACHE_TTL });
        } catch {
          // KV write failed — continue without caching
        }

        return Response.json(items);
      },
    },
  },
});

export async function fetchGoogleTrends(apiKey?: string): Promise<TrendItem[]> {
  if (!apiKey) {
    return [{ title: "SerpApi key not configured", metric: "", source: "google" }];
  }

  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google_trends");
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    return [{ title: `SerpApi error: ${res.status}`, metric: "", source: "google" }];
  }

  const data = (await res.json()) as Record<string, unknown>;
  const trendingSearches = (data.trendingSearches as any[]) ?? [];
  const dayTrends = trendingSearches[0]?.dayTrends ?? trendingSearches[0]?.trends ?? [];

  return (dayTrends as any[])
    .slice(0, 10)
    .map((t: any) => ({
      title: t.title ?? "",
      metric: t.formattedTraffic ?? t.searches ?? "",
      source: "google",
    }));
}

export async function fetchYouTubeTrends(apiKey?: string, category?: string): Promise<TrendItem[]> {
  if (!apiKey) {
    return [{ title: "YouTube API key not configured", metric: "", source: "youtube" }];
  }

  let url: URL;
  if (category && category.trim().length > 0) {
    url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", category.trim());
    url.searchParams.set("type", "video");
    url.searchParams.set("order", "viewCount");
    url.searchParams.set("regionCode", "US");
    url.searchParams.set("maxResults", "10");
  } else {
    url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,statistics");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", "US");
    url.searchParams.set("maxResults", "10");
  }
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    return [{ title: `YouTube API error: ${res.status}`, metric: "", source: "youtube" }];
  }

  const data = (await res.json()) as { items?: any[] };
  const items = data.items ?? [];

  return items.map((item: any) => ({
    title: item.snippet?.title ?? "",
    metric: item.statistics?.viewCount ?? "0",
    source: "youtube",
  }));
}
