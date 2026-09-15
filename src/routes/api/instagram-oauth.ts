import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";
import { logActivity } from "../../lib/activity";
import {
  appCreds,
  authUrl,
  ensureVerifyToken,
  decryptToken,
  disconnectChannel,
  ensureSubscriptions,
  exchangeCode,
  fetchMe,
  getChannel,
  listChannels,
  longLivedToken,
  redirectUri,
  refreshDueChannels,
  saveAppCreds,
  saveChannel,
  signState,
  verifyState,
  IG_SCOPES,
} from "../../lib/channels";

/**
 * /api/instagram-oauth — "Connect Instagram" for any user of this app (M1).
 *
 * GET  ?action=status                → the Connections card's data
 * GET  ?action=callback&code&state   → Instagram sends the browser back here
 * POST { action: save-app | start | disconnect | refresh-now | test }
 *
 * The callback is reached by the *user's own browser* (which already holds the
 * Cloudflare Access session), so unlike the webhook it needs no bypass.
 *
 * Nothing here talks to a Graph API endpoint that needs a token except `test` and
 * `refresh-now`, and both report Telegram-style honest errors rather than throwing.
 */

export const Route = createFileRoute("/api/instagram-oauth")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const origin = new URL(request.url).origin;
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "status";

        /* --------------------------------------------------------- callback */
        if (action === "callback") {
          const code = url.searchParams.get("code") ?? "";
          const state = url.searchParams.get("state") ?? "";
          const denied = url.searchParams.get("error") ?? "";
          const back = (params: string) =>
            Response.redirect(`${origin}/dm?${params}`, 302);

          if (denied) return back(`connect_error=${encodeURIComponent(denied)}`);
          if (!code || !state) {
            return back(`connect_error=${encodeURIComponent("Instagram sent no code.")}`);
          }

          const verified = await verifyState(env, state);
          if (!verified) {
            return back(
              `connect_error=${encodeURIComponent(
                "That connection link expired or was tampered with — please press Connect again.",
              )}`,
            );
          }

          const creds = await appCreds(env);
          if (!creds) {
            return back(
              `connect_error=${encodeURIComponent("App ID / secret are not saved yet.")}`,
            );
          }

          const short = await exchangeCode(creds, code, origin);
          if (!short.ok || !short.token) {
            return back(
              `connect_error=${encodeURIComponent(short.error ?? "Token exchange failed.")}`,
            );
          }
          const long = await longLivedToken(creds, short.token);
          if (!long.ok || !long.token) {
            return back(
              `connect_error=${encodeURIComponent(long.error ?? "Long-lived exchange failed.")}`,
            );
          }

          const me = await fetchMe(long.token);
          if (!me.ok || !me.igUserId) {
            return back(
              `connect_error=${encodeURIComponent(
                me.error ?? "Instagram would not tell us which account this is.",
              )}`,
            );
          }

          const stored = await saveChannel(env, verified.userId, {
            igUserId: me.igUserId,
            username: me.username ?? null,
            accountType: me.accountType ?? null,
            token: long.token,
            expiresIn: long.expiresIn ?? 5_184_000,
            scopes: IG_SCOPES,
          });
          if (!stored.ok) {
            return back(`connect_error=${encodeURIComponent(stored.error ?? "Could not store it.")}`);
          }

          await logActivity(
            env,
            "instagram",
            "connected",
            `@${me.username ?? me.igUserId}`,
            verified.userId,
          );
          return back(`connected=${encodeURIComponent(me.username ?? me.igUserId)}`);
        }

        /* ----------------------------------------------------------- status */
        const userId = await currentUserId(request, context);
        const creds = await appCreds(env);
        const channels = await listChannels(env, userId);
        // Generated rather than asked for: the owner just copies it into Meta.
        const verifyToken = creds ? await ensureVerifyToken(env) : null;

        return Response.json({
          ok: true,
          app: {
            hasAppId: !!creds?.appId,
            hasSecret: !!creds?.appSecret,
            hasVerifyToken: !!creds?.verifyToken,
            ready: !!creds,
          },
          redirectUri: redirectUri(origin),
          webhook: {
            url: `${origin}/api/instagram-webhook`,
            verifyToken,
            fields: ["comments", "messages", "message_reactions"],
          },
          scopes: IG_SCOPES,
          channels: channels.map((c) => ({
            id: c.id,
            username: c.username,
            ig_user_id: c.ig_user_id,
            account_type: c.account_type,
            status: c.status,
            token_expires_at: c.token_expires_at,
            token_refreshed_at: c.token_refreshed_at,
            last_event_at: c.last_event_at,
            last_error: c.last_error,
            connected_at: c.connected_at,
          })),
        });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const origin = new URL(request.url).origin;
        const userId = await currentUserId(request, context);
        const body = (await request.json().catch(() => ({}))) as any;
        const action = String(body?.action ?? "");

        if (action === "save-app") {
          const appId = String(body?.appId ?? "").trim();
          const appSecret = String(body?.appSecret ?? "").trim();
          if (!appId || !appSecret) {
            return Response.json(
              { ok: false, error: "Both the App ID and the App Secret are needed." },
              { status: 400 },
            );
          }
          await saveAppCreds(env, {
            appId,
            appSecret,
            verifyToken:
              typeof body?.verifyToken === "string" && body.verifyToken.trim()
                ? body.verifyToken.trim()
                : undefined,
          });
          // A webhook needs a verify token either way — make sure one exists.
          await ensureVerifyToken(env);
          await logActivity(env, "instagram", "app_credentials_saved", `app ${appId.slice(0, 6)}…`, userId);
          return Response.json({ ok: true });
        }

        if (action === "start") {
          const creds = await appCreds(env);
          if (!creds) {
            return Response.json(
              {
                ok: false,
                error:
                  "Save your Meta App ID and App Secret first — Instagram has nothing to authorise against until then.",
              },
              { status: 400 },
            );
          }
          const state = await signState(env, userId);
          if (!state) {
            return Response.json(
              { ok: false, error: "Could not sign the connection request." },
              { status: 500 },
            );
          }
          return Response.json({ ok: true, url: authUrl(creds, origin, state) });
        }

        if (action === "disconnect") {
          const id = String(body?.id ?? "");
          const channel = await getChannel(env, userId, id || undefined);
          if (!channel) {
            return Response.json({ ok: false, error: "That connection is not yours." }, { status: 404 });
          }
          const done = await disconnectChannel(env, userId, channel.id);
          await logActivity(
            env,
            "instagram",
            "disconnected",
            channel.username ? `@${channel.username}` : channel.id,
            userId,
          );
          return Response.json({ ok: done, channels: await listChannels(env, userId) });
        }

        if (action === "refresh-now") {
          // Both halves of the maintenance run: the token and the subscription.
          const outcome = await refreshDueChannels(env, { force: true });
          const healed = await ensureSubscriptions(env);
          await logActivity(
            env,
            "instagram",
            "token_refresh",
            `checked ${outcome.checked}, refreshed ${outcome.refreshed}, failed ${outcome.failed}; subscriptions: ${healed.fixed} repaired of ${healed.checked}`,
            userId,
          );
          return Response.json({ ok: true, ...outcome, subscriptions: healed });
        }

        if (action === "test") {
          const channel = await getChannel(env, userId, String(body?.id ?? "") || undefined);
          if (!channel) {
            return Response.json({ ok: false, error: "No connected account yet." }, { status: 404 });
          }
          const token = await decryptToken(env, channel.token_enc);
          if (!token) {
            return Response.json({
              ok: false,
              error:
                "Stored token could not be decrypted (the app secret changed?) — reconnect the account.",
            });
          }
          const me = await fetchMe(token);
          if (!me.ok) {
            return Response.json({ ok: false, error: me.error ?? "Instagram refused the token." });
          }
          return Response.json({
            ok: true,
            account: { username: me.username, id: me.igUserId, type: me.accountType },
            expires_at: channel.token_expires_at,
            scopes: channel.scopes,
          });
        }

        return Response.json(
          { ok: false, error: "Unknown action. Use save-app, start, disconnect, refresh-now or test." },
          { status: 400 },
        );
      },
    },
  },
});
