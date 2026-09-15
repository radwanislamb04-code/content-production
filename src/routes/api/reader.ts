import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/reader?url=<https url>
 *
 * Reads a page server-side and returns its readable content, so a site that
 * forbids being framed (X-Frame-Options / CSP frame-ancestors) can still be read
 * inside the app instead of forcing a new tab.
 *
 * What this is NOT: a browser. It fetches the HTML once and extracts text, so a
 * page that renders its content with JavaScript returns nothing readable — the
 * response then says so plainly rather than showing an empty view.
 */

const MAX_BYTES = 400_000; // never buffer a huge document
const MAX_CHARS = 40_000; // cap what we ship to the page
const MAX_PARAGRAPHS = 120;
const TIMEOUT_MS = 12_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 JepyLabs-Reader";

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

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  times: "×",
};

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) && n > 0 && n < 0x110000
        ? String.fromCodePoint(n)
        : "";
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const n = parseInt(dec, 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000
        ? String.fromCodePoint(n)
        : "";
    })
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[String(name).toLowerCase()] ?? m);
}

function toText(html: string): string {
  return decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? toText(m[1] ?? m[2] ?? "") : "";
}

function absolutize(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

const BLOCK = /<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|template)\b[\s\S]*?<\/\1>/gi;

/**
 * Reject dumps that are markup or CSS rather than prose. Google Trends, for
 * example, is a JavaScript app whose HTML carries a big inline stylesheet — the
 * first version of this reader happily rendered "body,html{height:100%…}" as if
 * it were the page text.
 */
/**
 * Pages that render with JavaScript often ship the real text as structured data
 * or inside <noscript>. Pull both out before giving up.
 */
function extractJsonLd(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const data = JSON.parse(m[1].trim());
      const stack: any[] = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node)) {
          stack.push(...node);
          continue;
        }
        for (const key of ["articleBody", "description", "headline", "name"]) {
          const v = node[key];
          if (typeof v === "string" && v.trim().length >= 120) out.push(v.trim());
        }
        for (const v of Object.values(node)) {
          if (v && typeof v === "object") stack.push(v);
        }
      }
    } catch {
      /* malformed JSON-LD — ignore */
    }
  }
  return out;
}

function looksLikeProse(text: string): boolean {
  if (text.length < 200) return false;
  if (/^\s*(body|html|:root|\*|[.#][\w-]+)\s*[,{]/.test(text)) return false;
  const braces = (text.match(/[{};]/g) ?? []).length;
  if (braces > 20) return false;
  const letters = (text.match(/[A-Za-z ]/g) ?? []).length;
  if (letters / text.length < 0.6) return false;
  const words = text.split(/\s+/).filter(Boolean);
  const longWords = words.filter((w) => w.length >= 4).length;
  return longWords / Math.max(words.length, 1) > 0.2;
}

export const Route = createFileRoute("/api/reader")({
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
            { ok: false, error: "Only https pages can be read." },
            { status: 400 },
          );
        }
        if (isBlockedHost(parsed.hostname)) {
          return Response.json(
            { ok: false, error: "That host cannot be read." },
            { status: 400 },
          );
        }

        let html = "";
        let finalUrl = parsed.toString();
        let status = 0;
        try {
          const res = await fetch(parsed.toString(), {
            redirect: "follow",
            headers: {
              "user-agent": UA,
              accept: "text/html,application/xhtml+xml",
              "accept-language": "en-US,en;q=0.9",
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          status = res.status;
          finalUrl = res.url || finalUrl;
          const type = res.headers.get("content-type") ?? "";
          if (!/text\/html|application\/xhtml/i.test(type)) {
            return Response.json({
              ok: false,
              error:
                status === 403 || status === 429
                  ? `The site refused the reader (HTTP ${status}). It blocks automated requests, so its text cannot be read here.`
                  : `The site answered with ${type.split(";")[0] || "an unknown type"} (HTTP ${status}), not a web page, so there is no text to read.`,
              title: "",
              finalUrl,
              status,
            });
          }
          const buf = await res.arrayBuffer();
          html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
        } catch (err: any) {
          const timedOut = err?.name === "TimeoutError";
          return Response.json({
            ok: false,
            error: timedOut
              ? "The site did not respond in time."
              : `Could not fetch the page (${err?.message ?? "network error"}).`,
            finalUrl,
          });
        }

        const title =
          firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
          firstMatch(
            html,
            /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
          ) ||
          parsed.hostname;

        const description =
          firstMatch(
            html,
            /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
          ) ||
          firstMatch(
            html,
            /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
          );

        const body = html
          .replace(BLOCK, " ")
          // Unterminated blocks (truncated or malformed HTML) would otherwise
          // leak their contents into the text.
          .replace(/<style[\s\S]*$/i, " ")
          .replace(/<script[\s\S]*$/i, " ");

        // Structured data and <noscript> alternatives.
        const ldText = extractJsonLd(html);
        const noscriptText = Array.from(
          html.matchAll(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi),
        )
          .map((m) => toText(m[1]))
          .filter((t) => t.length >= 120);

        const headings = Array.from(
          body.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi),
        )
          .map((m) => toText(m[1]))
          .filter((t) => t.length >= 2 && t.length <= 200)
          .slice(0, 40);

        let paragraphs = Array.from(
          body.matchAll(/<(p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi),
        )
          .map((m) => toText(m[2]))
          .filter((t) => t.length >= 25);

        // Some pages put everything in bare <div>s — fall back to the whole text.
        if (paragraphs.length < 3) {
          const flat = toText(body);
          if (looksLikeProse(flat) && flat.length > 1200) {
            paragraphs = [flat.slice(0, 6000)];
          } else {
            const extra = [...noscriptText, ...ldText].filter(Boolean);
            if (extra.length) paragraphs = extra.slice(0, 20);
          }
        }

        const seen = new Set<string>();
        const links: { text: string; href: string }[] = [];
        for (const m of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
          const href = absolutize(m[1], finalUrl);
          const text = toText(m[2]);
          if (!href || !text || text.length > 120) continue;
          if (href.startsWith("javascript:")) continue;
          if (seen.has(href)) continue;
          seen.add(href);
          links.push({ text, href });
          if (links.length >= 60) break;
        }

        let chars = 0;
        const capped: string[] = [];
        let truncated = false;
        for (const p of paragraphs) {
          if (capped.length >= MAX_PARAGRAPHS || chars + p.length > MAX_CHARS) {
            truncated = true;
            break;
          }
          chars += p.length;
          capped.push(p);
        }

        // A "successful" read of 28 characters is worse than an honest failure
        // (Phlanx returned 28, the FB marketplace page 54).
        const totalChars = capped.join("").length;
        if (capped.length === 0 || totalChars < 400) {
          return Response.json({
            ok: false,
            error:
              capped.length === 0
                ? "This page has no text in its HTML — its content is drawn by JavaScript, which this reader cannot run."
                : `Only ${totalChars} characters of text were found on the page, which is not enough to read here.`,
            title,
            finalUrl,
            status,
          });
        }

        return Response.json({
          ok: true,
          url: parsed.toString(),
          finalUrl,
          status,
          title,
          description,
          headings: headings.slice(0, 25),
          paragraphs: capped,
          links: links.slice(0, 40),
          chars,
          truncated,
          fetchedAt: Date.now(),
        });
      },
    },
  },
});
