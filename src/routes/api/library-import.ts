import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";
import { logActivity } from "../../lib/activity";

/**
 * POST /api/library-import — put an exported file back.
 *
 * Accepts either the export envelope (`{ items: [...] }`) or a bare array, so a
 * hand-edited file works too. Items keep their original id when they carry one,
 * which makes a re-import a no-op instead of a duplicate: the insert is
 * `INSERT OR IGNORE` on the primary key.
 *
 * `mode: "replace"` (delete this profile's rows first) is deliberately NOT
 * offered — an accidental import should never be able to destroy a library.
 */

const TYPES = ["idea", "script", "storyboard", "video_prompt", "character"] as const;
const STATUSES = ["draft", "approved", "published", "archived"];

type Incoming = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  content?: unknown;
  status?: unknown;
  content_pillar?: unknown;
  quality_score?: unknown;
  quality_analysis?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

export const Route = createFileRoute("/api/library-import")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json(
            { ok: false, error: "No database binding available." },
            { status: 500 },
          );
        }
        const userId = await currentUserId(request, context);

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON file." }, { status: 400 });
        }

        const raw: unknown = Array.isArray(body) ? body : body?.items;
        if (!Array.isArray(raw) || raw.length === 0) {
          return Response.json(
            { ok: false, error: "Nothing to import — expected a JSON export or a list of items." },
            { status: 400 },
          );
        }
        if (raw.length > 2000) {
          return Response.json(
            { ok: false, error: `Too many items (${raw.length}) — split the file and try again.` },
            { status: 400 },
          );
        }

        let added = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const entry of raw as Incoming[]) {
          const type = String(entry?.type ?? "").trim();
          const title = String(entry?.title ?? "").trim();
          if (!TYPES.includes(type as (typeof TYPES)[number])) {
            errors.push(`skipped "${title || "(untitled)"}": unknown type "${type}"`);
            continue;
          }
          if (!title) {
            errors.push("skipped an item with no title");
            continue;
          }

          const id =
            typeof entry?.id === "string" && entry.id.trim()
              ? entry.id.trim()
              : crypto.randomUUID();
          const content =
            typeof entry?.content === "string"
              ? entry.content
              : JSON.stringify(entry?.content ?? "", null, 2);
          const status =
            typeof entry?.status === "string" && STATUSES.includes(entry.status)
              ? entry.status
              : "draft";
          const pillar =
            typeof entry?.content_pillar === "string" ? entry.content_pillar : null;
          const score = Number.isFinite(Number(entry?.quality_score))
            ? Math.round(Number(entry?.quality_score))
            : 0;
          const analysis =
            typeof entry?.quality_analysis === "string" ? entry.quality_analysis : null;
          const created = Number.isFinite(Number(entry?.created_at))
            ? Number(entry?.created_at)
            : Date.now();
          const updated = Number.isFinite(Number(entry?.updated_at))
            ? Number(entry?.updated_at)
            : created;

          try {
            const res = await db
              .prepare(
                `INSERT OR IGNORE INTO library
                   (id, type, title, content, created_at, updated_at, user_id,
                    quality_score, quality_analysis, status, content_pillar, source_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
              )
              .bind(
                id,
                type,
                title,
                content,
                created,
                updated,
                userId,
                score,
                analysis,
                status,
                pillar,
              )
              .run();
            if (Number(res?.meta?.changes ?? 0) > 0) added++;
            else skipped++;
          } catch (err: any) {
            errors.push(`"${title}": ${err?.message ?? "insert failed"}`);
          }
        }

        if (added) {
          await logActivity(
            env,
            "library",
            "imported",
            `${added} item(s) imported, ${skipped} already present`,
            userId,
          );
        }

        return Response.json({
          ok: true,
          added,
          skipped,
          errors: errors.slice(0, 20),
          total: raw.length,
        });
      },
    },
  },
});
