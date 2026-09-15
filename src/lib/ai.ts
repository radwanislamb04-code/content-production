import { OWNER_ID } from "./owner";
import { anthropicMessagesUrl, readAiConfig } from "./settings";

/**
 * Content OS — the single text-AI entry point.
 *
 * Everything that needs the model (brief composition, thumbnail prompts, the
 * content scorer, the calendar planner) goes through here, so the endpoint,
 * headers and response parsing live in exactly one place.
 */

export type AiOptions = {
  maxTokens?: number;
  model?: string;
  /** Ask the model for JSON; the caller still parses defensively. */
  system?: string;
  /** Whose AI keys to spend — the owner unless a signed-in user asked. */
  userId?: string;
};

/** Returns the model's text. Throws with a readable message on failure. */
export async function callAi(
  env: any,
  prompt: string,
  opts: AiOptions = {},
): Promise<string> {
  const { baseUrl, apiKey } = await readAiConfig(env, opts.userId ?? OWNER_ID);
  if (!apiKey || !baseUrl) {
    throw new Error(
      "AI Brain is not configured — add the base URL and API key in Settings → API Keys.",
    );
  }

  const url = anthropicMessagesUrl(baseUrl);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "anthropic-version": "2023-06-01",
  };
  const body = JSON.stringify({
    model: opts.model ?? "auto",
    max_tokens: opts.maxTokens ?? 1024,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  // The endpoint occasionally answers 429/5xx to a single request (we hit a
  // real 502 on the first scoring attempt). One retry turns a transient blip
  // into a success instead of a failed pipeline step.
  let res: Response | null = null;
  let failure = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(url, { method: "POST", headers, body });
      if (r.ok) {
        res = r;
        break;
      }
      const detail = await r.text().catch(() => "");
      failure = `AI error ${r.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`;
      if (r.status !== 429 && r.status < 500) break; // a real client error — do not retry
    } catch (err: any) {
      failure = `Failed to reach the AI endpoint: ${err?.message ?? String(err)}`;
    }
    if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 800));
  }

  if (!res) throw new Error(failure || "The AI endpoint did not respond");

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

/**
 * Pull the first JSON object/array out of a model answer — models love to wrap
 * JSON in prose or ```json fences. Returns null when nothing parses.
 */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];
  for (const raw of candidates) {
    const start = raw.search(/[[{]/);
    if (start === -1) continue;
    const opener = raw[start];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"' && raw[i - 1] !== "\\") inStr = !inStr;
      if (inStr) continue;
      if (ch === opener) depth++;
      else if (ch === closer) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(raw.slice(start, i + 1)) as T;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}
