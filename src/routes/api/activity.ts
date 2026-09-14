import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { readActivity } from "../../lib/activity";

export const Route = createFileRoute("/api/activity")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get("limit") ?? 100);
        const module = url.searchParams.get("module");
        // Newest first. `?limit=` and `?module=` keep AutoPilot's polling cheap.
        return Response.json(await readActivity(env, limit, module));
      },
      POST: async ({ request, context }) => {
        const db = (context as any).cloudflare?.env?.DB;
        if (!db) {
          return Response.json({ error: "DB unavailable" }, { status: 500 });
        }
        const body = await request.json();
        const { id, module, action, detail, created_at } = body;
        if (!module || !action) {
          return Response.json({ error: "module and action are required" }, { status: 400 });
        }
        try {
          const now = Date.now();
          await db
            .prepare(
              "INSERT INTO activity (id, module, action, detail, created_at) VALUES (?, ?, ?, ?, ?)"
            )
            .run(id, module, action, detail ?? "", now);
          return Response.json({ success: true, id });
        } catch {
          return Response.json({ error: "Insert failed" }, { status: 500 });
        }
      },
    },
  },
});
