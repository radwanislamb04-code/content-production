import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return Response.json({ projects: [], library: [] });
        }
        const url = new URL(request.url);
        const q = url.searchParams.get("q") ?? "";
        try {
          const [projects, library] = await Promise.all([
            db
              .prepare(
                "SELECT * FROM projects WHERE title LIKE ? LIMIT 20"
              )
              .bind(`%${q}%`)
              .all(),
            db
              .prepare(
                "SELECT * FROM library WHERE title LIKE ? OR content LIKE ? LIMIT 20"
              )
              .bind(`%${q}%`, `%${q}%`)
              .all(),
          ]);
          return Response.json({
            projects: (projects as any).results ?? [],
            library: (library as any).results ?? [],
          });
        } catch {
          return Response.json({ projects: [], library: [] });
        }
      },
    },
  },
});
