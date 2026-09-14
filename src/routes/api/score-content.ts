import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { callAi, extractJson } from "../../lib/ai";
import { getEnv } from "../../lib/settings";

/**
 * POST /api/score-content { id }
 *
 * The `content-scorer` agent from `.claude/agents/content-scorer.md`: rate a
 * library item on a 1-10 scale with a five-part breakdown, then store it in
 * `library.quality_score` + `library.quality_analysis` (columns that already
 * existed from migration 003 — nothing new was needed).
 */

const bodySchema = z.object({ id: z.string().trim().min(1).max(120) });

export type ScoreAnalysis = {
  score: number;
  grade: string;
  breakdown: {
    originality: number;
    engagement_potential: number;
    clarity: number;
    actionability: number;
    trend_alignment: number;
  };
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  recommended_action: "publish" | "revise" | "discard" | string;
  summary: string;
};

export const Route = createFileRoute("/api/score-content")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const db = env?.DB;
        if (!db) {
          return Response.json({ ok: false, error: "D1 is not bound" }, { status: 500 });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "Pass the item id" }, { status: 400 });
        }

        let item: any;
        try {
          item = await db
            .prepare("SELECT id, type, title, content, quality_score FROM library WHERE id = ?")
            .bind(parsed.data.id)
            .first();
        } catch (err: any) {
          return Response.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
        }
        if (!item) {
          return Response.json({ ok: false, error: "Item not found" }, { status: 404 });
        }

        const prompt = buildPrompt({
          type: String(item.type ?? ""),
          title: String(item.title ?? ""),
          content: String(item.content ?? ""),
        });

        let analysis: ScoreAnalysis | null = null;
        let text = "";
        for (let attempt = 1; attempt <= 2 && !analysis; attempt++) {
          try {
            text = await callAi(
              env,
              attempt === 1
                ? prompt
                : `${prompt}\n\nIMPORTANT: reply with the JSON object only — no prose, no code fences.`,
              { maxTokens: 1200 },
            );
          } catch (err: any) {
            return Response.json(
              { ok: false, error: err?.message ?? String(err) },
              { status: 502 },
            );
          }
          const got = extractJson<Partial<ScoreAnalysis>>(text);
          if (got && typeof got.score === "number") {
            analysis = normalize(got);
          }
        }

        if (!analysis) {
          return Response.json(
            {
              ok: false,
              error: "The model did not return a usable score.",
              raw: text.slice(0, 1200),
            },
            { status: 502 },
          );
        }

        try {
          await db
            .prepare(
              "UPDATE library SET quality_score = ?, quality_analysis = ?, updated_at = ? WHERE id = ?",
            )
            .bind(Math.round(analysis.score), JSON.stringify(analysis), Date.now(), parsed.data.id)
            .run();
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `Could not save the score: ${err?.message ?? err}` },
            { status: 500 },
          );
        }

        await logActivity(
          env,
          "content-scorer",
          "scored",
          `${parsed.data.id} · ${analysis.score}/10 (${analysis.recommended_action})`,
        );

        return Response.json({ ok: true, analysis });
      },
    },
  },
});

/** Clamp everything into the documented ranges so a wild answer cannot land. */
function normalize(got: Partial<ScoreAnalysis>): ScoreAnalysis {
  const num = (v: unknown, fallback = 5) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(10, Math.max(1, Math.round(n * 10) / 10));
  };
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 6);

  const score = num(got.score);
  const b = (got.breakdown ?? {}) as Record<string, unknown>;
  const action = String(got.recommended_action ?? "").toLowerCase();

  return {
    score,
    grade: gradeFor(score),
    breakdown: {
      originality: num(b.originality),
      engagement_potential: num(b.engagement_potential),
      clarity: num(b.clarity),
      actionability: num(b.actionability),
      trend_alignment: num(b.trend_alignment),
    },
    strengths: list(got.strengths),
    weaknesses: list(got.weaknesses),
    improvement_suggestions: list(got.improvement_suggestions),
    recommended_action: ["publish", "revise", "discard"].includes(action) ? action : "revise",
    summary: String(got.summary ?? "").slice(0, 600),
  };
}

function gradeFor(score: number): string {
  if (score >= 9) return "A";
  if (score >= 8) return "A-";
  if (score >= 7) return "B+";
  if (score >= 6) return "B";
  if (score >= 5) return "C+";
  if (score >= 4) return "C";
  return "D";
}

function buildPrompt(d: { type: string; title: string; content: string }): string {
  return `You are a ruthless but fair content reviewer for a solo creator's short-form video channel (Instagram Reels / YouTube Shorts, handle @enzorico.ai).

Rate the ${d.type} below and return ONLY JSON:
{"score":8.2,"breakdown":{"originality":8,"engagement_potential":9,"clarity":7,"actionability":8,"trend_alignment":9},"strengths":["..."],"weaknesses":["..."],"improvement_suggestions":["..."],"recommended_action":"publish|revise|discard","summary":"one or two sentences"}

Scoring rules:
- Every number is 1-10 with one decimal at most. "score" is the overall verdict, not an average you round up.
- originality: is this angle already everywhere? engagement_potential: would the first two seconds stop a scroll? clarity: is the payoff obvious? actionability: can it be shot as written? trend_alignment: does it ride something current?
- 3 bullets maximum per list; each under 120 characters; be specific ("the hook states the payoff in 4 words" not "good hook").
- recommended_action: publish if score >= 7.5, revise if 4-7.4, discard below 4.
- Judge only what is written. Never invent facts about the creator.

TITLE: ${d.title || "(none)"}
${d.type.toUpperCase()}
---
${d.content.slice(0, 6000)}
---`;
}
