import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Cross-site guard for /api/*.
//
// Every API route in this app is unauthenticated (it is a personal,
// single-tenant tool), so the only cheap protection available at the Worker
// level is rejecting requests that a BROWSER sent from another site.
// `Sec-Fetch-Site: cross-site` and a mismatched `Origin` are exactly that
// signal, and checking them costs nothing and needs no bindings.
//
// LIMITS — read this before relying on it:
//   * This is NOT authentication. curl sends neither header, so a script that
//     knows the Worker URL still reaches these endpoints — including
//     /api/generate-image, which spends Workers AI quota and VyceAI credits.
//   * The real fix is Cloudflare Access (Zero Trust) in front of the Worker,
//     plus WAF rate-limiting rules on the costly endpoints. Do both.
const API_PREFIX = "/api/";

function isCrossSiteRequest(request: Request, url: URL): boolean {
  if (!url.pathname.startsWith(API_PREFIX)) return false;

  if (request.headers.get("sec-fetch-site") === "cross-site") return true;

  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return true;

  return false;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (isCrossSiteRequest(request, new URL(request.url))) {
        return new Response(
          JSON.stringify({ error: "Cross-site requests to the API are not allowed." }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
