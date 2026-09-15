import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { pathSegments } from "../../lib/route-params";
import { getEnv } from "../../lib/settings";

/**
 * /api/library/:type — list and create.
 *
 * `params.type` is empty in the deployed Worker, so the URL path is used
 * instead. Before this fix every list call bound `undefined` and answered `[]`,
 * which left the Library page (and the item pickers on Content Score, Thumbnail
 * Studio and Projects) permanently empty even though 100+ rows exist.
 */

function typeOf(request: Request, params: any): string | undefined {
  return params?.type ?? pathSegments(request, "/api/library")[0];
}

export const Route = createFileRoute("/api/library/$type")({
  server: {
    handlers: {
      GET: async ({ request, params, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        const type = typeOf(request, params);
        if (!db || !type) return Response.json([]);
        try {
          const { results } = await db
            .prepare(
              "SELECT * FROM library WHERE type = ? AND user_id = ? ORDER BY created_at DESC",
            )
            .bind(type, await currentUserId(request, context))
            .all();
          return Response.json(results ?? []);
        } catch {
          return Response.json([]);
        }
      },

      POST: async ({ request, params, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        const type = typeOf(request, params);
        if (!db || !type) {
          return new Response("Internal server error", { status: 500 });
        }
        const body = (await request.json()) as Record<string, any>;
        const { id, title, content, source_id } = body;
        if (typeof id !== "string" || typeof title !== "string" || typeof content !== "string") {
          return new Response("Missing fields: id, title, content", { status: 400 });
        }
        const now = Date.now();
        const quality_score = typeof body.quality_score === "number" ? body.quality_score : 0;
        const quality_analysis =
          typeof body.quality_analysis === "string" ? body.quality_analysis : null;
        try {
          await db
            .prepare(
              `INSERT INTO library (id, type, title, content, source_id, quality_score, quality_analysis, created_at, updated_at, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 content = excluded.content,
                 source_id = excluded.source_id,
                 quality_score = excluded.quality_score,
                 quality_analysis = excluded.quality_analysis,
                 updated_at = excluded.updated_at`,
            )
            .bind(
              id,
              type,
              title,
              content,
              typeof source_id === "string" ? source_id : null,
              quality_score,
              quality_analysis,
              now,
              now,
              await currentUserId(request, context),
            )
            .run();
          return Response.json({ ok: true, id });
        } catch {
          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
});
