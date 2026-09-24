import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { readAiConfig, anthropicMessagesUrl } from "../../lib/settings";
import { getEnv } from "../../lib/settings";
import { getWorkspaceFor } from "../../lib/workspace";

type Source = "my_posts" | "competitor" | "trend" | "brief";

type Idea = {
  title: string;
  why_it_works: string;
  tags: string[];
  format: string;
};

type PersistedIdea = Idea & {
  id: string;
  content_pillar: string;
};

const CONTENT_PILLARS: Array<{ pillar: string; keywords: string[] }> = [
  { pillar: "education", keywords: ["how", "guide", "tutorial", "learn", "tip", "explain", "step", "beginner"] },
  { pillar: "inspiration", keywords: ["story", "journey", "mindset", "motivation", "inspire", "dream", "vision"] },
  { pillar: "entertainment", keywords: ["funny", "meme", "joke", "reaction", "trend", "viral", "challenge"] },
  { pillar: "promotion", keywords: ["launch", "product", "sale", "offer", "buy", "shop", "discount", "release"] },
  { pillar: "community", keywords: ["question", "poll", "share", "comment", "discuss", "opinion", "you"] },
];

function autoTagPillar(idea: Idea): string {
  const haystack = [idea.title, idea.why_it_works, ...(idea.tags ?? []), idea.format]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let bestPillar = "education";
  let bestScore = 0;
  for (const { pillar, keywords } of CONTENT_PILLARS) {
    const score = keywords.reduce((n, kw) => (haystack.includes(kw) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      bestPillar = pillar;
    }
  }
  return bestPillar;
}

/**
 * The newest stored Daily Brief, whichever day it is for.
 *
 * Briefs live in `workspace` as `brief_YYYY-MM-DD`. Asking the database for the highest key
 * avoids re-deriving "today" in Dhaka here and quietly disagreeing with the pipeline about
 * which day it is. The brief already holds trends and competitor posts *analysed together*,
 * which is exactly what the owner kept asking for instead of clicking through the separate
 * trend and competitor tabs.
 */
async function loadLatestBrief(request: Request, context: any): Promise<any | null> {
  const env = getEnv(request, context);
  const db = env?.DB;
  if (!db) return null;
  try {
    const row = (await db
      .prepare(
        "SELECT key FROM workspace WHERE user_id = ? AND key LIKE 'brief_%' ORDER BY key DESC LIMIT 1",
      )
      .bind(await currentUserId(request, context))
      .first()) as { key?: string } | null;
    if (!row?.key) return null;
    return await getWorkspaceFor<any>(request, context, row.key);
  } catch {
    return null;
  }
}

/** The brief is prose plus signals, not a JSON array — send it as the writer wrote it. */
function briefBlock(sourceData: unknown[]): string {
  const brief = (sourceData?.[0] ?? {}) as Record<string, any>;
  const markdown = String(brief.markdown ?? "").slice(0, 9000);
  const signals = JSON.stringify(brief.context ?? {}, null, 1).slice(0, 4000);
  return [
    `DAILY BRIEF — ${brief.date ?? "latest"}`,
    markdown || "(the brief has no body)",
    "",
    "SIGNALS IT WAS BUILT FROM (trends, competitor posts, the owner's own picks):",
    signals || "(none)",
  ].join("\n");
}

function buildPrompt(source: Source, sourceData: unknown[]): string {
  const sourceLabel =
    source === "my_posts"
      ? "the user's own recent posts"
      : source === "competitor"
      ? "recent posts from a competitor account"
      : source === "brief"
        ? "today's Daily Brief, where their trends, their competitors' recent posts and their own best-performing content have already been analysed together"
        : "current trending topics";

  const dataBlock =
    source === "brief"
      ? briefBlock(sourceData)
      : JSON.stringify(sourceData ?? [], null, 2).slice(0, 12000);

  return `You are a social content ideator. Based on ${sourceLabel} below, generate 4-5 fresh content ideas the user could produce next.

SOURCE DATA (${source}):
${dataBlock}

Return ONLY a JSON array (no prose, no markdown fences) of 4-5 objects with this exact shape:
[
  {
    "title": "short punchy hook (max ~80 chars)",
    "why_it_works": "1-2 sentences explaining the angle and why it will land",
    "tags": ["3-6", "lowercase", "keywords"],
    "format": "one of: reel, carousel, static, story, long-form video, thread"
  }
]`;
}

function extractIdeas(text: string): Idea[] {
  if (!text) return [];
  // Strip common markdown fences if the model added them
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Try direct parse; fall back to slicing the first [...] block
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((raw): Idea | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const title = typeof r.title === "string" ? r.title : "";
      const why_it_works = typeof r.why_it_works === "string" ? r.why_it_works : "";
      const tags = Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [];
      const format = typeof r.format === "string" ? r.format : "";
      if (!title) return null;
      return { title, why_it_works, tags, format };
    })
    .filter((x): x is Idea => x !== null);
}

export const Route = createFileRoute("/api/ideator-generate")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const { apiKey, baseUrl } = await readAiConfig(env, await currentUserId(request, context));
        const db = env?.DB;

        if (!apiKey || !baseUrl) {
          return Response.json(
            {
              error:
                "ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL not configured — add them in Settings → API Keys.",
            },
            { status: 500 },
          );
        }

        let body: { source?: Source; source_data?: unknown[] };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { source, source_data } = body;
        if (
          source !== "my_posts" &&
          source !== "competitor" &&
          source !== "trend" &&
          source !== "brief"
        ) {
          return Response.json(
            {
              error:
                'Missing/invalid "source". Use "my_posts" | "competitor" | "trend" | "brief"',
            },
            { status: 400 },
          );
        }

        // The brief branch reads its own data: the whole point is one click, so the browser
        // sends nothing and is not asked to assemble trends and competitors row by row.
        let sourceData: unknown[];
        if (source === "brief") {
          const brief = await loadLatestBrief(request, context);
          if (!brief) {
            return Response.json(
              {
                error:
                  "No Daily Brief has been saved yet — open Daily Brief and generate one first.",
              },
              { status: 400 },
            );
          }
          sourceData = [brief];
        } else {
          if (!Array.isArray(source_data)) {
            return Response.json(
              { error: '"source_data" must be an array' },
              { status: 400 },
            );
          }
          sourceData = source_data;
        }

        const prompt = buildPrompt(source, sourceData);

        // --- Call Anthropic-compatible /messages endpoint ---
        const anthropicUrl = anthropicMessagesUrl(String(baseUrl));
        let res: Response;
        try {
          res = await fetch(anthropicUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "auto",
              max_tokens: 1024,
              messages: [{ role: "user", content: prompt }],
            }),
          });
        } catch (err: any) {
          return Response.json(
            { error: `Failed to reach Anthropic: ${err?.message ?? String(err)}` },
            { status: 502 },
          );
        }

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          return Response.json(
            { error: `Anthropic API error: ${res.status}`, detail },
            { status: 502 },
          );
        }

        const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
        const text = (data.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n")
          .trim();

        const ideas = extractIdeas(text);
        if (ideas.length === 0) {
          return Response.json(
            { error: "Model returned no parseable ideas", raw: text },
            { status: 502 },
          );
        }

        // --- Persist to D1 library table ---
        const now = Date.now();
        const persisted: PersistedIdea[] = ideas.map((idea) => ({
          ...idea,
          id: crypto.randomUUID(),
          content_pillar: autoTagPillar(idea),
        }));

        if (db) {
          for (const idea of persisted) {
            const content = JSON.stringify({
              why_it_works: idea.why_it_works,
              tags: idea.tags,
              format: idea.format,
              source,
            });
            try {
              await db
                .prepare(
                  `INSERT INTO library (id, type, status, content_pillar, title, content, source_id, created_at, updated_at, user_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     title = excluded.title,
                     content = excluded.content,
                     status = excluded.status,
                     content_pillar = excluded.content_pillar,
                     source_id = excluded.source_id,
                     updated_at = excluded.updated_at`,
                )
                .bind(idea.id, "idea", "draft", idea.content_pillar, idea.title, content, null, now, now,
              await currentUserId(request, context))
                .run();
            } catch {
              // Skip persistence errors per-row; still return the generated ideas
            }
          }
        }

        return Response.json({ ideas: persisted });
      },
    },
  },
});
