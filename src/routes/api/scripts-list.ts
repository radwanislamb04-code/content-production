import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";

/**
 * /api/scripts-list — what has already been made, newest first.
 *
 * This route existed and nothing called it, so the Script & Hook and Storyboard screens
 * showed "No script yet" while seventeen scripts and ten storyboards sat in the library.
 * They can now ask for either: `?type=script` (the default) or `?type=storyboard`.
 *
 * The type is an allowlist, not free text — it is interpolated into a query, and a table
 * of five library kinds is not worth opening to whatever the URL says.
 */
const KINDS = ["script", "storyboard", "video_prompt", "idea", "character"] as const;

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

        const requested = new URL(request.url).searchParams.get("type") ?? "script";
        const type = (KINDS as readonly string[]).includes(requested) ? requested : "script";

        try {
          const { results } = await db
            .prepare(
              `SELECT id, title, content_pillar, created_at, source_id
                 FROM library
                WHERE type = ? AND user_id = ?
                ORDER BY created_at DESC`,
            )
            .bind(type, await currentUserId(request, context))
            .all();
          return Response.json((results ?? []) as ScriptRow[]);
        } catch (err: any) {
          return Response.json(
            { error: `Failed to load ${type}: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }
      },
    },
  },
});
