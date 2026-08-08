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
        const db = (context as any).cloudflare?.env?.DB;
        const kv = (context as any).cloudflare?.env?.KV;
        const apifyApiToken = (context as any).cloudflare?.env?.APIFY_API_TOKEN;

        console.log("DEBUG: db:", !!db, "kv:", !!kv, "apify:", !!apifyApiToken);

        let body: { handle?: string; platform?: string; clearCache?: boolean };
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { error: "Invalid JSON body", stage: "invalid_json" },
            { status: 400 },
          );
        }

        const { handle, platform, clearCache } = body;

        if (!handle || !platform) {
          return Response.json(
            { error: "Missing required fields: handle, platform", stage: "missing_fields" },
            { status: 400 },
          );
        }

        const cacheKey = `competitor:${platform}:${handle}`;

        if (clearCache) {
          try {
            await kv?.delete(cacheKey);
          } catch {
            // ignore
          }
          return Response.json({ cleared: true });
        }

        try {
          const cached = await kv?.get(cacheKey);
          if (cached) {
            const cachedData = JSON.parse(cached);
            // Return cached data with db_found/db_type if available, or add defaults
            return Response.json({
              posts: cachedData.posts ?? cachedData, // handle both old and new cache formats
              db_found: cachedData.db_found ?? false,
              db_type: cachedData.db_type ?? "undefined",
            });
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

        if (db) {
          console.log("DEBUG: About to insert", posts.length, "posts to DB");
          for (const post of posts) {
            await db
              .prepare(
                "INSERT INTO post_performance (id, handle, is_own_account, caption, likes, comments, url, posted_at, project_id, scraped_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              )
              .bind(
                crypto.randomUUID(),
                handle,
                0,
                post.caption ?? "",
                post.likes ?? 0,
                post.comments ?? 0,
                post.url ?? "",
                post.timestamp ?? "",
                (body as any)?.project_id ?? null,
                Date.now(),
              )
              .run();
          }
          console.log("DEBUG: DB insert complete");
        } else {
          console.log("DEBUG: DB is undefined, skipping insert");
        }

        const dbType = typeof db;
        const dbFound = !!db;

        // --- Cache the result ---
        try {
          await kv?.put(cacheKey, JSON.stringify({ posts, db_found: dbFound, db_type: dbType }), { expirationTtl: CACHE_TTL });
        } catch {
          // KV write failed
        }

        console.log("DEBUG: Returning response with db_found:", dbFound, "db_type:", dbType);

        return new Response(JSON.stringify({ posts, db_found: dbFound, db_type: dbType }), {
          headers: {
            "Content-Type": "application/json",
          },
        });
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


