import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";

/**
 * GET /api/hooks — the data behind the Hook Scoreboard.
 *
 * Two real sources, nothing invented:
 *   1. every hook written in a script (`library.content.hooks[]`)
 *   2. every one of your own posts in `post_performance`, ranked by
 *      likes + comments
 *
 * What is deliberately NOT here: a per-hook score. That needs each published
 * post linked back to the hook it used, which nothing records yet — so the page
 * says so instead of inventing a win rate.
 */

type Hook = {
  id: string;
  spoken: string;
  formula: string;
  visual?: string;
  overlay?: string;
  script_id: string;
  script_title: string;
  script_created: number;
};

/** Instagram sometimes reports -1 for a hidden like count — treat it as 0. */
function clamp(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function str(v: unknown, max = 400): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** The opening line of a caption — the closest thing to a real hook we store. */
function firstLine(caption: string | null, max = 140): string {
  const text = String(caption ?? "").replace(/\r/g, "");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line) return line.slice(0, max);
  }
  return "";
}

export const Route = createFileRoute("/api/hooks")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json({ ok: false, error: "D1 is not bound" }, { status: 500 });
        }

        const safe = async (sql: string) => {
          try {
            const { results } = await db.prepare(sql).all();
            return (results ?? []) as any[];
          } catch {
            return [];
          }
        };

        const [scripts, own, stamp] = await Promise.all([
          safe(
            "SELECT id, title, content, created_at FROM library WHERE type = 'script' ORDER BY created_at DESC LIMIT 60",
          ),
          safe(
            `SELECT caption, likes, comments, url, posted_at FROM post_performance
              WHERE is_own_account = 1 ORDER BY MAX(COALESCE(likes,0),0) + MAX(COALESCE(comments,0),0) DESC, posted_at DESC LIMIT 40`,
          ),
          safe("SELECT MAX(scraped_at) AS scraped_at FROM post_performance"),
        ]);

        const hooks: Hook[] = [];
        for (const s of scripts) {
          let parsed: any = null;
          try {
            parsed = JSON.parse(String(s.content ?? ""));
          } catch {
            parsed = null;
          }
          const list = Array.isArray(parsed?.hooks) ? parsed.hooks : [];
          list.forEach((h: any, i: number) => {
            const spoken = str(h?.spoken ?? h?.text ?? h?.line, 300);
            if (!spoken) return;
            hooks.push({
              id: `${s.id}:${i}`,
              spoken,
              formula: str(h?.formula, 60) || "unspecified",
              visual: str(h?.visual, 300) || undefined,
              overlay: str(h?.text_overlay, 120) || undefined,
              script_id: String(s.id),
              script_title: str(s.title, 120) || "Untitled script",
              script_created: Number(s.created_at) || 0,
            });
          });
        }

        // Formula frequency — real counts over the hooks that exist.
        const byFormula = new Map<string, number>();
        for (const h of hooks) {
          const key = h.formula.toLowerCase();
          byFormula.set(key, (byFormula.get(key) ?? 0) + 1);
        }
        const formulas = [...byFormula.entries()]
          .map(([formula, count]) => ({ formula, count }))
          .sort((a, b) => b.count - a.count);

        const published = own.map((p) => ({
          hook: firstLine(p.caption),
          caption: str(p.caption, 200),
          likes: clamp(p.likes),
          comments: clamp(p.comments),
          engagement: clamp(p.likes) + clamp(p.comments),
          url: p.url ?? "",
          posted_at: p.posted_at ?? "",
        }));

        const totalLikes = published.reduce((n, p) => n + p.likes, 0);
        const caveats: string[] = [];
        caveats.push(
          "Rank order is real: your own posts from the latest scrape, sorted by likes + comments.",
        );
        if (published.length > 0 && totalLikes <= published.length) {
          caveats.push(
            `Almost no likes were returned for your account (${totalLikes} across ${published.length} posts) — Instagram hides like counts from scrapers, so treat these as a floor.`,
          );
        }
        caveats.push(
          "There is no per-hook score: nothing records which hook a published post used, so hooks are listed as written, not as ranked.",
        );

        return Response.json({
          ok: true,
          scraped_at: stamp[0]?.scraped_at ? Number(stamp[0].scraped_at) : null,
          published,
          hooks,
          formulas,
          script_count: scripts.length,
          caveats,
        });
      },
    },
  },
});
