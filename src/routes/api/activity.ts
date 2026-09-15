import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { logActivityFor, readActivity, readActivityFor } from "../../lib/activity";

export const Route = createFileRoute("/api/activity")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get("limit") ?? 100);
        const module = url.searchParams.get("module");
        // Newest first. `?limit=` and `?module=` keep AutoPilot's polling cheap.
        return Response.json(await readActivityFor(request, context, limit, module));
      },
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json({ error: "DB unavailable" }, { status: 500 });
        }
        const body = await request.json();
        const { id, module, action, detail, created_at } = body;
        if (!module || !action) {
          return Response.json({ error: "module and action are required" }, { status: 400 });
        }
        try {
          // Was a raw INSERT using the positional .run(a, b, …) form, which fails
          // on this runtime ("Wrong number of parameter bindings") — and it wrote
          // no user_id. The library call fixes both.
          const uid = await currentUserId(request, context);
          const ok = await logActivityFor(
            request,
            context,
            module,
            action,
            detail ?? "",
          );
          if (!ok) return Response.json({ error: "Insert failed" }, { status: 500 });
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Insert failed" }, { status: 500 });
        }
      },
    },
  },
});
