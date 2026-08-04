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
            { error: "Invalid JSON body" },
            { status: 400 },
          );
        }

        const { handle, platform } = body;

        if (!handle || !platform) {
          return Response.json(
            { error: "Missing required fields: handle, platform" },
            { status: 400 },
          );
        }

        const cacheKey = `competitor:${platform}:${handle}`;

        // --- Try cache first ---
        try {
          const cached = await kv?.get(cacheKey);
          if (cached) {
            return Response.json(JSON.parse(cached));
          }
        } catch {
          // KV unavailable — fall through to live fetch
        }

        let posts: CompetitorPost[];

        if (platform === "instagram") {
          posts = await fetchInstagramPosts(apifyApiToken, handle);
        } else {
          return Response.json(
            { error: `Unsupported platform: ${platform}. Use "instagram"` },
            { status: 400 },
          );
        }

        // --- Cache the result ---
        try {
          await kv?.put(cacheKey, JSON.stringify(posts), { expirationTtl: CACHE_TTL });
        } catch {
          // KV write failed — continue without caching
        }

        return Response.json(posts);
      },
    },
  },
});

async function fetchInstagramPosts(
  apifyApiToken: string | undefined,
  handle: string,
): Promise<CompetitorPost[]> {
  if (!apifyApiToken) {
    return [{ caption: "Apify API token not configured", likes: 0, comments: 0, url: "", timestamp: "" }];
  }

  const res = await fetch(
    `https://api.apify.com/v2/acts/crawlerbros~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyApiToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: handle }),
    },
  );

  if (!res.ok) {
    return [{ caption: `Apify error: ${res.status}`, likes: 0, comments: 0, url: "", timestamp: "" }];
  }

  const data = (await res.json()) as any[];

  const posts: CompetitorPost[] = (Array.isArray(data) ? data : [])
    .map((item: any) => ({
      caption: item.caption ?? item.text ?? "",
      likes: item.likesCount ?? item.likes ?? 0,
      comments: item.commentsCount ?? item.comments ?? 0,
      url: item.url ?? item.postUrl ?? "",
      timestamp: item.timestamp ?? item.takenAt ?? item.createdAt ?? "",
    }));

  // Sort by timestamp, most recent first
  posts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return posts.slice(0, 10);
}
