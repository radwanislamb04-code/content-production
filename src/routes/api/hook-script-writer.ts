import { createFileRoute } from "@tanstack/react-router";

type IdeaRow = {
  id: string;
  type: string;
  status: string | null;
  content_pillar: string | null;
  title: string;
  content: string | null;
  created_at: number;
  updated_at: number;
};

type ScriptPayload = {
  hooks: string[];
  body: string;
  cta: string;
};

function buildPrompt(title: string, ideaContext: string): string {
  return `You are a short-form video script writer (TikTok / Reels / Shorts). Write a full script for the following content idea.

IDEA TITLE:
${title}

IDEA CONTEXT:
${ideaContext}

Requirements:
- Provide 3 distinct hook variations (each 1 sentence, punchy, <= ~15 words, designed to stop the scroll).
- Provide a body section: the main script the creator will read on camera. Use short punchy lines separated by newlines. Aim for ~20-40 seconds spoken (roughly 60-120 words).
- Provide a single call-to-action (CTA) line at the end.

Return ONLY a JSON object (no prose, no markdown fences) with this exact shape:
{
  "hooks": ["hook variation 1", "hook variation 2", "hook variation 3"],
  "body": "the main script body as a single string with \\n line breaks",
  "cta": "the call to action line"
}`;
}

function extractScript(text: string): ScriptPayload | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") return null;
  const r = parsed as Record<string, unknown>;
  const hooks = Array.isArray(r.hooks)
    ? r.hooks.filter((h): h is string => typeof h === "string")
    : [];
  const body = typeof r.body === "string" ? r.body : "";
  const cta = typeof r.cta === "string" ? r.cta : "";
  if (hooks.length === 0 || !body) return null;
  return { hooks, body, cta };
}

export const Route = createFileRoute("/api/hook-script-writer")({
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
        if (!db) {
          return Response.json({ error: "DB not configured" }, { status: 500 });
        }

        let body: { idea_id?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const ideaId = body.idea_id;
        if (typeof ideaId !== "string" || !ideaId) {
          return Response.json({ error: 'Missing "idea_id"' }, { status: 400 });
        }

        // --- Fetch idea from library ---
        let idea: IdeaRow | null = null;
        try {
          idea = (await db
            .prepare("SELECT * FROM library WHERE id = ?")
            .bind(ideaId)
            .first()) as IdeaRow | null;
        } catch (err: any) {
          return Response.json(
            { error: `Failed to load idea: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        if (!idea) {
          return Response.json({ error: "Idea not found" }, { status: 404 });
        }

        const prompt = buildPrompt(idea.title, idea.content ?? "");

        // --- Call Anthropic-compatible /messages endpoint ---
        const anthropicUrl = `${String(baseUrl).replace(/\/$/, "")}/messages`;
        const requestPayload = {
          model: "auto",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        };
        console.log("[hook-script-writer] POST", anthropicUrl, "payload:", JSON.stringify(requestPayload));

        let res: Response;
        try {
          res = await fetch(anthropicUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(requestPayload),
          });
        } catch (err: any) {
          console.log("[hook-script-writer] fetch threw:", err?.message ?? String(err));
          return Response.json(
            { error: `Failed to reach Anthropic: ${err?.message ?? String(err)}` },
            { status: 502 },
          );
        }

        // Read body as text first so we always have the raw payload for debugging,
        // regardless of status or JSON validity.
        const rawBody = await res.text().catch(() => "");
        const responseHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          responseHeaders[k] = v;
        });
        console.log(
          "[hook-script-writer] response status:",
          res.status,
          "headers:",
          JSON.stringify(responseHeaders),
          "body:",
          rawBody,
        );

        if (!res.ok) {
          return Response.json(
            {
              error: `Anthropic API error: ${res.status}`,
              detail: rawBody,
              headers: responseHeaders,
            },
            { status: 502 },
          );
        }

        let data: { content?: Array<{ type: string; text?: string }> } = {};
        try {
          data = JSON.parse(rawBody) as { content?: Array<{ type: string; text?: string }> };
        } catch (err: any) {
          return Response.json(
            {
              error: "Anthropic response was not valid JSON",
              detail: err?.message ?? String(err),
              rawBody,
              status: res.status,
              headers: responseHeaders,
            },
            { status: 502 },
          );
        }

        const text = (data.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n")
          .trim();

        const script = extractScript(text);
        if (!script) {
          return Response.json(
            {
              error: "Model returned no parseable script",
              raw: text,
              rawBody,
              parsed: data,
              status: res.status,
              headers: responseHeaders,
            },
            { status: 502 },
          );
        }

        // --- Persist to D1 library table as a new script row ---
        const now = Date.now();
        const scriptId = crypto.randomUUID();
        const scriptTitle = `Script: ${idea.title}`;
        const scriptContent = JSON.stringify(script);
        const contentPillar = idea.content_pillar ?? null;

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
            .bind(scriptId, "script", "draft", contentPillar, scriptTitle, scriptContent, now, now)
            .run();
        } catch (err: any) {
          return Response.json(
            { error: `Failed to persist script: ${err?.message ?? String(err)}`, script },
            { status: 500 },
          );
        }

        return Response.json({
          id: scriptId,
          type: "script",
          status: "draft",
          content_pillar: contentPillar,
          title: scriptTitle,
          idea_id: idea.id,
          script,
          created_at: now,
          updated_at: now,
        });
      },
    },
  },
});
