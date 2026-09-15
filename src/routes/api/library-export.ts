import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";
import { dhakaDate } from "../../lib/telegram-hook";

/**
 * GET /api/library-export?format=json|csv&type=<type>
 *
 * ⑦ of the master plan — "the library is the one thing in here that cannot be
 * regenerated". Everything you have ever saved comes out as a normal file, so it
 * can be kept somewhere the Worker cannot reach.
 *
 * The rows are the caller's own (or the profile they switched to) — never a
 * mixture, and never somebody else's.
 */

const TSV_SAFE = /^[=+\-@\t\r]/;

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  // Excel treats a leading =, +, - or @ as a formula — prefix with a quote so a
  // title like "=SUM(A1)" can never execute in a spreadsheet.
  const guarded = TSV_SAFE.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export const Route = createFileRoute("/api/library-export")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const userId = await currentUserId(request, context);
        const url = new URL(request.url);
        const format = (url.searchParams.get("format") ?? "json").toLowerCase();
        const type = (url.searchParams.get("type") ?? "").trim();

        if (format !== "json" && format !== "csv") {
          return Response.json(
            { ok: false, error: "format must be json or csv" },
            { status: 400 },
          );
        }

        let rows: any[] = [];
        try {
          const sql = type
            ? "SELECT id, type, title, content, status, content_pillar, quality_score, quality_analysis, source_id, created_at, updated_at FROM library WHERE user_id = ? AND type = ? ORDER BY created_at DESC"
            : "SELECT id, type, title, content, status, content_pillar, quality_score, quality_analysis, source_id, created_at, updated_at FROM library WHERE user_id = ? ORDER BY created_at DESC";
          const stmt = type
            ? env.DB.prepare(sql).bind(userId, type)
            : env.DB.prepare(sql).bind(userId);
          const { results } = await stmt.all();
          rows = (results ?? []) as any[];
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `Could not read the library: ${err?.message ?? "database error"}` },
            { status: 500 },
          );
        }

        const stamp = dhakaDate();
        const scope = type ? `-${type}` : "";

        if (format === "csv") {
          const header = [
            "id",
            "type",
            "title",
            "status",
            "content_pillar",
            "quality_score",
            "source_id",
            "created_at",
            "updated_at",
            "content",
          ];
          const body = rows
            .map((r) =>
              [
                r.id,
                r.type,
                r.title,
                r.status,
                r.content_pillar,
                r.quality_score,
                r.source_id,
                r.created_at,
                r.updated_at,
                r.content,
              ]
                .map(csvCell)
                .join(","),
            )
            .join("\r\n");
          return new Response(`${header.join(",")}\r\n${body}\r\n`, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="content-os-library${scope}-${stamp}.csv"`,
            },
          });
        }

        const payload = {
          exported_at: new Date().toISOString(),
          app: "Content OS",
          user_id: userId,
          scope: type || "all",
          count: rows.length,
          items: rows,
        };
        return new Response(JSON.stringify(payload, null, 2), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="content-os-library${scope}-${stamp}.json"`,
          },
        });
      },
    },
  },
});
