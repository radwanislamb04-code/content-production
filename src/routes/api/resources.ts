import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { getEnv } from "../../lib/settings";

/**
 * /api/resources — the saved-tools list.
 *
 * The INSERT used to name an `iframe` column that does not exist in the deployed
 * table (it has `description` + `is_custom`), so every create failed with a 500
 * and the Resources page stayed empty forever. The columns below are the ones
 * that actually exist; `description` is optional and shown by the card.
 */

const CATEGORIES = [
  "Video Download",
  "Trends",
  "Creator Research",
  "Writing",
  "AI Tools",
  "AI Video",
] as const;

const bodySchema = z.object({
  url: z.string().trim().url().max(500),
  name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(300).optional(),
});

export const Route = createFileRoute("/api/resources")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) return Response.json([]);
        try {
          const { results } = await db
            .prepare("SELECT * FROM resources WHERE user_id = ? ORDER BY created_at DESC")
            .bind(await currentUserId(request, context))
            .all();
          return Response.json(results ?? []);
        } catch {
          return Response.json([]);
        }
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json(
            { ok: false, error: "D1 is not bound" },
            { status: 500 },
          );
        }

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json(
            { ok: false, error: "Invalid input" },
            { status: 400 },
          );
        }

        const row = {
          id: crypto.randomUUID(),
          name: parsed.name,
          url: parsed.url,
          description: parsed.description ?? null,
          category: parsed.category,
          created_at: Date.now(),
        };

        try {
          await db
            .prepare(
              "INSERT INTO resources (id, name, url, description, category, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(
              row.id,
              row.name,
              row.url,
              row.description,
              row.category,
              row.created_at,
            )
            .run();
        } catch (err: any) {
          // Surface the real reason instead of a bare "Save failed".
          return Response.json(
            { ok: false, error: err?.message ?? "Save failed" },
            { status: 500 },
          );
        }

        await logActivity(
          env,
          "resources",
          "created",
          `${row.name} (${row.category})`,
        );
        return Response.json(row, { status: 201 });
      },
    },
  },
});
