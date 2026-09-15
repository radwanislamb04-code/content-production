import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Copy, Check, History, Loader2, RefreshCw } from "lucide-react";
import { BriefBody, type Brief, briefPreview, clock } from "../brief-view";
import { Card, EmptyState, OutlineBtn } from "../ui";

/**
 * Brief History — the archive of every brief the pipeline has stored under
 * `workspace.brief_YYYY-MM-DD`. No mock rows: if only one brief exists, the
 * list shows exactly that one.
 */

type Index = {
  ok: boolean;
  date: string;
  today: string;
  brief: Brief | null;
  history: { date: string; updated_at: number; preview?: string }[];
  error?: string;
};

export function BriefHistoryScreen() {
  const [index, setIndex] = useState<Index | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadIndex = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/brief");
      const json = (await res.json()) as Index;
      if (!json?.ok) {
        setError(json?.error ?? "Could not load the brief archive");
      } else {
        setIndex(json);
        // Default to the newest archived brief.
        const newest = json.history?.[0]?.date ?? null;
        setSelected((prev) => prev ?? newest);
      }
    } catch (err: any) {
      setError(err?.message ?? "Could not load the brief archive");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  const open = useCallback(async (date: string) => {
    setSelected(date);
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/brief?date=${date}`);
      const json = (await res.json()) as Index;
      if (!json?.ok) setError(json?.error ?? "Could not open that brief");
      else setBrief(json.brief);
    } catch (err: any) {
      setError(err?.message ?? "Could not open that brief");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (selected) open(selected);
  }, [selected, open]);

  const copy = useCallback(async () => {
    if (!brief?.markdown) return;
    try {
      await navigator.clipboard.writeText(brief.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy — select the text manually.");
    }
  }, [brief]);

  const rows = index?.history ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brief History</h1>
          <p className="mt-0.5 text-sm text-mute">
            Every brief the pipeline has saved — the last {rows.length || 0}{" "}
            {rows.length === 1 ? "day" : "days"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OutlineBtn onClick={loadIndex} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </OutlineBtn>
          <OutlineBtn onClick={copy} disabled={!brief}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </OutlineBtn>
        </div>
      </div>

      {error && (
        <Card className="flex items-start gap-2 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-err" />
          <span className="text-sm text-err">{error}</span>
        </Card>
      )}

      {loading && !index ? (
        <Card className="p-6 text-center text-sm text-mute">Loading…</Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<History size={22} />}
          message="No briefs saved yet. The pipeline writes one at 08:00 and 20:00 (Asia/Dhaka)."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="max-h-[70vh] overflow-y-auto p-2">
            {rows.map((h) => (
              <button
                key={h.date}
                onClick={() => setSelected(h.date)}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                  selected === h.date ? "bg-cardhi" : "hover:bg-cardhi"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg">{h.date}</span>
                  <span className="shrink-0 text-[11px] text-mute">{clock(h.updated_at)}</span>
                </div>
                {h.preview ? (
                  <div className="mt-1 line-clamp-2 text-[11px] text-mute">{h.preview}</div>
                ) : null}
              </button>
            ))}
          </Card>

          <div className="space-y-3">
            {busy ? (
              <Card className="p-6 text-center text-sm text-mute">Loading…</Card>
            ) : !brief ? (
              <Card className="p-6 text-center">
                <p className="text-sm font-medium">Nothing stored for {selected}</p>
                <p className="mt-1 text-sm text-mute">
                  The index lists this date but the brief itself could not be read.
                </p>
              </Card>
            ) : (
              <>
                <Card className="px-4 py-3 text-xs text-mute">
                  {brief.date} · generated {clock(brief.generated_at)}
                  {selected === index?.today ? " · today" : ""}
                </Card>
                <BriefBody brief={brief} />
                {brief.markdown ? null : (
                  <Card className="p-4 text-sm text-mute">This brief has no body text.</Card>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {rows.length > 0 && (index?.history?.[0]?.preview ?? "") === "" ? (
        <p className="text-[11px] text-mute">
          Previews appear once a brief contains readable text.
        </p>
      ) : null}
    </div>
  );
}

/** Kept for the search route's snippet helper to stay in one place. */
export { briefPreview };
