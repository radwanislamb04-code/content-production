import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { getEnv } from "../../lib/settings";
import { getWorkspace, putWorkspace } from "../../lib/workspace";

/**
 * /api/appearance — the Appearance preferences.
 *
 * GET  → current preferences (defaults merged in)
 * POST → merge a patch and save
 *
 * Kept in the `workspace` key/value table like the calendar and briefs, so the
 * settings follow the account rather than living only in one browser.
 */

const KEY = "appearance";

const DEFAULTS = {
  theme: "dark",
  sidebarDefault: "expanded",
  thumbnailFormat: "yt",
  timeDisplay: "dhaka",
  reduceMotion: false,
} as const;

const schema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  sidebarDefault: z.enum(["expanded", "collapsed"]).optional(),
  thumbnailFormat: z.enum(["yt", "reels"]).optional(),
  timeDisplay: z.enum(["dhaka", "local"]).optional(),
  reduceMotion: z.boolean().optional(),
});

export const Route = createFileRoute("/api/appearance")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const stored = await getWorkspace<Record<string, unknown>>(env, KEY);
        const merged = { ...DEFAULTS, ...(stored ?? {}) };
        return Response.json({ ok: true, appearance: merged });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json(
            { ok: false, error: "Invalid JSON body" },
            { status: 400 },
          );
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: "Not a recognised appearance setting" },
            { status: 400 },
          );
        }

        const stored = await getWorkspace<Record<string, unknown>>(env, KEY);
        const merged = { ...DEFAULTS, ...(stored ?? {}), ...parsed.data };
        const saved = await putWorkspace(env, KEY, merged);
        if (!saved) {
          return Response.json(
            { ok: false, error: "Could not save appearance" },
            { status: 500 },
          );
        }

        await logActivity(
          env,
          "appearance",
          "saved",
          Object.entries(parsed.data)
            .map(([k, v]) => `${k}=${v}`)
            .join(", "),
        );

        return Response.json({ ok: true, appearance: merged });
      },
    },
  },
});
