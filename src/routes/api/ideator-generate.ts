import { createFileRoute } from "@tanstack/react-router";

type Source = "my_posts" | "competitor" | "trend";

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

function buildPrompt(source: Source, sourceData: unknown[]): string {
  const sourceLabel =
    source === "my_posts"
      ? "the user's own recent posts"
      : source === "competitor"
      ? "recent posts from a competitor account"
      : "current trending topics";

  const dataBlock = JSON.stringify(sourceData ?? [], null, 2).slice(0, 12000);

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
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;
        const apiKey = env?.ANTHROPIC_API_KEY;
        const baseUrl = env?.ANTHROPIC_BASE_URL;
        const db = env?.DB;

        if (!apiKey || !baseUrl) {
          return Response.json(
            { error: "ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL not configured" },
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
        if (source !== "my_posts" && source !== "competitor" && source !== "trend") {
          return Response.json(
            { error: 'Missing/invalid "source". Use "my_posts" | "competitor" | "trend"' },
            { status: 400 },
          );
        }
        if (!Array.isArray(source_data)) {
          return Response.json(
            { error: '"source_data" must be an array' },
            { status: 400 },
          );
        }

        const prompt = buildPrompt(source, source_data);

        // --- Call Anthropic-compatible /messages endpoint ---
        const anthropicUrl = `${String(baseUrl).replace(/\/$/, "")}/messages`;
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
                  `INSERT INTO library (id, type, status, content_pillar, title, content, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     title = excluded.title,
                     content = excluded.content,
                     status = excluded.status,
                     content_pillar = excluded.content_pillar,
                     updated_at = excluded.updated_at`,
                )
                .bind(idea.id, "idea", "draft", idea.content_pillar, idea.title, content, now, now)
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
