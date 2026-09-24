import { OWNER_ID, currentUserId } from "../../lib/users";
﻿import { createFileRoute } from "@tanstack/react-router";

import { logActivity } from "../../lib/activity";
import {
  readJsonSetting,
  SETTINGS_KEYS,
  type ApifySlot,
} from "../../lib/settings";
import { isAllowanceFailure, orderSlots } from "../../lib/apify-slots";
import { getEnv } from "../../lib/settings";
import { storePosts } from "../../lib/post-performance";

/**
 * How many posts to ask Apify for per handle.
 *
 * Ten was too few to know what a competitor is doing this week: at two posts a day that is
 * five days of coverage, at three it is three days — and the brief looks back seven. Note
 * that the API's item count drives the actor's cost, so this is a deliberate trade.
 */
const SCRAPE_RESULTS_LIMIT = 25;

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
        const env = getEnv(request, context);
        const db = env?.DB;
        const kv = env?.KV;
        // Apify tokens come from Settings → Apify slots (job: "Instagram competitor"),
        // falling back to the APIFY_API_TOKEN env var for the owner. Which slot is used
        // is decided inside the scrape, so a slot that has run out of allowance hands
        // over to the next one instead of stopping the run — see scrapeHandleWithSlots.
        const uid = await currentUserId(request, context);

        console.log("[scrape] begin", { db: !!db, kv: !!kv });

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

        if (platform !== "instagram") {
          return Response.json(
            { error: `Unsupported platform: ${platform}. Use "instagram"`, stage: "apify_error" },
            { status: 400 },
          );
        }

        const scrape = await scrapeHandleWithSlots(env, "Instagram competitor", uid, handle);

        if (scrape.error) {
          if (isAllowanceFailure(scrape.status)) {
            const msg = `Apify allowance used up on every slot for this job (${scrape.tried.join(", ")}). Add or switch to another token in Settings → Apify — the crypto tab will keep scraping on the next slot automatically.`;
            await logActivity(env, "apify", "blocked", msg);
            return Response.json(
              { ok: false, error: msg, stage: "apify_blocked", slots_tried: scrape.tried },
              { status: 402 },
            );
          }
          await logActivity(env, "apify", "error", scrape.error);
          return Response.json(
            { ok: false, error: scrape.error, stage: "apify_error", slots_tried: scrape.tried },
            { status: 502 },
          );
        }

        // Real posts only: the scraper reports failure as an error now, so there is no
        // fake row to filter out by sniffing its caption.
        const posts = scrape.posts;

        if (db) {
          // Pressing this button twice used to store the same post twice — nothing matched
          // it against what was already there, and the brief ranks by likes, so the copy
          // came straight back to the top. storePosts matches on the post's URL instead.
          const storedCount = await storePosts(env, uid, handle, posts, false, {
            projectId: (body as any)?.project_id ?? null,
          });
          console.log("[scrape] stored", storedCount, "of", posts.length, "posts for", handle);
        } else {
          console.log("[scrape] DB is not bound — skipping insert");
        }

        const dbType = typeof db;
        const dbFound = !!db;

        // --- Cache the result ---
        try {
          await kv?.put(cacheKey, JSON.stringify({ posts, db_found: dbFound, db_type: dbType }), { expirationTtl: CACHE_TTL });
        } catch (err: any) {
          // The answer is already in hand; only the cache is lost. Say so instead of
          // hiding it, because a cache that never writes looks like "always fresh".
          console.log("[scrape] cache write failed:", err?.message ?? String(err));
        }

        return new Response(JSON.stringify({ posts, via: scrape.via, db_found: dbFound, db_type: dbType }), {
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
    },
  },
});

/**
 * What a scrape attempt produced.
 *
 * This used to signal failure by returning one fake row whose caption said
 * "Apify error: 402 …" and whose url was empty — which meant every caller had to sniff
 * caption text (`/apify|not configured|error/i`) to tell a post from an error, and one
 * caller stored the error text as if it were a post. Failure is now a field.
 */
export type ScrapeOutcome = {
  posts: CompetitorPost[];
  /** Apify's HTTP status when it refused, else null. */
  status: number | null;
  error: string | null;
};

/** Also used by the pipeline's `scrape` step (src/lib/pipeline.ts). */
export async function fetchInstagramPosts(
  apifyApiToken: string | undefined,
  handle: string,
): Promise<ScrapeOutcome> {
  if (!apifyApiToken) {
    return { posts: [], status: null, error: "Apify API token not configured" };
  }

  const res = await fetch(
    `https://api.apify.com/v2/acts/crawlerbros~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyApiToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The actor's schema requires `usernames` (an array) — sending
      // `{ username }` is rejected with
      // HTTP 400 "Field input.usernames is required".
      body: JSON.stringify({ usernames: [handle], resultsLimit: SCRAPE_RESULTS_LIMIT }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = `Apify error: ${res.status}`;
    try {
      message = `Apify error: ${res.status} — ${JSON.parse(detail)?.error?.message ?? ""}`;
    } catch {
      /* non-JSON error body */
    }
    return { posts: [], status: res.status, error: message };
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

  return { posts: posts.slice(0, SCRAPE_RESULTS_LIMIT), status: null, error: null };
}

/**
 * Scrape one handle, trying each of the caller's slots in turn.
 *
 * The point of the loop: a slot that answers 402/403 is out of allowance, so the next one
 * is tried instead of the run giving up (or, worse, reporting success with nothing).
 * Non-allowance failures stop the loop — a bad request will be bad on every token.
 *
 * Returns which slot answered, so the caller can say so.
 */
export async function scrapeHandleWithSlots(
  env: any,
  job: string,
  userId: string,
  handle: string,
): Promise<{
  posts: CompetitorPost[];
  via: string | null;
  error: string | null;
  status: number | null;
  tried: string[];
}> {
  const slots = await readJsonSetting<ApifySlot[]>(env, SETTINGS_KEYS.apifySlots, [], userId);
  let candidates = orderSlots(slots, job);
  if (candidates.length === 0) {
    // Owner-only env fallback, exactly as readApifyToken does it.
    const fromEnv = userId === OWNER_ID ? env?.APIFY_API_TOKEN : null;
    if (typeof fromEnv === "string" && fromEnv.trim()) {
      candidates = [{ token: fromEnv.trim(), label: "env APIFY_API_TOKEN", job }];
    }
  }
  if (candidates.length === 0) {
    return { posts: [], via: null, error: "Apify token not configured", status: null, tried: [] };
  }

  const tried: string[] = [];
  let last: { status: number | null; error: string | null } = { status: null, error: null };

  for (const candidate of candidates) {
    tried.push(candidate.label);
    const outcome = await fetchInstagramPosts(candidate.token, handle);
    if (!outcome.error) {
      return { posts: outcome.posts, via: candidate.label, error: null, status: null, tried };
    }
    last = { status: outcome.status, error: outcome.error };
    if (!isAllowanceFailure(outcome.status)) break;
    console.log(
      "[scrape] slot %s cannot pay (%s) — trying the next slot",
      candidate.label,
      outcome.status,
    );
  }

  const where = tried.length > 1 ? ` (tried: ${tried.join(", ")})` : "";
  return { posts: [], via: null, error: `${last.error ?? "scrape failed"}${where}`, status: last.status, tried };
}


