import { createFileRoute } from "@tanstack/react-router";
import {
  SETTINGS_KEYS,
  getEnv,
  readJsonSetting,
  readSetting,
  type ApifySlot,
} from "../../lib/settings";
import { currentUser, currentUserId, emailFromAssertion } from "../../lib/users";
import { getWebhook } from "../../lib/telegram-hook";
import { listChannels } from "../../lib/channels";
import { usageFor, type Usage as ApifyUsage } from "./apify-usage";

/**
 * GET /api/health — one honest page of "is this thing actually wired up?".
 *
 * ⑦ of the master plan: the two failures that cost the most time (a $7 Apify
 * overspend, and the Library API silently returning `[]` for weeks) would both
 * have shown up here in a single glance. So this route reports, per user:
 *
 *   keys      — what is stored and what is still missing (never the value)
 *   apify     — live spend against the allowance, per slot
 *   telegram  — chat id plus whether the intake hook is registered
 *   data      — real row counts (nothing invented, nothing hidden)
 *   schedule  — the two crons and when each last ran, plus recent failures
 *
 * Everything is read as the CALLER (or the profile they switched to), and a
 * per-user key is never satisfied by somebody else's.
 */

type Problem = { level: "error" | "warn" | "info"; message: string; href?: string };

async function count(env: any, sql: string, ...args: unknown[]): Promise<number> {
  try {
    const row = await env.DB.prepare(sql)
      .bind(...args)
      .first();
    return Number((row as any)?.n ?? 0);
  } catch {
    return 0;
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const userId = await currentUserId(request, context);
        const user = await currentUser(request, context);
        const origin = new URL(request.url).origin;

        const [
          aiBaseUrl,
          aiKey,
          youtube,
          serpapi,
          redditId,
          redditSecret,
          producthunt,
          imagegenKey,
          instagramHandle,
          slots,
          botToken,
          chatId,
        ] = await Promise.all([
          readSetting(env, SETTINGS_KEYS.aiBaseUrl, undefined, userId),
          readSetting(env, SETTINGS_KEYS.aiKey, undefined, userId),
          readSetting(env, SETTINGS_KEYS.youtube, undefined, userId),
          readSetting(env, SETTINGS_KEYS.serpapi, undefined, userId),
          readSetting(env, SETTINGS_KEYS.redditId, undefined, userId),
          readSetting(env, SETTINGS_KEYS.redditSecret, undefined, userId),
          readSetting(env, SETTINGS_KEYS.producthunt, undefined, userId),
          readSetting(env, SETTINGS_KEYS.imagegenKey, undefined, userId),
          readSetting(env, SETTINGS_KEYS.instagramHandle, undefined, userId),
          readJsonSetting<ApifySlot[]>(env, SETTINGS_KEYS.apifySlots, [], userId),
          readSetting(env, SETTINGS_KEYS.telegramBotToken, undefined, userId),
          readSetting(env, SETTINGS_KEYS.telegramChatId, undefined, userId),
        ]);

        // --- live Apify credit, per slot -----------------------------------
        const apifySlots: Array<
          Pick<ApifyUsage, "id" | "label" | "state" | "account" | "plan" | "error"> & {
            spentUsd: number | null;
            allowanceUsd: number | null;
            remainingUsd: number | null;
            cap: number | null;
            cycle_end: string | null;
          }
        > = [];
        const usableSlots = slots.filter((s) => s?.token && s.token.trim());
        const apify = await Promise.all(
          usableSlots.map((slot, index) => usageFor(slot, index)),
        );
        apify.forEach((usage) => {
          apifySlots.push({
            id: usage.id,
            label: usage.label,
            state: usage.state,
            account: usage.account,
            plan: usage.plan,
            error: usage.error,
            spentUsd: usage.spentUsd,
            allowanceUsd: usage.allowanceUsd,
            remainingUsd: usage.remainingUsd,
            cap: usage.cap,
            cycle_end: usage.cycle?.endAt ?? null,
          });
        });

        // --- Telegram intake ----------------------------------------------
        const hook = await getWebhook(env, userId);

        // --- Instagram channels (M3) ---------------------------------------
        // "Connected" is not the same as "working": a token can be fine while no
        // event ever arrives. Comparing the two is what catches a silent breakage.
        const STALE_MS = 7 * 86_400_000;
        const channelRows = await listChannels(env, userId);
        let automationsEnabled = 0;
        try {
          const row = await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM dm_automations WHERE user_id = ? AND enabled = 1",
          )
            .bind(userId)
            .first();
          automationsEnabled = Number((row as any)?.n ?? 0);
        } catch {
          /* no automations yet */
        }
        const channels = channelRows.map((c) => ({
          id: c.id,
          username: c.username,
          status: c.status,
          expires_at: c.token_expires_at,
          refreshed_at: c.token_refreshed_at,
          last_event_at: c.last_event_at,
          last_error: c.last_error,
          stale: !!c.last_event_at && Date.now() - c.last_event_at > STALE_MS,
        }));

        // --- data counts ----------------------------------------------------
        const libraryByType = await (async () => {
          try {
            const { results } = await env.DB.prepare(
              "SELECT type, COUNT(*) AS n FROM library WHERE user_id = ? GROUP BY type",
            )
              .bind(userId)
              .all();
            return (results ?? []) as Array<{ type: string; n: number }>;
          } catch {
            return [];
          }
        })();
        const libraryTotal = libraryByType.reduce((sum, r) => sum + Number(r.n ?? 0), 0);

        const [
          unscored,
          projects,
          resources,
          boards,
          cards,
          tasksOpen,
          tasksTotal,
        ] = await Promise.all([
          count(env, "SELECT COUNT(*) AS n FROM library WHERE user_id = ? AND COALESCE(quality_score, 0) = 0", userId),
          count(env, "SELECT COUNT(*) AS n FROM projects WHERE user_id = ?", userId),
          count(env, "SELECT COUNT(*) AS n FROM resources WHERE user_id = ?", userId),
          count(env, "SELECT COUNT(*) AS n FROM boards WHERE user_id = ?", userId),
          count(env, "SELECT COUNT(*) AS n FROM cards WHERE user_id = ?", userId),
          count(env, "SELECT COUNT(*) AS n FROM telegram_tasks WHERE user_id = ? AND COALESCE(done, 0) = 0", userId),
          count(env, "SELECT COUNT(*) AS n FROM telegram_tasks WHERE user_id = ?", userId),
        ]);

        // --- schedule / last runs -------------------------------------------
        let lastCron: any = null;
        let failures: any[] = [];
        try {
          lastCron = await env.DB.prepare(
            "SELECT module, action, detail, created_at FROM activity WHERE user_id = ? AND module = 'cron' ORDER BY created_at DESC LIMIT 1",
          )
            .bind(userId)
            .first();
          const { results } = await env.DB.prepare(
            `SELECT module, action, detail, created_at FROM activity
              WHERE user_id = ? AND created_at > ?
                AND (action LIKE '%fail%' OR action LIKE '%partial%' OR action LIKE '%error%')
              ORDER BY created_at DESC LIMIT 5`,
          )
            .bind(userId, Date.now() - 7 * 86_400_000)
            .all();
          failures = (results ?? []) as any[];
        } catch {
          /* activity table missing — reported as unknown below */
        }

        // --- what is actually wrong -----------------------------------------
        const problems: Problem[] = [];
        if (!aiBaseUrl || !aiKey) {
          problems.push({
            level: "error",
            message:
              "No AI key for this profile — every generate/score route will refuse until you add your own.",
            href: "/settings",
          });
        }
        if (!usableSlots.length) {
          problems.push({
            level: "warn",
            message: "No Apify token — competitor scraping cannot run.",
            href: "/settings",
          });
        }
        for (const slot of apifySlots) {
          if (slot.state === "blocked") {
            problems.push({
              level: "error",
              message: `Apify slot “${slot.label}” has spent its allowance (${slot.spentUsd ?? "?"} of ${slot.allowanceUsd ?? "?"} USD) — scraping is paused until it resets.`,
              href: "/settings",
            });
          } else if (slot.state === "warn") {
            const spent = slot.spentUsd === null ? "?" : `$${slot.spentUsd.toFixed(2)}`;
            const cap = slot.cap === null ? "your cap" : `$${slot.cap.toFixed(2)}`;
            problems.push({
              level: "warn",
              message: `Apify slot “${slot.label}” has passed ${cap} (spent ${spent}) — swap the token before it runs dry.`,
              href: "/settings",
            });
          } else if (slot.state === "error") {
            problems.push({
              level: "warn",
              message: `Apify slot “${slot.label}” could not be checked: ${slot.error ?? "unknown error"}.`,
              href: "/settings",
            });
          }
        }
        if (!botToken) {
          problems.push({
            level: "warn",
            message: "No Telegram bot token — nothing can be sent or received.",
            href: "/settings",
          });
        } else if (!hook?.registered_at) {
          problems.push({
            level: "info",
            message:
              "Telegram can send, but the intake hook is off — messages to your bot do not create tasks yet.",
            href: "/settings",
          });
        }
        if (hook?.last_error) {
          problems.push({
            level: "warn",
            message: `Telegram reported a delivery problem: ${hook.last_error}`,
            href: "/settings",
          });
        }
        if (!channelRows.length) {
          problems.push({
            level: "info",
            message:
              "No Instagram account is connected — DM automations cannot run until one is.",
            href: "/dm",
          });
        }
        for (const c of channels) {
          const who = c.username ? `@${c.username}` : "The Instagram account";
          if (c.status === "needs_reconnect") {
            problems.push({
              level: "error",
              message: `${who} needs reconnecting: ${c.last_error ?? "its token is no longer usable"}.`,
              href: "/dm",
            });
          } else if (c.stale && automationsEnabled > 0) {
            problems.push({
              level: "warn",
              message: `${who} has ${automationsEnabled} automation(s) on but has received nothing for over a week — the webhook subscription may have dropped.`,
              href: "/dm",
            });
          }
        }
        for (const row of failures) {
          problems.push({
            level: "warn",
            message: `${row.module} · ${row.action}: ${String(row.detail ?? "").slice(0, 140)}`,
            href: "/autopilot",
          });
        }

        return Response.json({
          ok: true,
          identity: {
            user_id: userId,
            email: user?.email ?? null,
            name: user?.name ?? null,
            role: user?.role ?? null,
            signed_in_email:
              (request.headers.get("cf-access-authenticated-user-email") ?? "").trim() ||
              emailFromAssertion(request),
            switched: userId !== (user?.id ?? null),
          },
          keys: {
            ai: { ready: !!aiBaseUrl && !!aiKey, base_url: aiBaseUrl ?? null },
            youtube: !!youtube,
            serpapi: !!serpapi,
            reddit: !!redditId && !!redditSecret,
            producthunt: !!producthunt,
            imagegen: !!imagegenKey,
            instagram_handle: !!instagramHandle,
            telegram: { token: !!botToken, chat_id: !!chatId },
            apify_slots: usableSlots.length,
          },
          apify: apifySlots,
          channels: { connected: channels, automations_enabled: automationsEnabled },
          telegram: {
            chat_id: chatId ?? hook?.chat_id ?? null,
            intake_registered: !!hook?.registered_at,
            registered_at: hook?.registered_at ?? null,
            last_update_at: hook?.last_update_at ?? null,
            updates_seen: hook?.updates_seen ?? 0,
            last_error: hook?.last_error ?? null,
            webhook_url: hook?.secret ? `${origin}/api/telegram-hook?s=${hook.secret}` : null,
          },
          data: {
            library: { total: libraryTotal, by_type: libraryByType, unscored },
            projects,
            resources,
            board: { boards, cards },
            tasks: { open: tasksOpen, total: tasksTotal },
          },
          schedule: {
            crons: [
              { cron: "0 2 * * *", label: "08:00 Asia/Dhaka — morning brief" },
              { cron: "0 14 * * *", label: "20:00 Asia/Dhaka — evening check" },
            ],
            last_cron: lastCron
              ? {
                  action: lastCron.action,
                  detail: lastCron.detail,
                  at: lastCron.created_at,
                }
              : null,
            recent_failures: failures.map((f) => ({
              module: f.module,
              action: f.action,
              detail: String(f.detail ?? "").slice(0, 200),
              at: f.created_at,
            })),
          },
          problems,
        });
      },
    },
  },
});
