import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/library/$type/$id")({
  server: {
    handlers: {
      GET: async ({ params, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return new Response("Not found", { status: 404 });
        }
        const { type, id } = params;
        try {
          const { results } = await db
            .prepare(
              "SELECT * FROM library WHERE id = ? AND type = ?"
            )
            .bind(id, type)
            .all();
          const row = (results as any[])?.[0] ?? null;
          if (!row) {
            return new Response("Not found", { status: 404 });
          }
          return Response.json(row);
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
      PUT: async ({ request, params, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return new Response("Internal server error", { status: 500 });
        }
        const { id } = params;
        const body = await request.json();
        const fields: Record<string, any> = {};
        if (typeof body.title === "string") fields.title = body.title;
        if (typeof body.content === "string") fields.content = body.content;
        if (typeof body.quality_score === "number") fields.quality_score = body.quality_score;
        if (typeof body.quality_analysis === "string") fields.quality_analysis = body.quality_analysis;
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
            .prepare(
              `UPDATE library SET ${setClause} WHERE id = ?`
            )
            .bind(...values, id)
            .run();
          return Response.json({ ok: true });
        } catch {
          return new Response("Internal server error", { status: 500 });
        }
      },
      DELETE: async ({ params, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return new Response("Internal server error", { status: 500 });
        }
        const { id } = params;
        try {
          await db
            .prepare("DELETE FROM library WHERE id = ?")
            .bind(id)
            .run();
          return Response.json({ ok: true });
        } catch {
          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
});
