import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";

/**
 * /api/board — the Kanban board.
 *
 * GET  → the signed-in user's board, with its lists and cards in position order.
 *        A first-time visitor gets a default board (To do / Doing / Done) rather
 *        than an empty screen with nothing to drag.
 * POST → one action per call: list/card create, edit, move, delete.
 *
 * Cards are ordered by a REAL `position`, so dropping a card between two others
 * stores the midpoint and leaves every other row untouched. Every statement is
 * scoped by user_id, and a card is created through a list the caller owns, so one
 * user's id can never be used to touch another's board.
 */

const STEPS = [
  { name: "To do", position: 1000 },
  { name: "Doing", position: 2000 },
  { name: "Done", position: 3000 },
];

const LABELS = ["ai tips", "behind the scenes", "productivity", "story", "idea"];

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_list"), name: z.string().trim().min(1).max(60) }),
  z.object({
    action: z.literal("rename_list"),
    listId: z.string().min(1),
    name: z.string().trim().min(1).max(60),
  }),
  z.object({
    action: z.literal("move_list"),
    listId: z.string().min(1),
    position: z.number(),
  }),
  z.object({ action: z.literal("delete_list"), listId: z.string().min(1) }),
  z.object({
    action: z.literal("create_card"),
    listId: z.string().min(1),
    title: z.string().trim().min(1).max(300),
    labels: z.array(z.string()).max(6).optional(),
    dueDate: z.string().trim().max(40).nullable().optional(),
  }),
  z.object({
    action: z.literal("update_card"),
    cardId: z.string().min(1),
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(4000).nullable().optional(),
    labels: z.array(z.string()).max(6).optional(),
    dueDate: z.string().trim().max(40).nullable().optional(),
    checklist: z
      .array(z.object({ text: z.string().max(300), done: z.boolean() }))
      .max(50)
      .optional(),
  }),
  z.object({
    action: z.literal("move_card"),
    cardId: z.string().min(1),
    listId: z.string().min(1),
    position: z.number(),
  }),
  z.object({ action: z.literal("delete_card"), cardId: z.string().min(1) }),
  z.object({
    action: z.literal("add_comment"),
    cardId: z.string().min(1),
    body: z.string().trim().min(1).max(2000),
  }),
  z.object({ action: z.literal("delete_comment"), commentId: z.string().min(1) }),
  z.object({
    action: z.literal("link_item"),
    cardId: z.string().min(1),
    libraryId: z.string().min(1),
  }),
  z.object({ action: z.literal("unlink_item"), linkId: z.string().min(1) }),
  z.object({
    action: z.literal("delete_attachment"),
    attachmentId: z.string().min(1),
  }),
]);

type Row = Record<string, any>;

async function loadBoard(env: any, userId: string) {
  let board = (await env.DB.prepare(
    "SELECT id, name FROM boards WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
  )
    .bind(userId)
    .first()) as Row | null;

  if (!board) {
    const boardId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO boards (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(boardId, userId, "Content board", now, now)
      .run();
    for (const step of STEPS) {
      await env.DB.prepare(
        "INSERT INTO board_lists (id, board_id, user_id, name, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(crypto.randomUUID(), boardId, userId, step.name, step.position, now)
        .run();
    }
    board = { id: boardId, name: "Content board" };
  }

  const lists = ((
    await env.DB.prepare(
      "SELECT id, name, position FROM board_lists WHERE user_id = ? AND board_id = ? ORDER BY position ASC",
    )
      .bind(userId, board.id)
      .all()
  ).results ?? []) as Row[];

  const cards = ((
    await env.DB.prepare(
      "SELECT id, list_id, title, description, labels, due_date, checklist, cover_url, position FROM cards WHERE user_id = ? ORDER BY position ASC",
    )
      .bind(userId)
      .all()
  ).results ?? []) as Row[];

  // Loaded once each and grouped in memory — three queries beat one per card.
  const [comments, links, attachments] = await Promise.all([
    env.DB.prepare(
      "SELECT id, card_id, body, created_at FROM card_comments WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind(userId)
      .all(),
    env.DB.prepare(
      "SELECT l.id, l.card_id, l.library_id, i.title, i.type FROM card_links l LEFT JOIN library i ON i.id = l.library_id WHERE l.user_id = ? ORDER BY l.created_at ASC",
    )
      .bind(userId)
      .all(),
    env.DB.prepare(
      "SELECT id, card_id, name, size, content_type FROM card_attachments WHERE user_id = ? ORDER BY created_at ASC",
    )
      .bind(userId)
      .all(),
  ]);
  const commentRows = (comments.results ?? []) as Row[];
  const linkRows = (links.results ?? []) as Row[];
  const attachRows = (attachments.results ?? []) as Row[];

  return {
    board: { id: board.id, name: board.name },
    labels: LABELS,
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      position: l.position,
      cards: cards
        .filter((c) => c.list_id === l.id)
        .map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description ?? null,
          labels: c.labels ? String(c.labels).split(",").filter(Boolean) : [],
          dueDate: c.due_date ?? null,
          checklist: c.checklist ? safeJson(c.checklist, []) : [],
          position: c.position,
          comments: commentRows
            .filter((x) => x.card_id === c.id)
            .map((x) => ({ id: x.id, body: x.body, createdAt: x.created_at })),
          links: linkRows
            .filter((x) => x.card_id === c.id)
            .map((x) => ({
              id: x.id,
              libraryId: x.library_id,
              // The title may be null if the linked item was deleted — say so
              // rather than showing a blank chip.
              title: x.title ?? "deleted item",
              type: x.type ?? "",
            })),
          attachments: attachRows
            .filter((x) => x.card_id === c.id)
            .map((x) => ({ id: x.id, name: x.name, size: x.size, type: x.content_type })),
        })),
    })),
  };
}

function safeJson<T>(raw: unknown, fallback: T): T {
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

async function nextPosition(env: any, userId: string, listId: string) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(MAX(position), 0) AS max FROM cards WHERE user_id = ? AND list_id = ?",
  )
    .bind(userId, listId)
    .first();
  return Number(row?.max ?? 0) + 1000;
}

export const Route = createFileRoute("/api/board")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        if (!env?.DB) return Response.json({ ok: false, error: "No database." }, { status: 500 });
        const userId = await currentUserId(request, context);
        return Response.json({ ok: true, ...(await loadBoard(env, userId)) });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        if (!env?.DB) return Response.json({ ok: false, error: "No database." }, { status: 500 });
        const userId = await currentUserId(request, context);
        const body = await request.json().catch(() => null);
        const parsed = actionSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
            { status: 400 },
          );
        }
        const a = parsed.data;

        try {
          if (a.action === "create_list") {
            const board = await loadBoard(env, userId);
            const max = await env.DB.prepare(
              "SELECT COALESCE(MAX(position), 0) AS max FROM board_lists WHERE user_id = ? AND board_id = ?",
            )
              .bind(userId, board.board.id)
              .first();
            await env.DB.prepare(
              "INSERT INTO board_lists (id, board_id, user_id, name, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
              .bind(
                crypto.randomUUID(),
                board.board.id,
                userId,
                a.name,
                Number(max?.max ?? 0) + 1000,
                Date.now(),
              )
              .run();
          } else if (a.action === "rename_list") {
            await env.DB.prepare(
              "UPDATE board_lists SET name = ? WHERE id = ? AND user_id = ?",
            )
              .bind(a.name, a.listId, userId)
              .run();
          } else if (a.action === "move_list") {
            await env.DB.prepare(
              "UPDATE board_lists SET position = ? WHERE id = ? AND user_id = ?",
            )
              .bind(a.position, a.listId, userId)
              .run();
          } else if (a.action === "delete_list") {
            await env.DB.prepare("DELETE FROM cards WHERE list_id = ? AND user_id = ?")
              .bind(a.listId, userId)
              .run();
            await env.DB.prepare("DELETE FROM board_lists WHERE id = ? AND user_id = ?")
              .bind(a.listId, userId)
              .run();
          } else if (a.action === "create_card") {
            // The list must belong to the caller — otherwise a known id would be
            // enough to write into someone else's board.
            const list = await env.DB.prepare(
              "SELECT id FROM board_lists WHERE id = ? AND user_id = ?",
            )
              .bind(a.listId, userId)
              .first();
            if (!list) {
              return Response.json({ ok: false, error: "Unknown list." }, { status: 404 });
            }
            const now = Date.now();
            await env.DB.prepare(
              "INSERT INTO cards (id, list_id, user_id, title, labels, due_date, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
              .bind(
                crypto.randomUUID(),
                a.listId,
                userId,
                a.title,
                (a.labels ?? []).join(","),
                a.dueDate ?? null,
                await nextPosition(env, userId, a.listId),
                now,
                now,
              )
              .run();
          } else if (a.action === "update_card") {
            const sets: string[] = [];
            const vals: unknown[] = [];
            if (a.title !== undefined) (sets.push("title = ?"), vals.push(a.title));
            if (a.description !== undefined)
              (sets.push("description = ?"), vals.push(a.description));
            if (a.labels !== undefined)
              (sets.push("labels = ?"), vals.push(a.labels.join(",")));
            if (a.dueDate !== undefined) (sets.push("due_date = ?"), vals.push(a.dueDate));
            if (a.checklist !== undefined)
              (sets.push("checklist = ?"), vals.push(JSON.stringify(a.checklist)));
            if (!sets.length) {
              return Response.json({ ok: false, error: "Nothing to update." }, { status: 400 });
            }
            sets.push("updated_at = ?");
            vals.push(Date.now(), a.cardId, userId);
            await env.DB.prepare(
              `UPDATE cards SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
            )
              .bind(...vals)
              .run();
          } else if (a.action === "move_card") {
            const list = await env.DB.prepare(
              "SELECT id FROM board_lists WHERE id = ? AND user_id = ?",
            )
              .bind(a.listId, userId)
              .first();
            if (!list) {
              return Response.json({ ok: false, error: "Unknown list." }, { status: 404 });
            }
            await env.DB.prepare(
              "UPDATE cards SET list_id = ?, position = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            )
              .bind(a.listId, a.position, Date.now(), a.cardId, userId)
              .run();
          } else if (a.action === "add_comment") {
            const card = await env.DB.prepare(
              "SELECT id FROM cards WHERE id = ? AND user_id = ?",
            )
              .bind(a.cardId, userId)
              .first();
            if (!card) {
              return Response.json({ ok: false, error: "Unknown card." }, { status: 404 });
            }
            await env.DB.prepare(
              "INSERT INTO card_comments (id, card_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
            )
              .bind(crypto.randomUUID(), a.cardId, userId, a.body, Date.now())
              .run();
          } else if (a.action === "delete_comment") {
            await env.DB.prepare(
              "DELETE FROM card_comments WHERE id = ? AND user_id = ?",
            )
              .bind(a.commentId, userId)
              .run();
          } else if (a.action === "link_item") {
            // The card and the library item must both be the caller's.
            const [card, item] = await Promise.all([
              env.DB.prepare("SELECT id FROM cards WHERE id = ? AND user_id = ?")
                .bind(a.cardId, userId)
                .first(),
              env.DB.prepare("SELECT id FROM library WHERE id = ? AND user_id = ?")
                .bind(a.libraryId, userId)
                .first(),
            ]);
            if (!card || !item) {
              return Response.json(
                { ok: false, error: "Unknown card or content item." },
                { status: 404 },
              );
            }
            const already = await env.DB.prepare(
              "SELECT id FROM card_links WHERE card_id = ? AND library_id = ? AND user_id = ?",
            )
              .bind(a.cardId, a.libraryId, userId)
              .first();
            if (!already) {
              await env.DB.prepare(
                "INSERT INTO card_links (id, card_id, user_id, library_id, created_at) VALUES (?, ?, ?, ?, ?)",
              )
                .bind(crypto.randomUUID(), a.cardId, userId, a.libraryId, Date.now())
                .run();
            }
          } else if (a.action === "unlink_item") {
            await env.DB.prepare("DELETE FROM card_links WHERE id = ? AND user_id = ?")
              .bind(a.linkId, userId)
              .run();
          } else if (a.action === "delete_attachment") {
            const row = await env.DB.prepare(
              "SELECT r2_key FROM card_attachments WHERE id = ? AND user_id = ?",
            )
              .bind(a.attachmentId, userId)
              .first();
            if (row?.r2_key && String(row.r2_key).startsWith(`attachments/${userId}/`)) {
              try {
                await env.MEDIA?.delete(String(row.r2_key));
              } catch {
                /* the row still goes; a stray object is cheaper than a stuck row */
              }
            }
            await env.DB.prepare(
              "DELETE FROM card_attachments WHERE id = ? AND user_id = ?",
            )
              .bind(a.attachmentId, userId)
              .run();
          } else if (a.action === "delete_card") {
            await env.DB.prepare("DELETE FROM cards WHERE id = ? AND user_id = ?")
              .bind(a.cardId, userId)
              .run();
            await env.DB.prepare("DELETE FROM card_comments WHERE card_id = ? AND user_id = ?")
              .bind(a.cardId, userId)
              .run();
          }
        } catch (err: any) {
          return Response.json(
            { ok: false, error: err?.message ?? "Board update failed." },
            { status: 500 },
          );
        }

        return Response.json({ ok: true, ...(await loadBoard(env, userId)) });
      },
    },
  },
});
