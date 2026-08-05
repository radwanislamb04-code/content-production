import { createFileRoute } from "@tanstack/react-router";

type ScriptRow = {
  id: string;
  title: string;
  content_pillar: string | null;
  created_at: number;
};

export const Route = createFileRoute("/api/scripts-list")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;
        const db = env?.DB;
        if (!db) {
          return Response.json([]);
        }
        try {
          const { results } = await db
            .prepare(
              "SELECT id, title, content_pillar, created_at FROM library WHERE type = ? ORDER BY created_at DESC",
            )
            .bind("script")
            .all();
          const rows = (results ?? []) as ScriptRow[];
          return Response.json(rows);
        } catch (err: any) {
          return Response.json(
            { error: `Failed to load scripts: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }
      },
    },
  },
});
