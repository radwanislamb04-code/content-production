import { createFileRoute } from "@tanstack/react-router";
import { readSetting, SETTINGS_KEYS } from "../../lib/settings";
import { getEnv } from "../../lib/settings";

type TrendItem = { title: string; metric: string; source: string };

const CACHE_TTL = 21600; // 6 hours

export const Route = createFileRoute("/api/trends")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const kv = env?.KV;
        const serApiKey = await readSetting(env, SETTINGS_KEYS.serpapi);
        const youtubeApiKey = await readSetting(env, SETTINGS_KEYS.youtube);

        const url = new URL(request.url);
        const platform = url.searchParams.get("platform") ?? "google";
        const category = platform === "youtube" ? (url.searchParams.get("category") ?? url.searchParams.get("q") ?? "") : "";
        // SerpApi region for the "trending now" feed; BD by default.
        const geo = url.searchParams.get("geo") ?? "BD";
        const cacheKey = `trends:${platform}${category ? ":" + category : ""}${platform === "google" ? ":" + geo : ""}`;

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
          items = await fetchGoogleTrends(serApiKey, geo);
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

export async function fetchGoogleTrends(
  apiKey?: string | null,
  geo = "BD",
): Promise<TrendItem[]> {
  if (!apiKey) {
    return [{ title: "SerpApi key not configured", metric: "", source: "google" }];
  }

  // NOTE: `engine=google_trends` requires a `q` (or `category`) parameter and
  // fails with HTTP 400 "Missing query `q` or `category` parameter." without
  // one. The "trending right now" feed is a different engine —
  // `google_trends_trending_now` — and only needs a `geo`.
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google_trends_trending_now");
  url.searchParams.set("geo", geo);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as any)?.error ?? "";
    } catch {
      /* response was not JSON */
    }
    return [
      {
        title: `SerpApi error: ${res.status}${detail ? ` — ${detail}` : ""}`,
        metric: "",
        source: "google",
      },
    ];
  }

  const data = (await res.json()) as Record<string, unknown>;
  const trending = (data.trending_searches as any[]) ?? [];

  return trending.slice(0, 10).map((t: any) => ({
    title: t.query ?? t.title ?? "",
    metric: formatVolume(t.search_volume),
    source: "google",
  }));
}

/** SerpApi returns a raw number; the UI shows a short "1.2M / 45K" string. */
function formatVolume(volume: unknown): string {
  const n = Number(volume);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1_000_000) {
    return `${Number((n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1))}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export async function fetchYouTubeTrends(
  apiKey?: string | null,
  category?: string,
): Promise<TrendItem[]> {
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
