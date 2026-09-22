/**
 * Content OS — the public legal pages.
 *
 * Meta asks for a privacy policy URL and a data-deletion callback before an app can be
 * used by anyone but its own developer. Rather than the owner inventing them (or pasting
 * someone else's template), they are served from this Worker and describe what this app
 * actually does — which is the only honest version of a privacy policy.
 *
 * They are also the only public pages in Content OS: everything else is behind Cloudflare
 * Access, so these paths get their own path-scoped bypass policy.
 *
 * The bodies live here, not in the route, because there is now more than one route serving
 * them: `/privacy` (the clean URL a Meta form wants) and `/api/legal/privacy`. Two copies
 * of a privacy policy is two policies, and one of them would end up wrong.
 */

export const LEGAL_STYLE = `
  :root { color-scheme: dark }
  body { margin:0; background:#0b0d0c; color:#e8ece9; font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }
  main { max-width:44rem; margin:0 auto; padding:3rem 1.25rem 5rem }
  h1 { font-size:1.6rem; margin:0 0 .25rem } h2 { font-size:1.05rem; margin:2rem 0 .5rem; color:#c9f7c0 }
  p, li { color:#b9c2bc } a { color:#7dff5a } code { background:#141815; padding:.1rem .3rem; border-radius:4px; color:#d8e6dd }
  .meta { color:#7b857e; font-size:.85rem }
  ul { padding-left:1.1rem }
`;

export function legalHtml(title: string, body: string, updated: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Content OS</title><style>${LEGAL_STYLE}</style></head>
<body><main>${body}<p class="meta">Last updated: ${updated}.</p></main></body></html>`;
}

export function legalResponse(title: string, body: string, updated: string): Response {
  return new Response(legalHtml(title, body, updated), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const PRIVACY_BODY = `<h1>Privacy</h1>
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
<p>Data deletion instructions: <a href="/api/legal/data-deletion">/api/legal/data-deletion</a>.</p>`;

export const TERMS_BODY = `<h1>Terms</h1>
<p class="meta">By connecting an Instagram account to Content OS you agree to the following.</p>
<ul>
  <li>You may connect only accounts you own or are authorised to manage.</li>
  <li>The tool replies to comments and direct messages on your behalf, only as you configured and only inside the windows Instagram allows.</li>
  <li>You are responsible for what those replies say, and for complying with Instagram's terms and any law that applies to you.</li>
  <li>The software is provided as-is, without warranty. Automated replies can fail — for example when a token expires — and the tool reports those failures rather than hiding them.</li>
  <li>You can disconnect at any time; the stored token is deleted with the connection.</li>
</ul>`;

export const DATA_DELETION_BODY = `<h1>Data deletion</h1>
<p>When you remove Content OS from your Instagram account (Instagram → Settings → Apps and websites, or a deletion request from Instagram), this endpoint receives Instagram's signed request and deletes what belongs to that account:</p>
<ul>
  <li>the connection itself and the encrypted access token,</li>
  <li>the stored comments, messages, contacts and automation events for that account.</li>
</ul>
<p>Instagram receives a confirmation code in reply. No other account's data is touched.</p>`;

export const today = () => new Date().toISOString().slice(0, 10);
