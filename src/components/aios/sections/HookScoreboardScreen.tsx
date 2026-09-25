import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Info, ListOrdered, RefreshCw } from "lucide-react";
import { Card, EmptyState, OutlineBtn, Pill } from "../ui";

/**
 * Hook Scoreboard — real hooks and real post numbers.
 *
 * Two lists, both from stored data: the hooks written into your scripts
 * (`library.content.hooks[]`) and your own posts ranked by engagement
 * (`post_performance`). It does not rank hooks against each other, because
 * nothing links a published post to the hook it used — the page says that
 * plainly rather than showing an invented score.
 */

type Published = {
  hook: string;
  caption: string;
  likes: number;
  comments: number;
  engagement: number;
  url: string;
  posted_at: string;
};

type Hook = {
  id: string;
  spoken: string;
  formula: string;
  visual?: string;
  overlay?: string;
  script_id: string;
  script_title: string;
  script_created: number;
};

type Data = {
  ok: boolean;
  scraped_at: number | null;
  published: Published[];
  hooks: Hook[];
  formulas: { formula: string; count: number }[];
  script_count: number;
  caveats: string[];
  error?: string;
};

function ago(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function HookScoreboardScreen() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/hooks");
      const json = (await res.json()) as Data;
      if (!json?.ok) setError(json?.error ?? "Could not load hook data");
      else setData(json);
    } catch (err: any) {
      setError(err?.message ?? "Could not load hook data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const published = data?.published ?? [];
  const hooks = data?.hooks ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hook Scoreboard</h1>
          <p className="mt-0.5 text-sm text-mute">
            Your written hooks, and how your published posts actually did.
          </p>
        </div>
        <OutlineBtn onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </OutlineBtn>
      </div>

      {error && (
        <Card className="flex items-start gap-2 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-err" />
          <span className="text-sm text-err">{error}</span>
        </Card>
      )}

      {data && (
        <Card className="space-y-2 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-mute">
            <Info size={13} /> How to read this
          </div>
          <ul className="space-y-1.5">
            {data.caveats.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm text-mute">
                <span>•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loading && !data ? (
        <Card className="p-6 text-center text-sm text-mute">Loading…</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-wide text-fg2">
                Published posts — ranked by engagement
              </h2>
              <span className="text-[11px] text-mute">scrape {ago(data?.scraped_at ?? null)}</span>
            </div>

            {published.length === 0 ? (
              <EmptyState
                icon={<ListOrdered size={22} />}
                message="No posts of your own are tracked yet. Run the competitor scrape with your handle in Settings → Instagram."
              />
            ) : (
              <Card className="divide-y divide-line">
                {published.map((p, i) => (
                  <div key={`${p.posted_at}-${i}`} className="flex gap-3 p-3">
                    <span className="w-6 shrink-0 text-sm text-mute">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg">
                        {p.hook || "(no caption text)"}
                      </div>
                      <div className="mt-1 text-[11px] text-mute">
                        {p.posted_at || "no date"} · {p.likes} likes · {p.comments} comments
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm text-fg">{p.engagement}</div>
                      <div className="text-[11px] text-mute">eng.</div>
                    </div>
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open the post"
                        className="grid h-10 w-10 shrink-0 place-items-center self-center rounded-md text-mute hover:text-lime"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                ))}
              </Card>
            )}
          </section>

          <section className="min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-wide text-fg2">
                Hooks written — {hooks.length} across {data?.script_count ?? 0} script
                {(data?.script_count ?? 0) === 1 ? "" : "s"}
              </h2>
            </div>

            {(data?.formulas?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2">
                {data!.formulas.slice(0, 8).map((f) => (
                  <Pill key={f.formula}>
                    {f.formula} · {f.count}
                  </Pill>
                ))}
              </div>
            )}

            {hooks.length === 0 ? (
              <EmptyState
                icon={<ListOrdered size={22} />}
                message="No hooks found yet. Write a script — its hooks[] array shows up here."
              />
            ) : (
              <Card className="aios-scroll max-h-[560px] divide-y divide-line overflow-y-auto">
                {hooks.map((h) => (
                  <div key={h.id} className="p-3">
                    <div className="break-words text-sm text-fg">“{h.spoken}”</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-mute">
                      <Pill>{h.formula}</Pill>
                      <span className="truncate">{h.script_title}</span>
                    </div>
                    {h.overlay ? (
                      <div className="mt-1.5 text-[11px] text-mute">on-screen: {h.overlay}</div>
                    ) : null}
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
