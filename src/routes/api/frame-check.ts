import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/frame-check?url=<https url>
 *
 * Answers one question: will this site let the browser show it inside a frame?
 *
 * Why this exists: an iframe's `load` event ALSO fires for the browser's own
 * error page, so a blocked site looked like a successful load and the app never
 * showed its "this site refuses to be framed" panel — the owner just saw Chrome's
 * raw "refused to connect" / Google's 403 page. X-Frame-Options and CSP
 * frame-ancestors are exactly what the browser enforces, so reading those headers
 * up front is the reliable signal.
 *
 * Deliberately NOT gated on the response status: many sites answer 403 to a
 * datacenter fetch yet frame perfectly well in a browser.
 */

const TIMEOUT_MS = 6_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 JepyLabs-FrameCheck";

/** Refuse anything that could reach the machine or the private network. */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal"))
    return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function verdict(headers: Headers): { framed: boolean; reason: string | null } {
  const xfo = headers.get("x-frame-options");
  if (xfo) {
    const v = xfo.trim();
    // "ALLOW-FROM uri" is obsolete and ignored by modern browsers; DENY and
    // SAMEORIGIN both stop us (our page is a different origin).
    if (/deny/i.test(v))
      return { framed: false, reason: `X-Frame-Options: ${v}` };
    if (/sameorigin/i.test(v))
      return { framed: false, reason: `X-Frame-Options: ${v}` };
  }
  const csp = headers.get("content-security-policy") ?? "";
  const m = csp.match(/frame-ancestors([^;]*)/i);
  if (m) {
    const value = m[1].trim();
    // 'none' and 'self' both exclude us; a wildcard or our own origin would not,
    // but our origin is never listed, so anything specific is a refusal.
    if (/'none'/i.test(value) || /'self'/i.test(value) || value.length > 0) {
      return { framed: false, reason: `CSP frame-ancestors ${value}` };
    }
  }
  return { framed: true, reason: null };
}

export const Route = createFileRoute("/api/frame-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url") ?? "";
        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return Response.json(
            { ok: false, error: "That is not a valid URL." },
            { status: 400 },
          );
        }
        if (parsed.protocol !== "https:") {
          return Response.json(
            { ok: false, error: "Only https pages can be checked." },
            { status: 400 },
          );
        }
        if (isBlockedHost(parsed.hostname)) {
          return Response.json(
            { ok: false, error: "That host cannot be checked." },
            { status: 400 },
          );
        }

        try {
          const res = await fetch(parsed.toString(), {
            redirect: "follow",
            headers: { "user-agent": UA, accept: "text/html,*/*" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const { framed, reason } = verdict(res.headers);
          return Response.json({
            ok: true,
            url: parsed.toString(),
            finalUrl: res.url || parsed.toString(),
            status: res.status,
            framed,
            reason,
          });
        } catch (err: any) {
          // If we cannot tell, the viewer still attempts the frame — a failed
          // check must never block a site that would have worked.
          return Response.json({
            ok: false,
            url: parsed.toString(),
            framed: null,
            reason: null,
            error:
              err?.name === "TimeoutError"
                ? "The site did not respond in time."
                : `Could not check the site (${err?.message ?? "network error"}).`,
          });
        }
      },
    },
  },
});
