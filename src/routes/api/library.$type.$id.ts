import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { pathSegments } from "../../lib/route-params";
import { getEnv } from "../../lib/settings";

/**
 * /api/library/:type/:id
 *
 * `params` is empty in the deployed Worker (see lib/route-params), so the type
 * and id are read from the request path. That bug meant editing or deleting a
 * library item silently targeted `undefined`.
 */

function ids(request: Request, params: any) {
  const segments = pathSegments(request, "/api/library");
  return {
    type: params?.type ?? segments[0],
    id: params?.id ?? segments[1],
  };
}

export const Route = createFileRoute("/api/library/$type/$id")({
  server: {
    handlers: {
      GET: async ({ request, params, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        const { type, id } = ids(request, params);
        if (!db || !id) return new Response("Not found", { status: 404 });
        try {
          const { results } = await db
            .prepare(
              "SELECT * FROM library WHERE id = ? AND type = ? AND user_id = ?",
            )
            .bind(id, type, await currentUserId(request, context))
            .all();
          const row = (results as any[])?.[0] ?? null;
          if (!row) return new Response("Not found", { status: 404 });
          return Response.json(row);
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },

      PUT: async ({ request, params, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        const { id } = ids(request, params);
        if (!db || !id) {
          return new Response("Internal server error", { status: 500 });
        }
        const body = (await request.json()) as Record<string, any>;
        const fields: Record<string, any> = {};
        if (typeof body.title === "string") fields.title = body.title;
        if (typeof body.content === "string") fields.content = body.content;
        if (typeof body.quality_score === "number") fields.quality_score = body.quality_score;
        if (typeof body.quality_analysis === "string")
          fields.quality_analysis = body.quality_analysis;
        if (Object.keys(fields).length === 0) {
          return new Response("Invalid body", { status: 400 });
        }
        fields.updated_at = Date.now();
        const setClause = Object.keys(fields)
          .map((k) => `${k} = ?`)
          .join(", ");
        const values = Object.values(fields);
        try {
          await db
            .prepare(`UPDATE library SET ${setClause} WHERE id = ?`)
            .bind(...values, id)
            .run();
          return Response.json({ ok: true });
        } catch {
          return new Response("Internal server error", { status: 500 });
        }
      },

      DELETE: async ({ request, params, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        const { id } = ids(request, params);
        if (!db || !id) {
          return new Response("Internal server error", { status: 500 });
        }
        try {
          await db
            .prepare("DELETE FROM library WHERE id = ? AND user_id = ?")
            .bind(id, await currentUserId(request, context))
            .run();
          return Response.json({ ok: true });
        } catch {
          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
});
