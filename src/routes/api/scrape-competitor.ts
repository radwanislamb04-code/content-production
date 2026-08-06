import { createFileRoute } from "@tanstack/react-router";

type CompetitorPost = {
  caption: string;
  likes: number;
  comments: number;
  url: string;
  timestamp: string;
};

const CACHE_TTL = 86400; // 24 hours

export const Route = createFileRoute("/api/scrape-competitor")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;
        const kv = env?.KV;
        const apifyApiToken = env?.APIFY_API_TOKEN;

        let body: { handle?: string; platform?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { error: "Invalid JSON body", stage: "invalid_json" },
            { status: 400 },
          );
        }

        const { handle, platform } = body;

        if (!handle || !platform) {
          return Response.json(
            { error: "Missing required fields: handle, platform", stage: "missing_fields" },
            { status: 400 },
          );
        }

        const cacheKey = `competitor:${platform}:${handle}`;

        try {
          const cached = await kv?.get(cacheKey);
          if (cached) {
            return Response.json({ ...JSON.parse(cached) });
          }
        } catch {
          // KV unavailable, continue
        }

        let result: any;

        if (platform === "instagram") {
          result = await fetchInstagramPosts(apifyApiToken, handle);
        } else {
          return Response.json(
            { error: `Unsupported platform: ${platform}. Use "instagram"`, stage: "apify_error" },
            { status: 400 },
          );
        }

        const posts = result as CompetitorPost[];

        // --- Cache the result ---
        try {
          await kv?.put(cacheKey, JSON.stringify(posts), { expirationTtl: CACHE_TTL });
        } catch {
          // KV write failed — continue without caching
        }

        return Response.json({ posts });
      },
    },
  },
});

async function fetchInstagramPosts(
  apifyApiToken: string | undefined,
  handle: string,
): PromiseCompetitorPost[]> {
  if (!apifyApiToken) {
    return [{ caption: "Apify API token not configured", likes: 0, comments: 0, url: "", timestamp: "" }];
  }

  const res = await fetch(
    `https://api.apify.com/v2/acts/crawlerbros~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyApiToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: handle, maxPosts: 10 }),
    },
  );

  if (!res.ok) {
    return [{ caption: `Apify error: ${res.status}`, likes: 0, comments: 0, url: "", timestamp: "" }];
  }

  const rawText = await res.text();
  const data = rawText ? (JSON.parse(rawText) as any) : null;

  const posts: CompetitorPost[] = (Array.isArray(data) ? data : [])
    .map((item: any) => ({
      caption: item.caption ?? "",
      likes: item.like_count ?? 0,
      comments: item.comment_count ?? 0,
      url: item.post_url ?? "",
      timestamp: item.pub_date ?? "",
    }));

  // Sort by timestamp, most recent first
  posts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return posts.slice(0, 10);
}


