import { createFileRoute } from "@tanstack/react-router";
import { dhakaDateKey, runPipeline } from "../../lib/pipeline";
import { getEnv } from "../../lib/settings";
import { getWorkspace, listWorkspaceKeys } from "../../lib/workspace";

/**
 * GET  /api/brief            — today's brief + the history index
 * GET  /api/brief?date=YYYY-MM-DD — one specific brief
 * POST /api/brief-generate   — compose today's brief now (no Telegram send)
 *
 * Briefs live in the `workspace` table under `brief_YYYY-MM-DD` (the same
 * pattern the planner uses for `calendar_YYYY-MM`), so no migration was needed.
 */
export const Route = createFileRoute("/api/brief")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const url = new URL(request.url);
        const wanted = url.searchParams.get("date");
        const dateKey = wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) ? wanted : dhakaDateKey();

        const brief = await getWorkspace<any>(env, `brief_${dateKey}`);
        const keys = await listWorkspaceKeys(env, "brief_", 30);

        return Response.json({
          ok: true,
          date: dateKey,
          today: dhakaDateKey(),
          brief,
          history: keys.map((k) => ({
            date: k.key.replace(/^brief_/, ""),
            updated_at: k.updated_at,
          })),
        });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        // Reuse the pipeline so the run is logged in `activity` like any other.
        const report = await runPipeline(env, ["brief"]);
        const step = report.steps.find((s) => s.step === "brief");
        if (!step?.ok) {
          return Response.json(
            { ok: false, error: step?.detail ?? "Brief generation failed" },
            { status: 502 },
          );
        }
        const dateKey = dhakaDateKey();
        const brief = await getWorkspace<any>(env, `brief_${dateKey}`);
        return Response.json({ ok: true, date: dateKey, brief, detail: step.detail });
      },
    },
  },
});
