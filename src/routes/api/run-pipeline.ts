import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { PIPELINE_STEPS, runPipeline } from "../../lib/pipeline";

/**
 * GET  /api/run-pipeline — the step registry (used by AutoPilot to label buttons)
 * POST /api/run-pipeline — run the pipeline on demand
 *      body: { steps?: ("trends" | "scrape" | "brief" | "report" | "send")[] }
 *      an empty/absent body runs every step in order.
 *
 * Protected by Cloudflare Access like the rest of /api/*.
 */
export const Route = createFileRoute("/api/run-pipeline")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, steps: PIPELINE_STEPS }),

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          /* no body → run everything */
        }

        const steps = Array.isArray(body?.steps)
          ? body.steps.map((s: unknown) => String(s))
          : null;

        try {
          const report = await runPipeline(env, steps);
          return Response.json(report, { status: report.ok ? 200 : 207 });
        } catch (err: any) {
          return Response.json(
            { ok: false, error: err?.message ?? String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
