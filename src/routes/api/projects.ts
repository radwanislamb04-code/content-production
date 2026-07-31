import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/projects")({
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
              "SELECT * FROM projects ORDER BY updated_at DESC"
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
