import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";

/**
 * GET /api/post-performance — real numbers from `post_performance`.
 *
 * Everything here is computed from rows the scraper actually stored. There is
 * no engagement *rate*: that needs follower counts, which the actor does not
 * return — so the page shows per-post averages and a competitor multiple
 * instead of inventing a percentage.
 *
 * `?days=N` narrows the window (default: the whole latest scrape).
 */

type Row = {
  handle: string;
  is_own_account: number;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  url: string | null;
  posted_at: string | null;
  scraped_at: number | null;
};

export const Route = createFileRoute("/api/post-performance")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json({ ok: false, error: "D1 is not bound" }, { status: 500 });
        }

        const url = new URL(request.url);
        const daysRaw = url.searchParams.get("days");
        const days = daysRaw ? Math.min(Math.max(1, Number(daysRaw)), 365) : null;
        const where = days ? "WHERE posted_at >= date('now', ?)" : "";
        const args: unknown[] = days ? [`-${days} days`] : [];

        try {
          const agg = await db
            .prepare(
              `SELECT handle, is_own_account, COUNT(*) AS posts,
                      SUM(MAX(COALESCE(likes,0),0)) AS likes, SUM(MAX(COALESCE(comments,0),0)) AS comments,
                      CAST(ROUND(AVG(MAX(COALESCE(likes,0),0))) AS INTEGER) AS avg_likes,
                      CAST(ROUND(AVG(MAX(COALESCE(comments,0),0))) AS INTEGER) AS avg_comments
                 FROM post_performance ${where}
                GROUP BY handle, is_own_account
                ORDER BY posts DESC, likes DESC`,
            )
            .bind(...args)
            .all();

          const top = await db
            .prepare(
              `SELECT handle, is_own_account, caption, likes, comments, url, posted_at
                 FROM post_performance ${where}
                ORDER BY MAX(COALESCE(likes,0),0) DESC
                LIMIT 5`,
            )
            .bind(...args)
            .all();

          const ownWhere = where ? `${where} AND is_own_account = 1` : "WHERE is_own_account = 1";
          const hours = await db
            .prepare(
              `SELECT CAST(strftime('%H', posted_at) AS INTEGER) AS hour,
                      COUNT(*) AS posts,
                      CAST(ROUND(AVG(MAX(COALESCE(likes,0),0))) AS INTEGER) AS avg_likes
                 FROM post_performance ${ownWhere}
                GROUP BY hour
                ORDER BY avg_likes DESC, posts DESC
                LIMIT 3`,
            )
            .bind(...args)
            .all();

          const stamp = await db
            .prepare("SELECT MAX(scraped_at) AS scraped_at FROM post_performance")
            .first();

          const handles = ((agg.results ?? []) as any[]).map((r) => ({
            handle: r.handle as string,
            is_own: Number(r.is_own_account) === 1,
            posts: Number(r.posts) || 0,
            likes: Number(r.likes) || 0,
            comments: Number(r.comments) || 0,
            avg_likes: Number(r.avg_likes) || 0,
            avg_comments: Number(r.avg_comments) || 0,
          }));

          const roll = (rows: typeof handles) => ({
            posts: rows.reduce((n, r) => n + r.posts, 0),
            likes: rows.reduce((n, r) => n + r.likes, 0),
            comments: rows.reduce((n, r) => n + r.comments, 0),
            avg_likes: rows.length
              ? Math.round(rows.reduce((n, r) => n + r.likes, 0) / rows.reduce((n, r) => n + r.posts, 0))
              : 0,
            avg_comments: rows.length
              ? Math.round(rows.reduce((n, r) => n + r.comments, 0) / rows.reduce((n, r) => n + r.posts, 0))
              : 0,
          });

          const own = roll(handles.filter((h) => h.is_own));
          const competitors = roll(handles.filter((h) => !h.is_own));

          const rows = ((top.results ?? []) as any[]).map((r: Row) => ({
            handle: r.handle,
            is_own: Number(r.is_own_account) === 1,
            caption: (r.caption ?? "").slice(0, 160),
            likes: clamp(r.likes),
            comments: clamp(r.comments),
            url: r.url ?? "",
            posted_at: r.posted_at ?? "",
          }));

          const bestHours = ((hours.results ?? []) as any[]).map((h) => ({
            hour: Number(h.hour),
            posts: Number(h.posts) || 0,
            avg_likes: Number(h.avg_likes) || 0,
          }));

          return Response.json({
            ok: true,
            days,
            scraped_at: stamp?.scraped_at ? Number(stamp.scraped_at) : null,
            own,
            competitors,
            handles,
            top: rows,
            best_hours: bestHours,
            observations: buildObservations({ own, competitors, rows, bestHours }),
          });
        } catch (err: any) {
          return Response.json(
            { ok: false, error: err?.message ?? String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});

/** Every line below is arithmetic on real rows — no invented numbers. */
function buildObservations(d: {
  own: any;
  competitors: any;
  rows: any[];
  bestHours: { hour: number; posts: number; avg_likes: number }[];
}): string[] {
  const out: string[] = [];

  if (d.own.posts === 0) {
    out.push(
      "No posts of your own are tracked yet — add your handle in Settings → Instagram, then run the scraper from Sources.",
    );
  } else {
    if (d.competitors.posts > 0 && d.own.avg_likes > 0) {
      const multiple = d.competitors.avg_likes / Math.max(1, d.own.avg_likes);
      out.push(
        `Competitors average ${fmt(d.competitors.avg_likes)} likes per post vs your ${fmt(d.own.avg_likes)} — a ${multiple.toFixed(1)}× gap.`,
      );
    }
    if (d.own.avg_likes < 1) {
      out.push(
        `The scraper reported almost no likes on your account (${fmt(d.own.likes)} across ${d.own.posts} posts). Instagram often hides like counts from scrapers, so treat your own numbers as a floor — not a verdict.`,
      );
    }
    const best = d.bestHours[0];
    if (best && best.avg_likes > 0) {
      out.push(
        `Your posts around ${String(best.hour).padStart(2, "0")}:00 average ${fmt(best.avg_likes)} likes (best of ${d.bestHours.length} hour buckets).`,
      );
    }
    const mine = d.rows.find((r) => r.is_own);
    if (mine) {
      out.push(`Your best tracked post: “${mine.caption.slice(0, 60)}…” with ${fmt(mine.likes)} likes.`);
    }
    if (d.own.posts < 5) {
      out.push(`Only ${d.own.posts} of your posts are tracked — re-run the scraper after posting more.`);
    }
  }

  const best = d.rows[0];
  if (best && !best.is_own) {
    out.push(
      `Top competitor post: @${best.handle} — ${fmt(best.likes)} likes, ${fmt(best.comments)} comments.`,
    );
  }

  return out.slice(0, 5);
}

/* Some Instagram actors report -1 for a hidden like count. Treat it as 0 so a
   future actor swap cannot inject negatives into the totals. */
function clamp(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
