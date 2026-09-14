import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, RefreshCw, Send } from "lucide-react";
import { Card, OutlineBtn, PrimaryBtn } from "../ui";

/**
 * Daily Brief — reads the real brief from `workspace` (`brief_YYYY-MM-DD`),
 * written by the pipeline at 08:00 and 20:00 Asia/Dhaka. Nothing on this page
 * is a mock: if no brief exists yet, it says so and offers to build one.
 */

import { type Brief, clock, parseBrief } from "../brief-view";

type BriefResponse = {
  ok: boolean;
  date: string;
  today: string;
  brief: Brief | null;
  history: { date: string; updated_at: number; preview?: string }[];
  error?: string;
};

export function DailyBriefScreen() {
  const [tab, setTab] = useState<"today" | "history">("today");
  const [data, setData] = useState<BriefResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (date?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(date ? `/api/brief?date=${date}` : "/api/brief");
      const json = (await res.json()) as BriefResponse;
      if (!json?.ok) setError(json?.error ?? "Could not load the brief");
      else setData(json);
    } catch (err: any) {
      setError(err?.message ?? "Could not load the brief");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  const generate = useCallback(async () => {
    setBusy("generate");
    setError(null);
    try {
      const res = await fetch("/api/brief", { method: "POST" });
      const json = await res.json();
      if (!json?.ok) setError(json?.error ?? "Brief generation failed");
      await load(null);
    } catch (err: any) {
      setError(err?.message ?? "Brief generation failed");
    } finally {
      setBusy(null);
    }
  }, [load]);

  const send = useCallback(async () => {
    setBusy("send");
    setError(null);
    try {
      const res = await fetch("/api/run-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: ["send"] }),
      });
      const json = await res.json();
      const step = (json?.steps ?? []).find((s: any) => s.step === "send");
      if (!step?.ok) setError(step?.detail ?? json?.error ?? "Could not send to Telegram");
    } catch (err: any) {
      setError(err?.message ?? "Could not send to Telegram");
    } finally {
      setBusy(null);
    }
  }, []);

  const copy = useCallback(async () => {
    const text = data?.brief?.markdown ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy — select the text manually.");
    }
  }, [data]);

  const brief = data?.brief ?? null;
  const parsed = brief ? parseBrief(brief.markdown) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daily Brief</h1>
          <p className="mt-0.5 text-sm text-muted">
            Built automatically at 08:00 and 20:00 (Asia/Dhaka) and sent to Telegram.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OutlineBtn onClick={() => load(selected)} disabled={loading}>
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
          <OutlineBtn onClick={send} disabled={!brief || busy !== null}>
            {busy === "send" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send to Telegram
          </OutlineBtn>
          <PrimaryBtn onClick={generate} disabled={busy !== null}>
            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy === "generate" ? "Generating…" : "Generate now"}
          </PrimaryBtn>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["today", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize transition-colors ${
              tab === t ? "border-lime text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <Card className="flex items-start gap-2 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-err" />
          <span className="text-sm text-err">{error}</span>
        </Card>
      )}

      {tab === "today" && (
        <>
          {loading && !brief ? (
            <Card className="p-6 text-center text-sm text-muted">Loading…</Card>
          ) : !brief ? (
            <Card className="p-6 text-center">
              <p className="text-sm font-medium">No brief yet</p>
              <p className="mt-1 text-sm text-muted">
                The next one arrives automatically at 08:00 or 20:00 (Asia/Dhaka) — or press{" "}
                <em>Generate now</em> to build it right away.
              </p>
            </Card>
          ) : (
            <>
              <Card className="px-4 py-3 text-xs text-muted">
                {brief.date} · generated {clock(brief.generated_at)}
              </Card>

              {parsed?.intro.length ? (
                <Card className="p-4 text-sm">{parsed.intro.join(" ")}</Card>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-2">
                {(parsed?.sections ?? []).map((s) => (
                  <Card key={s.title} className="p-4">
                    <div className="mb-2 text-xs uppercase tracking-wide text-muted">{s.title}</div>
                    {s.items.length === 0 ? (
                      <p className="text-sm text-muted">No data yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {s.items.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-muted">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "history" && (
        <Card className="overflow-hidden">
          {(data?.history ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              No briefs have been generated yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {(data?.history ?? []).map((h) => (
                  <tr
                    key={h.date}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-cardhi"
                    onClick={() => {
                      setSelected(h.date);
                      setTab("today");
                      load(h.date);
                    }}
                  >
                    <td className="px-4 py-2.5">{h.date}</td>
                    <td className="max-w-[420px] truncate px-4 py-2.5 text-muted">
                      {h.preview ?? ""}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted">{clock(h.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {selected && tab === "today" && (
        <div className="text-xs text-muted">
          Viewing {selected}{" "}
          <button
            className="underline"
            onClick={() => {
              setSelected(null);
              load(null);
            }}
          >
            back to today
          </button>
        </div>
      )}
    </div>
  );
}
