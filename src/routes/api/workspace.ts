import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getEnv } from "../../lib/settings";
import { getWorkspace, listWorkspaceKeys, putWorkspace } from "../../lib/workspace";

/**
 * The generic key/value store the design uses instead of a table per feature:
 * `calendar_YYYY-MM`, `brief_YYYY-MM-DD`, `thumb_prompt_<id>`, `idea_*`.
 *
 * GET  /api/workspace?key=calendar_2026-09   → one value
 * GET  /api/workspace?prefix=calendar_       → key index (newest first)
 * POST /api/workspace { key, value }         → upsert (any JSON value)
 */

const postSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(120)
    // Keep keys to the documented namespaces so the table stays queryable.
    .regex(/^[a-z0-9_:.-]+$/i, "Key may contain letters, digits, _ : . - only"),
  value: z.unknown(),
});

export const Route = createFileRoute("/api/workspace")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const url = new URL(request.url);

        const prefix = url.searchParams.get("prefix");
        if (prefix) {
          return Response.json({ ok: true, keys: await listWorkspaceKeys(env, prefix, 60) });
        }

        const key = url.searchParams.get("key");
        if (!key) {
          return Response.json(
            { ok: false, error: "Pass ?key=<name> or ?prefix=<name>" },
            { status: 400 },
          );
        }

        const value = await getWorkspace(env, key);
        return Response.json({ ok: true, key, value });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = postSchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid body" },
            { status: 400 },
          );
        }

        const saved = await putWorkspace(env, parsed.data.key, parsed.data.value);
        if (!saved) {
          return Response.json(
            { ok: false, error: "Could not write to the workspace table" },
            { status: 500 },
          );
        }
        return Response.json({ ok: true, key: parsed.data.key });
      },
    },
  },
});
