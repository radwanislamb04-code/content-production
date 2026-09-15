/**
 * Content OS — the `content-scorer` agent, in one place.
 *
 * The scoring prompt, the normaliser and the write-back used to live inside
 * `/api/score-content`. ⑦ of the master plan adds "Score all unscored", and a
 * second copy of a prompt is exactly how two features start disagreeing — so the
 * whole thing moved here and the route is now a thin caller.
 */

import { callAi, extractJson } from "./ai";

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

export type ScoreTarget = {
  id: string;
  type?: string | null;
  title?: string | null;
  content?: string | null;
};

export type ScoreOutcome =
  | { ok: true; analysis: ScoreAnalysis }
  | { ok: false; error: string; raw?: string };

export function buildPrompt(d: { type: string; title: string; content: string }): string {
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

/** Clamp everything into the documented ranges so a wild answer cannot land. */
export function normalize(got: Partial<ScoreAnalysis>): ScoreAnalysis {
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

export function gradeFor(score: number): string {
  if (score >= 9) return "A";
  if (score >= 8) return "A-";
  if (score >= 7) return "B+";
  if (score >= 6) return "B";
  if (score >= 5) return "C+";
  if (score >= 4) return "C";
  return "D";
}

/** Score one item and store the result on its row. */
export async function scoreItem(
  env: any,
  db: any,
  userId: string,
  item: ScoreTarget,
): Promise<ScoreOutcome> {
  const prompt = buildPrompt({
    type: String(item.type ?? ""),
    title: String(item.title ?? ""),
    content:
      typeof item.content === "string"
        ? item.content
        : JSON.stringify(item.content ?? "", null, 2),
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
        { maxTokens: 1200, userId },
      );
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
    const got = extractJson<Partial<ScoreAnalysis>>(text);
    if (got && typeof got.score === "number") {
      analysis = normalize(got);
    }
  }

  if (!analysis) {
    return {
      ok: false,
      error: "The model did not return a usable score.",
      raw: text.slice(0, 1200),
    };
  }

  try {
    await db
      .prepare(
        "UPDATE library SET quality_score = ?, quality_analysis = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .bind(
        Math.round(analysis.score),
        JSON.stringify(analysis),
        Date.now(),
        item.id,
        userId,
      )
      .run();
  } catch (err: any) {
    return { ok: false, error: `Could not save the score: ${err?.message ?? err}` };
  }

  return { ok: true, analysis };
}

/** Items that have never been scored, newest first. */
export async function unscoredItems(
  db: any,
  userId: string,
  limit: number,
  type?: string | null,
): Promise<ScoreTarget[]> {
  const sql = type
    ? `SELECT id, type, title, content FROM library
        WHERE user_id = ? AND COALESCE(quality_score, 0) = 0 AND type = ?
        ORDER BY created_at DESC LIMIT ?`
    : `SELECT id, type, title, content FROM library
        WHERE user_id = ? AND COALESCE(quality_score, 0) = 0
        ORDER BY created_at DESC LIMIT ?`;
  const stmt = type
    ? db.prepare(sql).bind(userId, type, limit)
    : db.prepare(sql).bind(userId, limit);
  const { results } = await stmt.all();
  return (results ?? []) as ScoreTarget[];
}

export async function unscoredCount(
  db: any,
  userId: string,
  type?: string | null,
): Promise<number> {
  try {
    const sql = type
      ? "SELECT COUNT(*) AS n FROM library WHERE user_id = ? AND COALESCE(quality_score, 0) = 0 AND type = ?"
      : "SELECT COUNT(*) AS n FROM library WHERE user_id = ? AND COALESCE(quality_score, 0) = 0";
    const row = await (type ? db.prepare(sql).bind(userId, type) : db.prepare(sql).bind(userId)).first();
    return Number((row as any)?.n ?? 0);
  } catch {
    return 0;
  }
}
