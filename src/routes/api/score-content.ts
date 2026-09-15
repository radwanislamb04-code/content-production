import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { getEnv } from "../../lib/settings";
import { scoreItem, unscoredCount, unscoredItems } from "../../lib/scorer";

/**
 * POST /api/score-content
 *
 *   { id }                        → score one library item
 *   { batch: true, limit?, type? } → score everything that has never been scored
 *
 * The `content-scorer` agent: rate an item on a 1-10 scale with a five-part
 * breakdown, stored in `library.quality_score` + `library.quality_analysis`
 * (columns that already existed from migration 003). The prompt and the
 * normaliser live in `src/lib/scorer.ts` so the single and batch paths are the
 * same code.
 *
 * Batch mode exists because scoring 100 items one click at a time is the reason
 * most of a library stays unscored. It works in small batches (`limit`, max 25)
 * rather than one long request, so the HTTP request never times out and the UI
 * can show progress.
 */

export type { ScoreAnalysis } from "../../lib/scorer";

const bodySchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  batch: z.boolean().optional(),
  limit: z.number().int().min(1).max(25).optional(),
  type: z
    .enum(["idea", "script", "storyboard", "video_prompt", "character"])
    .optional(),
});

export const Route = createFileRoute("/api/score-content")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json({ ok: false, error: "D1 is not bound" }, { status: 500 });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: 'Pass an item id, or { "batch": true }' },
            { status: 400 },
          );
        }

        const userId = await currentUserId(request, context);
        const type = parsed.data.type ?? null;

        /* ------------------------------------------------------------ batch */
        if (parsed.data.batch) {
          const limit = parsed.data.limit ?? 5;

          let before = 0;
          try {
            before = await unscoredCount(db, userId, type);
          } catch (err: any) {
            return Response.json(
              { ok: false, error: err?.message ?? String(err) },
              { status: 500 },
            );
          }

          if (!before) {
            return Response.json({
              ok: true,
              scored: 0,
              failed: 0,
              results: [],
              remaining: 0,
              message: "Everything in this workspace already has a score.",
            });
          }

          let items;
          try {
            items = await unscoredItems(db, userId, limit, type);
          } catch (err: any) {
            return Response.json(
              { ok: false, error: err?.message ?? String(err) },
              { status: 500 },
            );
          }

          const results: Array<{
            id: string;
            title: string;
            type: string;
            ok: boolean;
            score?: number;
            action?: string;
            error?: string;
          }> = [];

          for (const item of items) {
            const outcome = await scoreItem(env, db, userId, item);
            if (outcome.ok) {
              results.push({
                id: item.id,
                title: String(item.title ?? ""),
                type: String(item.type ?? ""),
                ok: true,
                score: outcome.analysis.score,
                action: outcome.analysis.recommended_action,
              });
            } else {
              results.push({
                id: item.id,
                title: String(item.title ?? ""),
                type: String(item.type ?? ""),
                ok: false,
                error: outcome.error,
              });
            }
          }

          const scored = results.filter((r) => r.ok).length;
          const failed = results.length - scored;
          const remaining = await unscoredCount(db, userId, type);

          await logActivity(
            env,
            "content-scorer",
            scored ? "scored_batch" : "scored_batch_failed",
            `${scored} scored, ${failed} failed, ${remaining} left unscored`,
            userId,
          );

          return Response.json({
            ok: true,
            scored,
            failed,
            results,
            remaining,
            scanned: results.length,
          });
        }

        /* ----------------------------------------------------------- single */
        if (!parsed.data.id) {
          return Response.json({ ok: false, error: "Pass the item id" }, { status: 400 });
        }

        let item: any;
        try {
          item = await db
            .prepare(
              "SELECT id, type, title, content, quality_score FROM library WHERE id = ? AND user_id = ?",
            )
            .bind(parsed.data.id, userId)
            .first();
        } catch (err: any) {
          return Response.json(
            { ok: false, error: err?.message ?? String(err) },
            { status: 500 },
          );
        }
        if (!item) {
          return Response.json({ ok: false, error: "Item not found" }, { status: 404 });
        }

        const outcome = await scoreItem(env, db, userId, item);
        if (!outcome.ok) {
          return Response.json(
            { ok: false, error: outcome.error, raw: outcome.raw },
            { status: 502 },
          );
        }

        await logActivity(
          env,
          "content-scorer",
          "scored",
          `${parsed.data.id} · ${outcome.analysis.score}/10 (${outcome.analysis.recommended_action})`,
          userId,
        );

        return Response.json({ ok: true, analysis: outcome.analysis });
      },
    },
  },
});
