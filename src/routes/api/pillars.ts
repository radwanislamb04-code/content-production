import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";

/**
 * GET /api/pillars — real counts from `library`, grouped by content pillar.
 *
 * Used by the Series page to show what actually exists today, so the page is
 * not just an apology for a feature that does not exist.
 */

export const Route = createFileRoute("/api/pillars")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) return Response.json({ ok: false, pillars: [], total: 0 });

        try {
          const { results } = await db
            .prepare(
              `SELECT COALESCE(content_pillar, 'untagged') AS pillar, COUNT(*) AS n
                 FROM library GROUP BY pillar ORDER BY n DESC`,
            )
            .all();
          const pillars: { pillar: string; count: number }[] = ((results ?? []) as any[]).map(
            (r) => ({
              pillar: String(r.pillar),
              count: Number(r.n) || 0,
            }),
          );
          return Response.json({
            ok: true,
            pillars,
            total: pillars.reduce((n: number, p) => n + p.count, 0),
          });
        } catch (err: any) {
          return Response.json(
            { ok: false, pillars: [], total: 0, error: err?.message ?? String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
