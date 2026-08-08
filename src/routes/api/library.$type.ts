import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/library/$type")({
  server: {
    handlers: {
      GET: async ({ request, params, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return Response.json([]);
        }
        const type = params.type;
        try {
          const { results } = await db
            .prepare(
              "SELECT * FROM library WHERE type = ? ORDER BY created_at DESC"
            )
            .bind(type)
            .all();
          return Response.json(results ?? []);
        } catch {
          return Response.json([]);
        }
      },
      POST: async ({ request, params, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return new Response("Internal server error", { status: 500 });
        }
        const body = await request.json() as Record<string, any>;
        const { id, title, content, source_id } = body;
        if (typeof id !== "string" || typeof title !== "string" || typeof content !== "string") {
          return new Response("Missing fields: id, title, content", { status: 400 });
        }
        const type = params.type;
        const now = Date.now();
        const quality_score = typeof body.quality_score === "number" ? body.quality_score : 0;
        const quality_analysis = typeof body.quality_analysis === "string" ? body.quality_analysis : null;
        try {
          await db
            .prepare(
              `INSERT INTO library (id, type, title, content, source_id, quality_score, quality_analysis, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 content = excluded.content,
                 source_id = excluded.source_id,
                 quality_score = excluded.quality_score,
                 quality_analysis = excluded.quality_analysis,
                 updated_at = excluded.updated_at`
            )
            .bind(id, type, title, content, typeof source_id === "string" ? source_id : null, quality_score, quality_analysis, now, now)
            .run();
          return Response.json({ ok: true, id });
        } catch {
          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
});
