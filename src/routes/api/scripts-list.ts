import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";

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
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json([]);
        }
        try {
          const { results } = await db
            .prepare(
              "SELECT id, title, content_pillar, created_at FROM library WHERE type = ? AND user_id = ? ORDER BY created_at DESC",
            )
            .bind("script",
              await currentUserId(request, context))
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
