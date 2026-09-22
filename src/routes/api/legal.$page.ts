import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { pathSegments } from "../../lib/route-params";
import { appCreds } from "../../lib/channels";
import {
  DATA_DELETION_BODY,
  PRIVACY_BODY,
  TERMS_BODY,
  legalResponse,
  today,
} from "../../lib/legal";

/**
 * /api/legal/privacy · /api/legal/terms · /api/legal/data-deletion
 *
 * Meta asks for these three URLs before an app can leave Development mode, and a
 * Data Deletion callback is mandatory for any app that stores user data. Rather
 * than the owner inventing them (or pasting someone else's template), they are
 * served from this Worker and describe what this app actually does — which is the
 * only honest version of a privacy policy.
 *
 * These are the only public pages in Content OS: the rest of the app is behind
 * Cloudflare Access, so this path gets its own path-scoped bypass policy.
 *
 * `data-deletion` answers the way Meta requires — a POST with a `signed_request`,
 * a JSON reply carrying `url` + `confirmation_code` — and it really deletes: the
 * matching channel and everything filed under it.
 */

// The page shell and the three bodies live in `src/lib/legal.ts` — `/privacy` serves the
// same policy, and two copies of a privacy policy is two policies.

// `Uint8Array<ArrayBuffer>` on purpose: WebCrypto's BufferSource rejects a view that
// might be backed by a SharedArrayBuffer.
function base64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const Route = createFileRoute("/api/legal/$page")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const pageName = String(pathSegments(request, "/api/legal")[0] ?? "").toLowerCase();
        getEnv(request, context); // keep the env contract identical to the other routes

        if (pageName === "privacy" || pageName === "privacy-policy") {
          return legalResponse("Privacy", PRIVACY_BODY, today());
        }

        if (pageName === "terms" || pageName === "terms-of-service") {
          return legalResponse("Terms", TERMS_BODY, today());
        }

        if (pageName === "data-deletion" || pageName === "deletion-status") {
          return legalResponse("Data deletion", DATA_DELETION_BODY, today());
        }

        return new Response("Not found", { status: 404 });
      },

      /** Meta's mandatory Data Deletion Request callback. */
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const origin = new URL(request.url).origin;
        const confirmation = `cos-${crypto.randomUUID()}`;
        const statusUrl = `${origin}/api/legal/data-deletion`;

        let userId: string | null = null;
        let parsed: any = null;
        try {
          const form = await request.formData();
          const signed = String(form.get("signed_request") ?? "");
          const [sigPart, payloadPart] = signed.split(".");
          if (sigPart && payloadPart) {
            parsed = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadPart)));
            const creds = await appCreds(env);
            if (creds) {
              const key = await crypto.subtle.importKey(
                "raw",
                new TextEncoder().encode(creds.appSecret),
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["verify"],
              );
              const ok = await crypto.subtle.verify(
                "HMAC",
                key,
                base64urlDecode(sigPart),
                new TextEncoder().encode(payloadPart),
              );
              // Only act on a request Meta actually signed.
              if (ok) userId = parsed?.user_id ? String(parsed.user_id) : null;
            }
          }
        } catch {
          /* fall through to the same reply: Meta needs the JSON shape either way */
        }

        let deleted = false;
        if (userId) {
          try {
            const channel = await env.DB.prepare(
              "SELECT id FROM channels WHERE platform = 'instagram' AND ig_user_id = ?",
            )
              .bind(userId)
              .first();
            if (channel?.id) {
              const convos = await env.DB.prepare(
                "SELECT id FROM dm_conversations WHERE user_id = (SELECT user_id FROM channels WHERE id = ?)",
              )
                .bind(channel.id)
                .all();
              const ids: string[] = (convos?.results ?? []).map((r: any) => r.id);
              for (const id of ids) {
                await env.DB.prepare("DELETE FROM dm_messages WHERE conversation_id = ?").bind(id).run();
              }
              await env.DB.prepare("DELETE FROM dm_conversations WHERE user_id = (SELECT user_id FROM channels WHERE id = ?)").bind(channel.id).run();
              await env.DB.prepare("DELETE FROM dm_contacts WHERE user_id = (SELECT user_id FROM channels WHERE id = ?)").bind(channel.id).run();
              await env.DB.prepare("DELETE FROM dm_events WHERE conversation_id IS NOT NULL AND conversation_id NOT IN (SELECT id FROM dm_conversations)").run();
              await env.DB.prepare("DELETE FROM channels WHERE id = ?").bind(channel.id).run();
              await env.DB.prepare("DELETE FROM ig_webhook_events WHERE ig_user_id = ?").bind(userId).run();
              deleted = true;
            }
          } catch {
            /* the confirmation below still tells Instagram what happened */
          }
        }

        return Response.json({
          url: statusUrl,
          confirmation_code: confirmation,
          ...(parsed ? { deleted } : {}),
        });
      },
    },
  },
});
