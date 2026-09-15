import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";

/**
 * GET /api/search?q=<text>
 *
 * Returns a FLAT ARRAY of `{ id, title, module, date, href, snippet }` — the
 * shape the ⌘K spotlight renders. (It used to return `{ projects, library }`,
 * which the UI discarded, so every search looked empty.)
 *
 * Searches the real tables: library (ideas, scripts, storyboards, prompts,
 * characters), projects, resources and stored briefs. An empty query returns
 * the most recent content so the box is never blank.
 */

type Hit = {
  id: string;
  title: string;
  module: string;
  date: string;
  href: string;
  snippet: string;
};

const LIBRARY_ROUTES: Record<string, { label: string; href: string }> = {
  idea: { label: "Idea", href: "/ideator" },
  script: { label: "Script", href: "/script" },
  storyboard: { label: "Storyboard", href: "/storyboard" },
  video_prompt: { label: "Video prompt", href: "/video-prompt" },
  character: { label: "Character", href: "/characters" },
};

function day(ms: unknown): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n).toISOString().slice(0, 10);
}

/**
 * Library `content` is often a JSON blob — showing `{"why_it_works":…` in a
 * search row is noise. Pull the most human field, or fall back to the text.
 */
function oneLine(text: unknown, max = 90): string {
  let value = String(text ?? "");
  if (value.trim().startsWith("{")) {
    try {
      const obj = JSON.parse(value) as Record<string, unknown>;
      const preferred = [
        "title",
        "why_it_works",
        "hook",
        "spoken",
        "text",
        "caption",
        "summary",
        "body",
      ]
        .map((k) => obj[k])
        .find((v) => typeof v === "string" && v.trim());
      // Storyboards and video prompts start with fields like `model`/`shots` —
      // fall back to the first substantial string anywhere in the object.
      const generic = Object.values(obj).find((v) => typeof v === "string" && v.trim().length > 12);
      const chosen = preferred ?? generic;
      if (chosen) {
        value = String(chosen);
      } else {
        // Nothing text-like inside (e.g. `{ shots: [...] }`) — strip the JSON
        // scaffolding so the row shows content instead of punctuation soup.
        value = value
          .replace(/[[\]{}"]/g, " ")
          .replace(/\b[a-z_]{2,}\s*:/gi, " ")
          .replace(/,/g, " · ");
      }
    } catch {
      /* not JSON after all — use it as-is */
    }
  }
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) return Response.json([]);

        const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
        const like = `%${q}%`;
        const hits: Hit[] = [];

        /** Run one query without letting a missing table break the whole search. */
        const safe = async (sql: string, args: unknown[]) => {
          try {
            const { results } = await db
              .prepare(sql)
              .bind(...args)
              .all();
            return (results ?? []) as any[];
          } catch {
            return [];
          }
        };

        // Every branch is filtered to the signed-in user (resolved once).
        const uid = await currentUserId(request, context);

        if (q) {
          const [library, projects, resources, briefs] = await Promise.all([
            safe(
              `SELECT id, type, title, content, created_at FROM library
                WHERE (title LIKE ? OR content LIKE ?) AND user_id = ?
                ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 20`,
              [like, like, uid],
            ),
            safe(
              `SELECT id, title, module, status, created_at FROM projects
                WHERE (title LIKE ? OR module LIKE ?) AND user_id = ? ORDER BY created_at DESC LIMIT 10`,
              [like, like, uid],
            ),
            safe(
              `SELECT id, name, url, description, category FROM resources
                WHERE (name LIKE ? OR description LIKE ? OR category LIKE ?) AND user_id = ? LIMIT 10`,
              [like, like, like, uid],
            ),
            safe(
              `SELECT key, value, updated_at FROM workspace
                WHERE key LIKE 'brief_%' AND value LIKE ? AND user_id = ? ORDER BY key DESC LIMIT 5`,
              [like, uid],
            ),
          ]);

          for (const r of library) {
            const meta = LIBRARY_ROUTES[r.type] ?? { label: "Library", href: "/library" };
            hits.push({
              id: `lib-${r.id}`,
              title: r.title || "(untitled)",
              module: meta.label,
              date: day(r.created_at),
              href: meta.href,
              snippet: oneLine(r.content),
            });
          }
          for (const p of projects) {
            hits.push({
              id: `proj-${p.id}`,
              title: p.title || "(untitled project)",
              module: "Project",
              date: day(p.created_at),
              href: "/projects",
              snippet: `${p.module ?? ""} · ${p.status ?? ""}`.trim(),
            });
          }
          for (const r of resources) {
            hits.push({
              id: `res-${r.id}`,
              title: r.name || r.url,
              module: "Resource",
              date: "",
              href: "/resources",
              snippet: oneLine(r.description || r.category || r.url),
            });
          }
          for (const b of briefs) {
            hits.push({
              id: `brief-${b.key}`,
              title: `Brief — ${String(b.key).replace(/^brief_/, "")}`,
              module: "Brief",
              date: String(b.key).replace(/^brief_/, ""),
              href: "/brief-history",
              snippet: "Open this brief in the archive",
            });
          }
        } else {
          // No query → the newest content, so the spotlight is useful on open.
          const recent = await safe(
            `SELECT id, type, title, content, created_at FROM library
              WHERE user_id = ? ORDER BY created_at DESC LIMIT 8`,
            [uid],
          );
          for (const r of recent) {
            const meta = LIBRARY_ROUTES[r.type] ?? { label: "Library", href: "/library" };
            hits.push({
              id: `lib-${r.id}`,
              title: r.title || "(untitled)",
              module: meta.label,
              date: day(r.created_at),
              href: meta.href,
              snippet: oneLine(r.content),
            });
          }
        }

        return Response.json(hits.slice(0, 30));
      },
    },
  },
});
