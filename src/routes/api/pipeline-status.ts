import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { buildPipelineStatus, type PipelineFacts } from "../../lib/pipeline-status";
import { gatherPipelineFacts } from "../../lib/pipeline-facts";

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

        // The numbers live in src/lib/pipeline-facts.ts, shared with the evening report
        // the 20:00 cron sends — one query, so the card and the message cannot disagree.
        let facts: PipelineFacts;
        try {
          facts = await gatherPipelineFacts(env, uid);
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
