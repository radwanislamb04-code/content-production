import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { pathSegments } from "../../lib/route-params";
import { getEnv } from "../../lib/settings";

/**
 * /api/resources/:id — edit and delete a saved site.
 *
 * The id is read from the request path: route params never arrive in the
 * deployed Worker (see lib/route-params), which is exactly the bug that made
 * every library write target `undefined`.
 */

const CATEGORIES = [
  "Video Download",
  "Trends",
  "Creator Research",
  "Writing",
  "AI Tools",
  "AI Video",
] as const;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  url: z.string().trim().url().max(500).optional(),
  category: z.enum(CATEGORIES).optional(),
  description: z.string().trim().max(300).nullable().optional(),
});

function idFrom(request: Request, params: any): string {
  return String(params?.id ?? pathSegments(request, "/api/resources")[0] ?? "");
}

export const Route = createFileRoute("/api/resources/$id")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json(
            { ok: false, error: "D1 is not bound" },
            { status: 500 },
          );
        }
        const id = idFrom(request, params);
        if (!id) {
          return Response.json({ ok: false, error: "Missing id" }, { status: 400 });
        }
        const row = await db
          .prepare("SELECT * FROM resources WHERE id = ?")
          .bind(id)
          .first();
        if (!row) {
          return Response.json(
            { ok: false, error: "No such resource" },
            { status: 404 },
          );
        }
        return Response.json({ ok: true, resource: row });
      },

      PUT: async ({ request, context, params }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json(
            { ok: false, error: "D1 is not bound" },
            { status: 500 },
          );
        }
        const id = idFrom(request, params);
        if (!id) {
          return Response.json({ ok: false, error: "Missing id" }, { status: 400 });
        }

        let parsed: z.infer<typeof patchSchema>;
        try {
          parsed = patchSchema.parse(await request.json());
        } catch {
          return Response.json(
            { ok: false, error: "Invalid input" },
            { status: 400 },
          );
        }

        const fields = Object.entries(parsed).filter(([, v]) => v !== undefined);
        if (fields.length === 0) {
          return Response.json(
            { ok: false, error: "Nothing to update" },
            { status: 400 },
          );
        }

        const setSql = fields.map(([k]) => `${k} = ?`).join(", ");
        const values = fields.map(([, v]) => v);

        try {
          const res = await db
            .prepare(`UPDATE resources SET ${setSql} WHERE id = ?`)
            .bind(...values, id)
            .run();
          if (!res?.meta || res.meta.changes === 0) {
            return Response.json(
              { ok: false, error: "No such resource" },
              { status: 404 },
            );
          }
        } catch (err: any) {
          return Response.json(
            { ok: false, error: err?.message ?? "Update failed" },
            { status: 500 },
          );
        }

        const row = await db
          .prepare("SELECT * FROM resources WHERE id = ?")
          .bind(id)
          .first();
        await logActivity(env, "resources", "updated", id);
        return Response.json({ ok: true, resource: row });
      },

      DELETE: async ({ request, context, params }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json(
            { ok: false, error: "D1 is not bound" },
            { status: 500 },
          );
        }
        const id = idFrom(request, params);
        if (!id) {
          return Response.json({ ok: false, error: "Missing id" }, { status: 400 });
        }

        try {
          const res = await db
            .prepare("DELETE FROM resources WHERE id = ?")
            .bind(id)
            .run();
          if (!res?.meta || res.meta.changes === 0) {
            return Response.json(
              { ok: false, error: "No such resource" },
              { status: 404 },
            );
          }
        } catch (err: any) {
          return Response.json(
            { ok: false, error: err?.message ?? "Delete failed" },
            { status: 500 },
          );
        }

        await logActivity(env, "resources", "deleted", id);
        return Response.json({ ok: true, deleted: id });
      },
    },
  },
});
