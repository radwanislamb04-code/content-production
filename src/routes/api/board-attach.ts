import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";

/**
 * /api/board-attach — files on a kanban card (R2 object store + a D1 row).
 *
 * POST  form-data: cardId + file  → stores the bytes in R2, returns the row
 * GET   ?id=<attachment id>       → streams the file back
 *
 * Every key is prefixed `attachments/<userId>/…` and both handlers check that
 * prefix against the signed-in user, so one user's id in a URL cannot reach
 * another's file. The card is verified to belong to the caller before an upload.
 *
 * The 5 MB cap is a deliberate limit: this is a content notebook, not a media
 * library, and a huge upload would be a worse experience than a clear refusal.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = /^(image\/|application\/pdf|text\/|video\/mp4)/;

export const Route = createFileRoute("/api/board-attach")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        if (!env?.DB || !env?.MEDIA) {
          return Response.json(
            { ok: false, error: "Storage is not available." },
            { status: 500 },
          );
        }
        const userId = await currentUserId(request, context);

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json(
            { ok: false, error: "Expected a file upload." },
            { status: 400 },
          );
        }
        const cardId = String(form.get("cardId") ?? "").trim();
        const file = form.get("file");
        if (!cardId || !(file instanceof File)) {
          return Response.json(
            { ok: false, error: "A card and a file are both required." },
            { status: 400 },
          );
        }
        if (file.size > MAX_BYTES) {
          return Response.json(
            { ok: false, error: `That file is larger than 5 MB.` },
            { status: 413 },
          );
        }
        const type = file.type || "application/octet-stream";
        if (!ALLOWED.test(type)) {
          return Response.json(
            {
              ok: false,
              error: `${type} is not an accepted type (images, PDF, video or text).`,
            },
            { status: 415 },
          );
        }

        // The card must be the caller's, or a known id would be enough to write
        // into someone else's board.
        const card = await env.DB.prepare(
          "SELECT id FROM cards WHERE id = ? AND user_id = ?",
        )
          .bind(cardId, userId)
          .first();
        if (!card) {
          return Response.json({ ok: false, error: "Unknown card." }, { status: 404 });
        }

        const id = crypto.randomUUID();
        const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
        const key = `attachments/${userId}/${cardId}/${id}-${safeName}`;
        await env.MEDIA.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: type },
        });
        await env.DB.prepare(
          "INSERT INTO card_attachments (id, card_id, user_id, name, size, content_type, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
          .bind(id, cardId, userId, file.name.slice(0, 200), file.size, type, key, Date.now())
          .run();

        return Response.json(
          { ok: true, attachment: { id, name: file.name, size: file.size, type } },
          { status: 201 },
        );
      },

      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        if (!env?.DB || !env?.MEDIA) {
          return new Response("Storage is not available.", { status: 500 });
        }
        const userId = await currentUserId(request, context);
        const id = new URL(request.url).searchParams.get("id") ?? "";
        const row = await env.DB.prepare(
          "SELECT name, content_type, r2_key FROM card_attachments WHERE id = ? AND user_id = ?",
        )
          .bind(id, userId)
          .first();
        if (!row) return new Response("Not found", { status: 404 });
        if (!String(row.r2_key).startsWith(`attachments/${userId}/`)) {
          return new Response("Not found", { status: 404 });
        }

        const object = await env.MEDIA.get(String(row.r2_key));
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, {
          headers: {
            "content-type": String(row.content_type ?? "application/octet-stream"),
            "content-disposition": `inline; filename="${String(row.name).replace(/"/g, "")}"`,
            "cache-control": "private, max-age=3600",
          },
        });
      },
    },
  },
});
