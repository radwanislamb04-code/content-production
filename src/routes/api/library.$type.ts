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
    },
  },
});
