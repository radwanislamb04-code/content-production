import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Card, OutlineBtn, PrimaryBtn, Select } from "../ui";

/**
 * Content Score — the `content-scorer` agent's verdict on a real library item.
 *
 * Nothing is pre-filled: an item shows "not scored yet" until you score it, and
 * the result is stored on the row (`quality_score`, `quality_analysis`) so it
 * survives reloads and can be sorted by in the Library.
 */

type Item = {
  id: string;
  type: string;
  title: string;
  content: string;
  quality_score: number | null;
  quality_analysis: string | null;
  created_at: number;
};

type Analysis = {
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
  recommended_action: string;
  summary: string;
};

const SUBSCORES: [keyof Analysis["breakdown"], string][] = [
  ["originality", "Originality"],
  ["engagement_potential", "Engagement potential"],
  ["clarity", "Clarity"],
  ["actionability", "Actionability"],
  ["trend_alignment", "Trend alignment"],
];

const ACTION_STYLES: Record<string, string> = {
  publish: "border-lime text-lime",
  revise: "border-warn text-warn",
  discard: "border-err text-err",
};

function parseAnalysis(raw: string | null): Analysis | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Analysis;
    return parsed && typeof parsed.score === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function ContentScore() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const types = ["script", "idea", "storyboard", "video_prompt"];
      const res = await Promise.all(
        types.map((t) => apiFetch(`/api/library/${t}`).then((r) => r.json())),
      );
      const merged: Item[] = res
        .flatMap((r) => (Array.isArray(r) ? r : []))
        .sort((a: Item, b: Item) => (b.created_at ?? 0) - (a.created_at ?? 0));
      setItems(merged);
      setSelectedId((prev) => prev || merged[0]?.id || "");
    } catch (err: any) {
      setError(err?.message ?? "Could not load your library");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );
  const analysis = useMemo(() => parseAnalysis(selected?.quality_analysis ?? null), [selected]);

  const score = useCallback(async () => {
    if (!selected) return;
    setScoring(true);
    setError(null);
    try {
      const res = await apiFetch("/api/score-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? "Scoring failed");
        return;
      }
      const fresh = json.analysis as Analysis;
      setItems((prev) =>
        prev.map((i) =>
          i.id === selected.id
            ? {
                ...i,
                quality_score: Math.round(fresh.score),
                quality_analysis: JSON.stringify(fresh),
              }
            : i,
        ),
      );
    } catch (err: any) {
      setError(err?.message ?? "Scoring failed");
    } finally {
      setScoring(false);
    }
  }, [selected]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content Score</h1>
          <p className="mt-0.5 text-sm text-mute">
            A 1-10 verdict with a five-part breakdown, scored by the AI and saved on the item.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedId}
            onChange={(e: any) => setSelectedId(e.target.value)}
            className="max-w-[280px]"
          >
            {items.length === 0 && <option value="">No content yet</option>}
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.type}: {i.title.slice(0, 48)}
              </option>
            ))}
          </Select>
          <PrimaryBtn onClick={score} disabled={!selected || scoring}>
            {scoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {scoring ? "Scoring…" : analysis ? "Re-score" : "Score this content"}
          </PrimaryBtn>
        </div>
      </div>

      {error && (
        <Card className="flex items-start gap-2 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-err" />
          <span className="text-sm text-err">{error}</span>
        </Card>
      )}

      {loading ? (
        <Card className="p-6 text-center text-sm text-mute">Loading…</Card>
      ) : !selected ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Nothing to score yet</p>
          <p className="mt-1 text-sm text-mute">
            Generate an idea or script first — it will show up here.
          </p>
        </Card>
      ) : !analysis ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Not scored yet</p>
          <p className="mt-1 text-sm text-mute">
            Press <em>Score this content</em> to get a verdict, sub-scores and specific fixes for “
            {selected.title.slice(0, 60)}”.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
            <Card className="flex flex-col items-center justify-center p-6">
              <div className="text-5xl font-semibold tracking-tight">
                {analysis.score.toFixed(1)}
                <span className="text-xl text-mute">/10</span>
              </div>
              <div className="mt-2 text-sm text-mute">Grade {analysis.grade}</div>
              <span
                className={`mt-3 rounded-full border px-3 py-1 text-xs capitalize ${
                  ACTION_STYLES[analysis.recommended_action] ?? "border-line text-fg2"
                }`}
              >
                {analysis.recommended_action}
              </span>
            </Card>

            <Card className="p-5">
              <div className="mb-3 text-xs uppercase tracking-wide text-mute">Breakdown</div>
              <div className="space-y-3">
                {SUBSCORES.map(([key, label]) => {
                  const value = Number(analysis.breakdown?.[key] ?? 0);
                  return (
                    <div key={key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{label}</span>
                        <span className="text-mute">{value.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-cardhi">
                        <div
                          className="h-full rounded-full bg-lime"
                          style={{ width: `${Math.min(100, value * 10)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {analysis.summary && <p className="mt-4 text-sm text-mute">{analysis.summary}</p>}
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {(
              [
                ["Strengths", analysis.strengths, "text-lime"],
                ["Weaknesses", analysis.weaknesses, "text-err"],
                ["Suggestions", analysis.improvement_suggestions, "text-warn"],
              ] as const
            ).map(([title, list, tone]) => (
              <Card key={title} className="p-4">
                <div className={`mb-2 text-xs uppercase tracking-wide ${tone}`}>{title}</div>
                {list.length === 0 ? (
                  <p className="text-sm text-mute">None given.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-mute">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>

          <div className="text-xs text-mute">
            Scored item: {selected.type} · {selected.title.slice(0, 70)}
          </div>
        </>
      )}
    </div>
  );
}
