import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { getEnv } from "../../lib/settings";

/**
 * /api/projects — real projects.
 *
 * Until now nothing in the codebase ever wrote to `projects`, so the page was
 * permanently empty, and the rows it *would* have shown were missing every
 * field the UI reads (`modifiedLabel`, `stage`). This route:
 *
 *   GET  ?status=all|active|completed  → derived rows + linked library items
 *   POST { title, module }             → create a project
 *   POST { action:"link", … }          → attach/detach a library item
 */

const STAGES = ["Discover", "Script", "Storyboard", "Video Prompt", "Planner"];

/** Which stage a library item type proves the project has reached. */
const TYPE_STAGE: Record<string, number> = {
  idea: 1,
  script: 2,
  storyboard: 3,
  video_prompt: 4,
};

const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  module: z.string().trim().max(60).optional(),
  pipeline_step: z.string().trim().max(60).optional(),
});

const linkSchema = z.object({
  action: z.enum(["link", "unlink"]),
  projectId: z.string().trim().min(1).max(120),
  itemId: z.string().trim().min(1).max(120),
});

function relative(ms: number): string {
  const diff = Date.now() - Number(ms || 0);
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(Number(ms)).toISOString().slice(0, 10);
}

/**
 * The furthest stage this project has evidence for. A stored `pipeline_step`
 * wins when it names a stage; otherwise the linked content decides.
 */
function stageOf(row: any, items: any[]): number {
  const step = String(row?.pipeline_step ?? "")
    .trim()
    .toLowerCase();
  const named = STAGES.findIndex((s) => s.toLowerCase() === step);
  const fromStep = named >= 0 ? named + 1 : 0;
  const fromItems = items.reduce((max, i) => Math.max(max, TYPE_STAGE[String(i.type)] ?? 0), 0);
  // The furthest evidence wins: a project created at "discover" that already
  // has a script linked is really at the script stage.
  const furthest = Math.max(fromStep, fromItems);
  if (furthest > 0) return furthest;
  return String(row?.status ?? "") === "completed" ? STAGES.length : 1;
}

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) return Response.json([]);

        const status = new URL(request.url).searchParams.get("status") || "all";

        try {
          const { results } = await db
            .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
            .all();
          const rows = (results ?? []) as any[];

          // Linked content in one query, then grouped in memory.
          let links: any[] = [];
          try {
            const linked = await db
              .prepare(
                "SELECT id, type, title, project_id, created_at FROM library WHERE project_id IS NOT NULL AND project_id != '' ORDER BY created_at DESC",
              )
              .all();
            links = (linked.results ?? []) as any[];
          } catch {
            links = [];
          }

          const projects = rows.map((p) => {
            const items = links
              .filter((l) => String(l.project_id) === String(p.id))
              .map((l) => ({ id: l.id, type: l.type, title: l.title }));
            return {
              id: p.id,
              title: p.title,
              module: p.module || "Project",
              status: p.status || "active",
              pipeline_step: p.pipeline_step ?? null,
              created_at: Number(p.created_at) || 0,
              updated_at: Number(p.updated_at) || 0,
              modifiedLabel: relative(Number(p.updated_at) || Number(p.created_at)),
              stage: stageOf(p, items),
              items,
            };
          });

          const filtered =
            status === "all" ? projects : projects.filter((p) => String(p.status) === status);

          return Response.json(filtered);
        } catch {
          return Response.json([]);
        }
      },

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

        // Attach / detach a library item.
        if ((raw as any)?.action) {
          const parsed = linkSchema.safeParse(raw);
          if (!parsed.success) {
            return Response.json(
              { ok: false, error: "Send action, projectId and itemId" },
              { status: 400 },
            );
          }
          const { action, projectId, itemId } = parsed.data;
          try {
            await db
              .prepare("UPDATE library SET project_id = ?, updated_at = ? WHERE id = ?")
              .bind(action === "link" ? projectId : null, Date.now(), itemId)
              .run();
            await logActivity(env, "projects", action, `${itemId} ↔ ${projectId}`);
            return Response.json({ ok: true });
          } catch (err: any) {
            return Response.json(
              { ok: false, error: err?.message ?? String(err) },
              { status: 500 },
            );
          }
        }

        const parsed = createSchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "A project needs a title" }, { status: 400 });
        }

        const now = Date.now();
        const id = `proj_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const module = parsed.data.module?.trim() || "Ideator";
        const step = parsed.data.pipeline_step?.trim() || "discover";

        try {
          await db
            .prepare(
              "INSERT INTO projects (id, title, module, status, pipeline_step, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(id, parsed.data.title, module, "active", step, now, now)
            .run();
        } catch (err: any) {
          return Response.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
        }

        await logActivity(env, "projects", "created", `${parsed.data.title} (${module})`);

        return Response.json({
          ok: true,
          project: {
            id,
            title: parsed.data.title,
            module,
            status: "active",
            pipeline_step: step,
            created_at: now,
            updated_at: now,
            modifiedLabel: "just now",
            stage: 1,
            items: [],
          },
        });
      },
    },
  },
});
