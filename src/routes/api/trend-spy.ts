import { createFileRoute } from "@tanstack/react-router";

type TrendItem = { title: string; metric: string; source: string };

type Insight = {
  headline: string;
  why_trending: string;
  suggested_angle: string;
  confidence: "high" | "medium" | "low";
  supporting_metric: string;
};

const CACHE_TTL = 21600; // 6 hours

export const Route = createFileRoute("/api/trend-spy")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = (request as any)?.runtime?.cloudflare?.env ?? (context as any).cloudflare?.env;
        const apiKey = env?.ANTHROPIC_API_KEY;
        const baseUrl = env?.ANTHROPIC_BASE_URL;
        const kv = env?.KV;

        if (!apiKey || !baseUrl) {
          return Response.json(
            { error: "ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL not configured" },
            { status: 500 },
          );
        }
        if (!kv) {
          return Response.json({ error: "KV not configured" }, { status: 500 });
        }

        let body: { category?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const category = body.category;
        if (typeof category !== "string" || !category) {
          return Response.json({ error: 'Missing "category"' }, { status: 400 });
        }

        // --- Try cache first (keyed by category) ---
        const cacheKey = `trend-spy:${category}`;
        try {
          const cached = await kv.get(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            return Response.json({ category, insights: parsed.insights });
          }
        } catch {
          // KV read failed — fall through to compute
        }

        // --- Fetch raw trend data from trends.ts's KV cache ---
        // trends.ts caches at `trends:google` and `trends:youtube`
        let rawTrends: TrendItem[] = [];

        try {
          // Try category-specific key first (in case trends.ts was called with that platform)
          const categoryCached = await kv.get(`trends:${category}`);
          if (categoryCached) {
            rawTrends = JSON.parse(categoryCached);
          } else {
            // Fall back to both default platforms and merge
            const [googleCached, youtubeCached] = await Promise.all([
              kv.get("trends:google"),
              kv.get("trends:youtube"),
            ]);
            if (googleCached) {
              rawTrends.push(...JSON.parse(googleCached));
            }
            if (youtubeCached) {
              rawTrends.push(...JSON.parse(youtubeCached));
            }
          }
        } catch {
          // KV read failed — continue with empty trends (will produce generic insights)
        }

        if (rawTrends.length === 0) {
          rawTrends = [{ title: "No trend data available", metric: "", source: "none" }];
        }

        // --- Build system prompt for trend analysis ---
        const systemPrompt = `You are a trend analyst specializing in identifying thematic pattern-level insights from raw social media and search trend data. Your job is to CLUSTER individual trend items (videos, searches, topics) into broader PATTERNS — not to list individual items.

## Analysis Rules

1. **Cluster, don't list:** Group 3+ related trend items into a single pattern insight. Example: "AI video generation tools", "Runway Gen-3 viral clips", "Kling AI character consistency" → ONE insight: "AI video generation tools going mainstream".

2. **Pattern-level only:** Each insight must identify a trend PATTERN (a recurring theme, format, or technology wave), not a single video/search result.

3. **Required fields per insight:**
   - headline: Short, punchy name for the pattern (e.g., "Faceless AI history channels exploding")
   - why_trending: 1-2 sentences explaining the underlying driver (platform algo shift, new tool release, cultural moment, etc.)
   - suggested_angle: Concrete content angle a creator could execute THIS WEEK (e.g., "Make a 'I tried 5 AI video tools in 1 hour' comparison Reel")
   - confidence: "high" | "medium" | "low" — based on data volume, cross-platform presence, velocity signals
   - supporting_metric: ONE specific data point from the raw trends that backs this (e.g., "3 of top 10 YouTube trending are AI video tutorials; 'Runway Gen-3' search volume +340%")

4. **Output 3-5 insights max.** Prioritize high-confidence, actionable patterns.

5. **Be specific, not generic.** "AI is popular" is useless. "Faceless AI history channels using Midjourney + ElevenLabs hitting 1M+ views" is useful.

## Input Data

You will receive raw trend items in this format:
\`\`\`json
[{"title": "...", "metric": "...", "source": "google|youtube"}, ...]
\`\`\`

IMPORTANT: You MUST respond with ONLY valid JSON in this exact structure: {"insights": [{"headline": string, "why_trending": string, "suggested_angle": string, "confidence": "high"|"medium"|"low", "supporting_metric": string}]}. No markdown headers, no prose, no extra sections.`;

        const userPrompt = `Category: ${category}\n\nRaw trend data:\n${JSON.stringify(rawTrends, null, 2)}\n\nAnalyze and cluster into thematic pattern-level insights.`;

        const anthropicUrl = `${String(baseUrl).replace(/\/$/, "")}/messages`;
        const requestPayload = {
          model: "auto",
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        };

        const maxAttempts = 3;
        const triedModels: string[] = [];
        let insights: Insight[] = [];
        let lastError: string | null = null;
        let lastRawBody: string = "";

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          let res: Response;
          try {
            res = await fetch(anthropicUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
              },
              body: JSON.stringify(requestPayload),
            });
          } catch (err: any) {
            lastError = `Failed to reach Anthropic: ${err?.message ?? String(err)}`;
            continue;
          }

          if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            lastError = `Anthropic API error: ${res.status} - ${errorText}`;
            continue;
          }

          const rawBody = await res.text();
          lastRawBody = rawBody;

          let data: { content?: Array<{ type: string; text?: string }>; model?: string } = {};
          try {
            data = JSON.parse(rawBody) as { content?: Array<{ type: string; text?: string }>; model?: string };
          } catch (err: any) {
            lastError = `Invalid JSON response: ${err?.message ?? String(err)}`;
            continue;
          }

          const modelUsed = res.headers.get("anthropic-model") ?? data.model ?? "unknown";
          triedModels.push(modelUsed);

          let extractedText = "";
          try {
            extractedText = (data.content ?? [])
              .filter((b) => b.type === "text")
              .map((b) => b.text ?? "")
              .join("\n")
              .trim();
          } catch {
            // ignore
          }

          try {
            // Fenced-JSON scan for the insights array
            const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
            const candidates: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = fenceRegex.exec(extractedText)) !== null) {
              candidates.push(m[1]);
            }
            const firstOpen = extractedText.indexOf("{");
            const lastClose = extractedText.lastIndexOf("}");
            if (firstOpen !== -1 && lastClose > firstOpen) {
              candidates.push(extractedText.slice(firstOpen, lastClose + 1));
            }

            for (const candidate of candidates) {
              const cleaned = candidate.trim();
              if (!cleaned) continue;
              let parsed: unknown;
              try {
                parsed = JSON.parse(cleaned);
              } catch {
                continue;
              }
              if (!parsed || typeof parsed !== "object") continue;
              const r = parsed as Record<string, unknown>;
              if (Array.isArray(r.insights)) {
                const parsedInsights = (r.insights as unknown[]).map((i): Insight | null => {
                  if (!i || typeof i !== "object") return null;
                  const item = i as Record<string, unknown>;
                  const headline = typeof item.headline === "string" ? item.headline : "";
                  const why_trending = typeof item.why_trending === "string" ? item.why_trending : "";
                  const suggested_angle = typeof item.suggested_angle === "string" ? item.suggested_angle : "";
                  const confidence = item.confidence === "high" || item.confidence === "medium" || item.confidence === "low"
                    ? item.confidence
                    : "medium";
                  const supporting_metric = typeof item.supporting_metric === "string" ? item.supporting_metric : "";
                  if (!headline || !why_trending || !suggested_angle || !supporting_metric) return null;
                  return { headline, why_trending, suggested_angle, confidence, supporting_metric };
                }).filter((i): i is Insight => i !== null);
                if (parsedInsights.length > 0) {
                  insights = parsedInsights;
                  break;
                }
              }
            }
          } catch (parseErr: any) {
            lastError = parseErr?.message ?? String(parseErr);
            continue;
          }

          if (insights.length > 0) {
            break; // Success
          } else {
            lastError = "Failed to parse insights from model response (no valid insights array)";
          }
        }

        if (insights.length === 0) {
          return Response.json(
            {
              error: "Failed to generate trend insights after 3 attempts",
              message: lastError,
              triedModels,
              raw: lastRawBody,
            },
            { status: 502 },
          );
        }

        // --- Cache the result in KV (6hr TTL) ---
        try {
          await kv.put(cacheKey, JSON.stringify({ insights }), { expirationTtl: CACHE_TTL });
        } catch {
          // KV write failed — continue without caching
        }

        return Response.json({ category, insights });
      },
    },
  },
});