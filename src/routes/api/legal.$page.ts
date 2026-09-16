import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import { pathSegments } from "../../lib/route-params";
import { appCreds } from "../../lib/channels";

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

const STYLE = `
  :root { color-scheme: dark }
  body { margin:0; background:#0b0d0c; color:#e8ece9; font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }
  main { max-width:44rem; margin:0 auto; padding:3rem 1.25rem 5rem }
  h1 { font-size:1.6rem; margin:0 0 .25rem } h2 { font-size:1.05rem; margin:2rem 0 .5rem; color:#c9f7c0 }
  p, li { color:#b9c2bc } a { color:#7dff5a } code { background:#141815; padding:.1rem .3rem; border-radius:4px; color:#d8e6dd }
  .meta { color:#7b857e; font-size:.85rem }
  ul { padding-left:1.1rem }
`;

function page(title: string, body: string, updated: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Content OS</title><style>${STYLE}</style></head>
<body><main>${body}<p class="meta">Last updated: ${updated}.</p></main></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

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
        const today = new Date().toISOString().slice(0, 10);
        getEnv(request, context); // keep the env contract identical to the other routes

        if (pageName === "privacy" || pageName === "privacy-policy") {
          return page(
            "Privacy",
            `<h1>Privacy</h1>
<p class="meta">Content OS is a private tool for a small number of Instagram creators.</p>
<h2>What is stored</h2>
<ul>
  <li>The Instagram account id and username of each account that authorises the app.</li>
  <li>An access token for that account, encrypted at rest (AES-GCM); it is never shown back to anyone.</li>
  <li>The comments and direct messages that account receives while the app is connected, plus the answers the app produced. This is what makes an automation work and what the tool's inbox displays.</li>
  <li>Nothing else is collected: no passwords, no contacts, no data from accounts other than the connected ones.</li>
</ul>
<h2>Where it is stored</h2>
<p>In the operator's own Cloudflare account (Workers, D1 and KV), not in a shared third-party database. Instagram's platform is contacted only to send the replies the account owner configured.</p>
<h2>Deleting it</h2>
<p>The account owner can disconnect an account at any time, which deletes the stored token. A deletion request can also be made through the Data Deletion callback described below.</p>
<p>Data deletion instructions: <a href="/api/legal/data-deletion">/api/legal/data-deletion</a>.</p>`,
            today,
          );
        }

        if (pageName === "terms" || pageName === "terms-of-service") {
          return page(
            "Terms",
            `<h1>Terms</h1>
<p class="meta">By connecting an Instagram account to Content OS you agree to the following.</p>
<ul>
  <li>You may connect only accounts you own or are authorised to manage.</li>
  <li>The tool replies to comments and direct messages on your behalf, only as you configured and only inside the windows Instagram allows.</li>
  <li>You are responsible for what those replies say, and for complying with Instagram's terms and any law that applies to you.</li>
  <li>The software is provided as-is, without warranty. Automated replies can fail — for example when a token expires — and the tool reports those failures rather than hiding them.</li>
  <li>You can disconnect at any time; the stored token is deleted with the connection.</li>
</ul>`,
            today,
          );
        }

        if (pageName === "data-deletion" || pageName === "deletion-status") {
          return page(
            "Data deletion",
            `<h1>Data deletion</h1>
<p>When you remove Content OS from your Instagram account (Instagram → Settings → Apps and websites, or a deletion request from Instagram), this endpoint receives Instagram's signed request and deletes what belongs to that account:</p>
<ul>
  <li>the connection itself and the encrypted access token,</li>
  <li>the stored comments, messages, contacts and automation events for that account.</li>
</ul>
<p>Instagram receives a confirmation code in reply. No other account's data is touched.</p>`,
            today,
          );
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
