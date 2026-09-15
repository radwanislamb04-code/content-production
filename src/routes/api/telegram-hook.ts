import { createFileRoute } from "@tanstack/react-router";
import { getEnv, readTelegramConfig } from "../../lib/settings";
import {
  claimUpdate,
  findWebhookBySecret,
  handleCallback,
  handleUpdate,
  markUpdate,
  replyTo,
  sendWithKeyboard,
  webhookUrl,
  type TgUpdate,
} from "../../lib/telegram-hook";

/**
 * POST /api/telegram-hook?s=<secret> — where Telegram delivers your messages.
 *
 * This is the one route a stranger's server (Telegram) has to be able to reach,
 * so it authenticates itself instead of relying on Cloudflare Access:
 *   1. `X-Telegram-Bot-Api-Secret-Token` (set through `setWebhook`) must match a
 *      stored secret; `?s=` is accepted as a second form of the same proof.
 *   2. The secret identifies WHICH profile the update belongs to — every user has
 *      their own bot, so a bot token is never guessed or shared.
 *   3. `update_id` is claimed once; Telegram retries until it gets a 2xx, and a
 *      retry must not create a second task.
 *
 * Answering 200 quickly is part of the contract: Telegram re-delivers anything it
 * does not see acknowledged, so even a failure here is reported in the body
 * rather than as a 5xx that would cause an endless retry loop.
 */

export const Route = createFileRoute("/api/telegram-hook")({
  server: {
    handlers: {
      // Reachability probe — also what a browser sees if you open the URL.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = (url.searchParams.get("s") ?? "").trim();
        if (!secret) {
          return Response.json({
            ok: true,
            service: "content-os-telegram-hook",
            hint: "POST Telegram updates here. A secret is required for delivery.",
          });
        }
        const env = getEnv(request, {});
        const row = await findWebhookBySecret(env, secret);
        if (!row) {
          return Response.json({ ok: false, error: "Unknown secret." }, { status: 404 });
        }
        return Response.json({
          ok: true,
          service: "content-os-telegram-hook",
          user_id: row.user_id,
          bot_username: row.bot_username,
          updates_seen: row.updates_seen ?? 0,
          last_update_at: row.last_update_at,
          last_error: row.last_error,
        });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const url = new URL(request.url);
        const presented = (
          request.headers.get("x-telegram-bot-api-secret-token") ??
          url.searchParams.get("s") ??
          ""
        ).trim();

        if (!presented) {
          return Response.json(
            { ok: false, error: "Missing Telegram secret." },
            { status: 401 },
          );
        }

        const row = await findWebhookBySecret(env, presented);
        if (!row) {
          return Response.json({ ok: false, error: "Unknown secret." }, { status: 404 });
        }

        // Guard: the URL secret and the header secret must agree when both arrive.
        const header = (request.headers.get("x-telegram-bot-api-secret-token") ?? "").trim();
        if (header && header !== row.secret) {
          return Response.json({ ok: false, error: "Secret mismatch." }, { status: 403 });
        }

        let update: TgUpdate;
        try {
          update = (await request.json()) as TgUpdate;
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
        }

        const updateId = Number(update?.update_id);
        if (!Number.isFinite(updateId)) {
          return Response.json({ ok: false, error: "Missing update_id." }, { status: 400 });
        }

        const fresh = await claimUpdate(env, updateId, row.user_id);
        if (!fresh) {
          return Response.json({ ok: true, duplicate: true, update_id: updateId });
        }

        const { botToken } = await readTelegramConfig(env, row.user_id);
        if (!botToken) {
          await markUpdate(env, row.user_id, {
            error: "A message arrived but this profile has no bot token saved.",
          });
          return Response.json({ ok: true, ignored: "no bot token stored" });
        }

        // A button tap ("where should this go?") is a callback_query, not a
        // message — it needs the same idempotency and its own branch.
        if (update.callback_query) {
          const routed = await handleCallback(env, row, botToken, update.callback_query);
          await markUpdate(env, row.user_id, { error: null });
          return Response.json({
            ok: true,
            update_id: updateId,
            action: routed.action,
            detail: routed.detail,
            toast: routed.toast,
          });
        }

        const handled = await handleUpdate(env, row, botToken, update);
        const chatId = update?.message?.chat?.id;

        let replyId: number | undefined;
        let replyError: string | null = null;
        if (handled.reply && chatId !== undefined) {
          // With buttons when the reply has somewhere to send it; plain text
          // otherwise (/list, /id, /help never need a keyboard).
          const sent = handled.keyboard
            ? await sendWithKeyboard(botToken, chatId, handled.reply, handled.keyboard)
            : await replyTo(botToken, chatId, handled.reply);
          if (sent.ok) replyId = sent.messageId;
          else replyError = sent.error ?? "reply failed";
        }

        await markUpdate(env, row.user_id, { error: replyError });

        return Response.json({
          ok: true,
          update_id: updateId,
          action: handled.action,
          detail: handled.detail,
          replied: replyId !== undefined,
          ...(replyError ? { reply_error: replyError } : {}),
          hook: webhookUrl(url.origin, row.secret),
        });
      },
    },
  },
});
