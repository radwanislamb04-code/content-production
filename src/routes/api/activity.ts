import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/activity")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return Response.json([]);
        }
        try {
          const { results } = await db
            .prepare(
              "SELECT * FROM activity ORDER BY created_at DESC LIMIT 100"
            )
            .all();
          return Response.json(results ?? []);
        } catch {
          return Response.json([]);
        }
      },
      POST: async ({ request, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return Response.json({ error: "DB unavailable" }, { status: 500 });
        }
        const body = await request.json();
        const { id, module, action, detail, created_at } = body;
        if (!module || !action) {
          return Response.json({ error: "module and action are required" }, { status: 400 });
        }
        try {
          const now = Date.now();
          await db
            .prepare(
              "INSERT INTO activity (id, module, action, detail, created_at) VALUES (?, ?, ?, ?, ?)"
            )
            .run(id, module, action, detail ?? "", now);
          return Response.json({ success: true, id });
        } catch {
          return Response.json({ error: "Insert failed" }, { status: 500 });
        }
      },
    },
  },
});
