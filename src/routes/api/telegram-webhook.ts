import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";
import {
  ensureWebhook,
  registerWebhook,
  removeWebhook,
  webhookStatus,
} from "../../lib/telegram-hook";

/**
 * /api/telegram-webhook — Settings' control panel for the intake.
 *
 * GET  → is the hook registered, which bot is it for, what did Telegram say last?
 * POST → { action: "register" | "remove" | "rotate" }
 *
 * The secret never leaves this route (the page sits behind Access); the status
 * response includes the full delivery URL because that is the only way the user
 * can see what their bot is pointing at.
 */

export const Route = createFileRoute("/api/telegram-webhook")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const userId = await currentUserId(request, context);
        const origin = new URL(request.url).origin;
        const status = await webhookStatus(env, userId, origin, { createIfMissing: true });
        return Response.json({ ok: true, ...status });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const userId = await currentUserId(request, context);
        const origin = new URL(request.url).origin;

        const body = (await request.json().catch(() => ({}))) as { action?: string };
        const action = String(body?.action ?? "").trim();

        if (action === "register") {
          const result = await registerWebhook(env, userId, origin);
          const status = await webhookStatus(env, userId, origin);
          return Response.json(
            { ok: result.ok, error: result.error, ...status },
            { status: result.ok ? 200 : 400 },
          );
        }

        if (action === "remove") {
          const result = await removeWebhook(env, userId);
          const status = await webhookStatus(env, userId, origin);
          return Response.json(
            { ok: result.ok, error: result.error, ...status },
            { status: result.ok ? 200 : 400 },
          );
        }

        if (action === "rotate") {
          // A new secret invalidates the old URL; Telegram must be told again.
          await ensureWebhook(env, userId, { reset: true });
          const result = await registerWebhook(env, userId, origin);
          const status = await webhookStatus(env, userId, origin);
          return Response.json(
            { ok: result.ok, error: result.error, ...status },
            { status: result.ok ? 200 : 400 },
          );
        }

        return Response.json(
          { ok: false, error: 'Send { "action": "register" | "remove" | "rotate" }.' },
          { status: 400 },
        );
      },
    },
  },
});
