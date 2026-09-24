import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { selectHook, type ScriptContent } from "../../lib/script-body";

/**
 * POST /api/script-select-hook — choose which of a script's three hooks opens it.
 *
 * A generated script carries three hook options, but only one of them can open the
 * body. Picking it used to be impossible: the body kept whichever hook the model felt
 * like writing, while "Copy Script" glued `hooks[0]` in front of it — so choosing hook
 * 2 by hand produced hook 1 followed by hook 1 again.
 *
 * This writes the choice into the stored script instead of leaving it in the browser:
 * the body's hook beat is replaced, the voiceover is rebuilt from the same hook, and
 * `selected_hook_index` records the decision. The storyboard and video steps read that
 * row, so they inherit the pick without knowing this route exists.
 *
 * The rewrite itself lives in `src/lib/script-body.ts` — the generator applies the same
 * rule, so a generated script and a re-picked one cannot drift apart.
 */
type ScriptRow = {
  id: string;
  title: string;
  content_pillar: string | null;
  content: string | null;
};

export const Route = createFileRoute("/api/script-select-hook")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json({ ok: false, error: "DB not configured" }, { status: 500 });
        }

        let body: { script_id?: unknown; hook_index?: unknown };
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
        }

        const scriptId = typeof body.script_id === "string" ? body.script_id.trim() : "";
        if (!scriptId) {
          return Response.json({ ok: false, error: 'Missing "script_id"' }, { status: 400 });
        }

        const uid = await currentUserId(request, context);

        let row: ScriptRow | null = null;
        try {
          row = (await db
            .prepare("SELECT id, title, content_pillar, content FROM library WHERE id = ? AND type = 'script' AND user_id = ?")
            .bind(scriptId, uid)
            .first()) as ScriptRow | null;
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `Failed to load script: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }
        if (!row) {
          return Response.json({ ok: false, error: "Script not found" }, { status: 404 });
        }

        let content: ScriptContent;
        try {
          content = JSON.parse(String(row.content ?? "{}")) as ScriptContent;
        } catch {
          return Response.json(
            { ok: false, error: "This script's stored content is not JSON — regenerate it." },
            { status: 422 },
          );
        }

        const hooks = Array.isArray(content.hooks) ? content.hooks : [];
        if (hooks.length === 0) {
          return Response.json(
            { ok: false, error: "This script has no hook options to choose from." },
            { status: 422 },
          );
        }

        const requested = Number(body.hook_index);
        if (!Number.isInteger(requested) || requested < 0 || requested >= hooks.length) {
          return Response.json(
            {
              ok: false,
              error: `"hook_index" must be an integer between 0 and ${hooks.length - 1}.`,
            },
            { status: 400 },
          );
        }

        const next = selectHook(content, requested);

        try {
          await db
            .prepare("UPDATE library SET content = ?, updated_at = ? WHERE id = ? AND user_id = ?")
            .bind(JSON.stringify(next), Date.now(), scriptId, uid)
            .run();
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `Failed to save the choice: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        return Response.json({
          ok: true,
          id: row.id,
          title: row.title,
          content_pillar: row.content_pillar ?? null,
          selected_hook_index: next.selected_hook_index ?? 0,
          script: next,
        });
      },
    },
  },
});
