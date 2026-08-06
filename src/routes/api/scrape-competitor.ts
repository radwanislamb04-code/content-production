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
        console.error(`[scrape-competitor] apifyApiToken present: ${!!apifyApiToken}, length: ${apifyApiToken?.length ?? 0}`);

        let body: { handle?: string; platform?: string; debug?: boolean };
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { error: "Invalid JSON body", stage: "invalid_json" },
            { status: 400 },
          );
        }

        const { handle, platform, debug } = body;

        if (!handle || !platform) {
          return Response.json(
            { error: "Missing required fields: handle, platform", stage: "missing_fields" },
            { status: 400 },
          );
        }

        const cacheKey = `competitor:${platform}:${handle}`;

        // --- Try cache first (skip if debug mode) ---
        let stage = "start";
        if (debug) {
          stage = "debug_skip_cache";
          console.error(`[scrape-competitor] stage=${stage} debug=true, skipping KV cache`);
        } else {
          try {
            const cached = await kv?.get(cacheKey);
            if (cached) {
              stage = "cache_hit";
              console.error(`[scrape-competitor] stage=${stage} returning cached result for ${cacheKey}`);
              return Response.json({ ...JSON.parse(cached), stage });
            }
          } catch {
            stage = "kv_read_error";
            console.error(`[scrape-competitor] stage=${stage} KV unavailable, falling through`);
          }
        }

        let result: any;

        if (platform === "instagram") {
          result = await fetchInstagramPosts(apifyApiToken, handle, debug);
        } else {
          return Response.json(
            { error: `Unsupported platform: ${platform}. Use "instagram"`, stage: "apify_error" },
            { status: 400 },
          );
        }

        // If debug mode, return immediately as soon as fetchInstagramPosts returns
        if (debug) {
          console.error(`[scrape-competitor] stage=debug_immediate returning result directly`);
          return Response.json({ ...result, stage: result?.stage ?? "debug" });
        }

        // If Apify returned an error marker in posts array, surface the stage
        if (Array.isArray(result) && result.length > 0 && result[0].caption?.startsWith("Apify error:")) {
          result = { ...result[0], stage: "apify_error" };
          console.error(`[scrape-competitor] stage=apify_error Apify returned non-ok status`);
          return Response.json(result);
        }

        // If token missing
        if (Array.isArray(result) && result.length > 0 && result[0].caption === "Apify API token not configured") {
          result = { ...result[0], stage: "apify_error" };
          console.error(`[scrape-competitor] stage=apify_error Apify token not configured`);
          return Response.json(result);
        }

        const posts = result as CompetitorPost[];

        // --- Cache the result ---
        try {
          await kv?.put(cacheKey, JSON.stringify(posts), { expirationTtl: CACHE_TTL });
        } catch {
          // KV write failed â€” continue without caching
        }

        return Response.json({ posts, stage: "success" });
      },
    },
  },
});

async function fetchInstagramPosts(
  apifyApiToken: string | undefined,
  handle: string,
  debug?: boolean,
): Promise<CompetitorPost[] | { status: number; rawLength: number; rawBodyPreview: string; firstItem: any; stage: string }> {
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

  if (debug) {
    console.error(`[scrape-competitor] stage=apify_called debug=true, returning raw Apify response`);
    return {
      status: res.status,
      rawLength: rawText.length,
      rawBodyPreview: rawText.slice(0, 2000),
      firstItem: Array.isArray(data) ? data[0] ?? null : data,
      stage: "apify_called",
    } as any;
  }

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


