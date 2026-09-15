import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { logActivity } from "../../lib/activity";
import {
  RATE_LIMIT_PER_MINUTE,
  appCreds,
  channelForIgId,
  decryptToken,
  markChannel,
  recentSendCount,
} from "../../lib/channels";
import {
  privateReply,
  publicReply,
  sendDm,
} from "../../lib/instagram-api";
import { runEngine, type Delivery } from "../../lib/dm";

/**
 * /api/instagram-webhook — where Instagram delivers comments and DMs (M2).
 *
 * GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…  → the handshake
 * POST  { entry: [ … ] }                                        → the events
 *
 * This is the one route a stranger's server has to reach, so it authenticates
 * itself instead of relying on Cloudflare Access:
 *   1. the handshake answers only when the verify token matches what the owner
 *      pasted into Meta;
 *   2. every POST is checked against `X-Hub-Signature-256`, an HMAC of the RAW body
 *      with the app secret — a body that was edited in flight fails;
 *   3. `entry.id` (the Instagram account) decides whose automations run, so no
 *      identity is trusted from the payload itself;
 *   4. each event id is claimed once, because Meta retries until it sees a 2xx.
 *
 * It always answers 200 for a well-signed event it could not fully handle —
 * otherwise Meta retries the same broken delivery for hours. Anything that went
 * wrong goes to the activity log and the channel's `last_error`, not into a 5xx.
 */

const FIELD_COMMENTS = "comments";
const FIELD_MESSAGES = "messages";

type WebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{ field?: string; value?: any }>;
    messaging?: Array<any>;
  }>;
};

async function validSignature(secret: string, raw: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const expected = header.startsWith("sha256=") ? header.slice(7) : header;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
    const hex = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hex.length !== expected.length) return false;
    // Constant-time compare — a length check alone leaks nothing useful, but a
    // byte-by-byte early exit does.
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

async function claimEvent(
  env: any,
  key: string,
  row: { user_id: string | null; ig_user_id: string | null; field: string; kind: string; detail: string },
): Promise<boolean> {
  try {
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO ig_webhook_events
         (event_key, user_id, ig_user_id, field, kind, detail, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        key,
        row.user_id,
        row.ig_user_id,
        row.field,
        row.kind,
        row.detail.slice(0, 300),
        Date.now(),
      )
      .run();
    return Number(res?.meta?.changes ?? 1) > 0;
  } catch {
    // Never drop a real event because the bookkeeping table is unhappy.
    return true;
  }
}

async function markHandled(env: any, key: string) {
  try {
    await env.DB.prepare("UPDATE ig_webhook_events SET handled_at = ? WHERE event_key = ?")
      .bind(Date.now(), key)
      .run();
  } catch {
    /* see claimEvent */
  }
}

export const Route = createFileRoute("/api/instagram-webhook")({
  server: {
    handlers: {
      /** Meta's subscription handshake. */
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const creds = await appCreds(env);
        if (!creds?.verifyToken) {
          return new Response("No verify token is configured.", { status: 403 });
        }
        if (mode !== "subscribe" || token !== creds.verifyToken) {
          return new Response("Verification failed.", { status: 403 });
        }
        // Meta wants the challenge echoed as plain text.
        return new Response(challenge ?? "", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const creds = await appCreds(env);
        if (!creds) {
          return new Response("App credentials are not configured.", { status: 403 });
        }

        // The signature is over the RAW body, so read it before parsing.
        const raw = await request.text();
        const ok = await validSignature(
          creds.appSecret,
          raw,
          request.headers.get("x-hub-signature-256"),
        );
        if (!ok) {
          return new Response("Invalid signature.", { status: 403 });
        }

        let body: WebhookBody;
        try {
          body = JSON.parse(raw) as WebhookBody;
        } catch {
          return Response.json({ ok: true, ignored: "unparsable body" });
        }

        const results: Array<Record<string, unknown>> = [];

        for (const entry of body.entry ?? []) {
          const igUserId = entry.id ? String(entry.id) : "";
          if (!igUserId) continue;

          const channel = await channelForIgId(env, igUserId);
          if (!channel) {
            // A completely unknown account: record it once and move on.
            await claimEvent(env, `unknown:${igUserId}:${entry.time ?? ""}`, {
              user_id: null,
              ig_user_id: igUserId,
              field: "unknown",
              kind: "no_channel",
              detail: "No connected account matches this entry.id",
            });
            results.push({ ig_user_id: igUserId, ignored: "no channel" });
            continue;
          }

          const token = await decryptToken(env, channel.token_enc);
          await markChannel(env, channel.id, { lastEventAt: Date.now() });
          if (!token) {
            await markChannel(env, channel.id, {
              status: "needs_reconnect",
              error: "Stored token could not be decrypted — reconnect the account.",
            });
            results.push({ ig_user_id: igUserId, ignored: "token unreadable" });
            continue;
          }

          const deliver: Delivery = async (args) => {
            const res =
              args.channel === "comment"
                ? await publicReply(token, igUserId, String(args.commentId ?? ""), args.text)
                : args.via === "private_reply"
                  ? await privateReply(token, igUserId, String(args.commentId ?? ""), args.text)
                  : await sendDm(token, igUserId, String(args.igsid ?? ""), args.text);
            if (!res.ok) {
              await markChannel(env, channel.id, { error: res.error ?? "send failed" });
            }
            return { ok: res.ok, error: res.error };
          };

          /* --------------------------------------------------- comments */
          for (const change of entry.changes ?? []) {
            if (change.field !== FIELD_COMMENTS) continue;
            const value = change.value ?? {};
            const commentId = String(value.id ?? "");
            const text = String(value.text ?? "");
            const fromId = String(value.from?.id ?? "");
            if (!commentId || !fromId) continue;

            const fresh = await claimEvent(env, `comment:${commentId}`, {
              user_id: channel.user_id,
              ig_user_id: igUserId,
              field: FIELD_COMMENTS,
              kind: "comment",
              detail: text.slice(0, 200),
            });
            if (!fresh) {
              results.push({ comment: commentId, duplicate: true });
              continue;
            }

            // Spam guard: a viral reel can produce a burst in seconds, and Meta
            // limits an app that fires too fast. Skip and record rather than
            // getting the account limited — the comment stays unanswered and shows
            // up as a hand-off instead of silently vanishing.
            if ((await recentSendCount(env, channel.user_id)) >= RATE_LIMIT_PER_MINUTE) {
              await markHandled(env, `comment:${commentId}`);
              await claimEvent(env, `rate:comment:${commentId}`, {
                user_id: channel.user_id,
                ig_user_id: igUserId,
                field: FIELD_COMMENTS,
                kind: "rate_limited",
                detail: text.slice(0, 120),
              });
              results.push({ comment: commentId, rate_limited: true });
              continue;
            }

            const outcome = await runEngine(env, channel.user_id, {
              text,
              kind: "comment",
              commentId,
              postId: value.media?.id ? String(value.media.id) : null,
              simulated: false,
              deliver,
              contact: {
                ig_user_id: fromId,
                username: value.from?.username ?? null,
                first_name: null,
              },
            });
            await markHandled(env, `comment:${commentId}`);
            results.push({
              comment: commentId,
              matched: outcome.matched,
              automation: outcome.automation?.name ?? null,
              public_reply: !!outcome.publicReply,
              dm_via: outcome.dmVia,
              handoff: outcome.handoff,
            });
          }

          /* --------------------------------------------------- messages */
          for (const event of entry.messaging ?? []) {
            const mid = String(event?.message?.mid ?? "");
            const senderId = String(event?.sender?.id ?? "");
            const text = String(event?.message?.text ?? "");
            if (!mid || !senderId || senderId === igUserId) continue;

            const fresh = await claimEvent(env, `message:${mid}`, {
              user_id: channel.user_id,
              ig_user_id: igUserId,
              field: FIELD_MESSAGES,
              kind: "dm",
              detail: text.slice(0, 200),
            });
            if (!fresh) {
              results.push({ message: mid, duplicate: true });
              continue;
            }

            const outcome = await runEngine(env, channel.user_id, {
              text,
              kind: "dm",
              commentId: null,
              simulated: false,
              deliver,
              contact: { ig_user_id: senderId, username: null, first_name: null },
            });
            await markHandled(env, `message:${mid}`);
            results.push({
              message: mid,
              matched: outcome.matched,
              automation: outcome.automation?.name ?? null,
              dm_via: outcome.dmVia,
              handoff: outcome.handoff,
            });
          }
        }

        if (results.length) {
          await logActivity(
            env,
            "instagram",
            "webhook",
            `${results.length} event(s): ${JSON.stringify(results).slice(0, 400)}`,
            undefined,
          );
        }

        // Always 200 for a signed event: a non-2xx makes Meta retry for hours.
        return Response.json({ ok: true, handled: results.length, results });
      },
    },
  },
});
