import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  ideas: z.array(z.string().min(1).max(500)).max(50),
});

export const Route = createFileRoute("/api/workspace/selected_idea")({
  server: {
    handlers: {
      PUT: async ({ request, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return new Response("Internal server error", { status: 500 });
        }
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
          return new Response("Invalid body", { status: 400 });
        }
        const now = Date.now();
        const values: any[] = [];
        const sets: string[] = [];
        parsed.data.ideas.forEach((idea, i) => {
          const idx = i * 3;
          values.push(`idea_${i}`, idea, now);
          if (i > 0) {
            sets.push("WHEN ? THEN ?");
          }
        });

        // Insert or update each idea as a workspace row
        const rows = parsed.data.ideas.map((idea, i) => ({
          key: `idea_${i}`,
          value: idea,
          updated_at: now,
        }));

        try {
          // Use UPSERT approach: INSERT with ON CONFLICT UPDATE
          for (const row of rows) {
            await db
              .prepare(
                `INSERT INTO workspace (key, value, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
              )
              .bind(row.key, row.value, row.updated_at, row.value, row.updated_at)
              .run();
          }
          return Response.json({ ok: true, count: rows.length });
        } catch {
          return new Response("Internal server error", { status: 500 });
        }
      },
      GET: async ({ context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return Response.json([]);
        }
        try {
          const { results } = await db
            .prepare(
              "SELECT key, value FROM workspace WHERE key LIKE 'idea_%' ORDER BY key"
            )
            .all();
          return Response.json(results ?? []);
        } catch {
          return Response.json([]);
        }
      },
    },
  },
});
