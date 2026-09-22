import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";

const bodySchema = z.object({
  ideas: z.array(z.string().min(1).max(500)).max(50),
});

export const Route = createFileRoute("/api/workspace/selected_idea")({
  server: {
    handlers: {
      PUT: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return new Response("Internal server error", { status: 500 });
        }
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
          return new Response("Invalid body", { status: 400 });
        }
        const userId = await currentUserId(request, context);
        const now = Date.now();

        try {
          // Every workspace row is per-user: since migration 009 the primary key is
          // (user_id, key) and user_id is NOT NULL. This handler still wrote the old way —
          // no user_id, and `ON CONFLICT(key)`, which no longer matches any constraint — so
          // every call answered 500 and selecting an idea stored nothing at all.
          for (const [i, idea] of parsed.data.ideas.entries()) {
            await db
              .prepare(
                `INSERT INTO workspace (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
                 ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value,
                                                        updated_at = excluded.updated_at`,
              )
              .bind(userId, `idea_${i}`, idea, now)
              .run();
          }
          return Response.json({ ok: true, count: parsed.data.ideas.length });
        } catch {
          return new Response("Internal server error", { status: 500 });
        }
      },
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json([]);
        }
        try {
          const { results } = await db
            .prepare(
              "SELECT key, value FROM workspace WHERE user_id = ? AND key LIKE 'idea_%' ORDER BY key",
            )
            .bind(await currentUserId(request, context))
            .all();
          return Response.json(results ?? []);
        } catch {
          return Response.json([]);
        }
      },
    },
  },
});
