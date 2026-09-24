import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { buildPipelineStatus, type PipelineFacts, type RawCount } from "../../lib/pipeline-status";

/**
 * GET /api/pipeline-status — the live state of the production chain, for the Dashboard.
 *
 * Read-only and cheap (a handful of indexed counts), so the Dashboard can poll it while
 * the owner works instead of showing a constant. Everything is scoped to the signed-in
 * user, like every other list in the app.
 *
 * The numbers come from the rows themselves:
 *   · counts and newest timestamps per library type
 *   · `source_id` links, which are how a storyboard names its script and a video prompt
 *     names its storyboard — a row with no child is work that has not moved forward
 *   · workspace rows: `calendar_%` are planned months, `idea_%` are ideas the owner
 *     picked (written by the Ideator and by the video analyser)
 */
export const Route = createFileRoute("/api/pipeline-status")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json({ ok: false, error: "DB not configured" }, { status: 500 });
        }
        const uid = await currentUserId(request, context);

        const empty: RawCount = { count: 0, newest: null };
        const facts: PipelineFacts = {
          ideas: empty,
          scripts: empty,
          storyboards: empty,
          videoPrompts: empty,
          plans: empty,
          scriptsWaiting: 0,
          storyboardsWaiting: 0,
          nextScript: null,
          nextStoryboard: null,
          selectedIdeas: [],
        };

        /** Scripts no storyboard points at. `source_id` is how a child names its parent. */
        const waitingSql = (childType: string) => `
          SELECT COUNT(*) AS n FROM library parent
          WHERE parent.user_id = ?1 AND parent.type = ?
            AND NOT EXISTS (
              SELECT 1 FROM library child
              WHERE child.user_id = ?1 AND child.type = ?
                AND child.source_id = parent.id
            )`;

        try {
          const [
            counts,
            scriptsWaiting,
            storyboardsWaiting,
            nextScript,
            nextStoryboard,
            plans,
            pickedIdeas,
          ] = await Promise.all([
            db
              .prepare(
                `SELECT type, COUNT(*) AS n, MAX(created_at) AS newest FROM library
                 WHERE user_id = ? AND type IN ('idea','script','storyboard','video_prompt')
                 GROUP BY type`,
              )
              .bind(uid)
              .all(),
            db.prepare(waitingSql("storyboard")).bind(uid, "script", "storyboard").first(),
            db.prepare(waitingSql("video_prompt")).bind(uid, "storyboard", "video_prompt").first(),
            db
              .prepare(
                `SELECT id, title FROM library parent
                 WHERE parent.user_id = ? AND parent.type = 'script'
                   AND NOT EXISTS (SELECT 1 FROM library child
                                   WHERE child.user_id = ? AND child.type = 'storyboard'
                                     AND child.source_id = parent.id)
                 ORDER BY parent.created_at DESC LIMIT 1`,
              )
              .bind(uid, uid)
              .first(),
            db
              .prepare(
                `SELECT id, title FROM library parent
                 WHERE parent.user_id = ? AND parent.type = 'storyboard'
                   AND NOT EXISTS (SELECT 1 FROM library child
                                   WHERE child.user_id = ? AND child.type = 'video_prompt'
                                     AND child.source_id = parent.id)
                 ORDER BY parent.created_at DESC LIMIT 1`,
              )
              .bind(uid, uid)
              .first(),
            db
              .prepare(
                `SELECT COUNT(*) AS n, MAX(updated_at) AS newest FROM workspace
                 WHERE user_id = ? AND key LIKE 'calendar_%'`,
              )
              .bind(uid)
              .first(),
            db
              .prepare(
                `SELECT value FROM workspace WHERE user_id = ? AND key LIKE 'idea_%'
                 ORDER BY updated_at DESC LIMIT 3`,
              )
              .bind(uid)
              .all(),
          ]);

          const byType: Record<string, RawCount> = {};
          for (const row of (counts?.results ?? []) as Array<{ type: string; n: number; newest: number | null }>) {
            byType[row.type] = { count: Number(row.n) || 0, newest: row.newest ?? null };
          }

          facts.ideas = byType.idea ?? empty;
          facts.scripts = byType.script ?? empty;
          facts.storyboards = byType.storyboard ?? empty;
          facts.videoPrompts = byType.video_prompt ?? empty;
          facts.plans = {
            count: Number((plans as any)?.n) || 0,
            newest: (plans as any)?.newest ?? null,
          };
          facts.scriptsWaiting = Number((scriptsWaiting as any)?.n) || 0;
          facts.storyboardsWaiting = Number((storyboardsWaiting as any)?.n) || 0;
          facts.nextScript = (nextScript as any)?.id
            ? { id: String((nextScript as any).id), title: String((nextScript as any).title) }
            : null;
          facts.nextStoryboard = (nextStoryboard as any)?.id
            ? {
                id: String((nextStoryboard as any).id),
                title: String((nextStoryboard as any).title),
              }
            : null;
          facts.selectedIdeas = ((pickedIdeas?.results ?? []) as Array<{ value: string }>)
            .map((r) => String(r.value ?? "").trim())
            .filter(Boolean);
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `Could not read the pipeline: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        const { stages, continueWork } = buildPipelineStatus(facts);
        return Response.json({
          ok: true,
          stages,
          continue_work: continueWork,
          counts: {
            idea: facts.ideas.count,
            script: facts.scripts.count,
            storyboard: facts.storyboards.count,
            video_prompt: facts.videoPrompts.count,
          },
          generated_at: Date.now(),
        });
      },
    },
  },
});
