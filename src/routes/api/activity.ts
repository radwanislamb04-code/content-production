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
    },
  },
});
