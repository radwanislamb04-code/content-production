import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Heart, Loader2, MessageCircle, RefreshCw, Users } from "lucide-react";
import { Card, OutlineBtn } from "../ui";

/**
 * Performance — real numbers from `post_performance`.
 *
 * There is deliberately no "engagement rate": that needs follower counts the
 * scraper does not return. Everything shown is per-post arithmetic on stored
 * rows, and the window is labelled so the numbers cannot be mistaken for
 * all-time totals.
 */

type Bucket = {
  posts: number;
  likes: number;
  comments: number;
  avg_likes: number;
  avg_comments: number;
};

type HandleRow = Bucket & { handle: string; is_own: boolean };

type PostRow = {
  handle: string;
  is_own: boolean;
  caption: string;
  likes: number;
  comments: number;
  url: string;
  posted_at: string;
};

type Data = {
  ok: boolean;
  days: number | null;
  scraped_at: number | null;
  own: Bucket;
  competitors: Bucket;
  handles: HandleRow[];
  top: PostRow[];
  best_hours: { hour: number; posts: number; avg_likes: number }[];
  observations: string[];
  error?: string;
};

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function ago(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function Analyst() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/post-performance");
      const json = (await res.json()) as Data;
      if (!json?.ok) {
        setError(json?.error ?? "Could not load performance data");
      } else {
        setData(json);
      }
    } catch (err: any) {
      setError(err?.message ?? "Could not load performance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const empty = !loading && (!data || data.handles.length === 0);

  const stats = data
    ? [
        {
          icon: Heart,
          label: "Your avg likes / post",
          value: fmt(data.own.avg_likes),
          hint: `${data.own.posts} post(s) tracked`,
        },
        {
          icon: MessageCircle,
          label: "Your avg comments / post",
          value: fmt(data.own.avg_comments),
          hint: `${fmt(data.own.comments)} total`,
        },
        {
          icon: Users,
          label: "Competitor avg likes / post",
          value: fmt(data.competitors.avg_likes),
          hint: `${data.competitors.posts} post(s) tracked`,
        },
        {
          icon: RefreshCw,
          label: "Data as of",
          value: ago(data.scraped_at),
          hint: "from the latest scrape",
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
          <p className="mt-0.5 text-sm text-mute">
            Per-post averages from the last scrape — no engagement rate, because
            follower counts are not available.
          </p>
        </div>
        <OutlineBtn onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh Analysis
        </OutlineBtn>
      </div>

      {error && (
        <Card className="flex items-start gap-2 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-err" />
          <span className="text-sm text-err">{error}</span>
        </Card>
      )}

      {empty && !error && (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">No performance data yet</p>
          <p className="mt-1 text-sm text-mute">
            Add your handle and competitors in Settings → Instagram, then run the
            scraper from Sources (or the AutoPilot page).
          </p>
        </Card>
      )}

      {data && data.handles.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label} className="p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-mute">
                    <Icon className="h-3.5 w-3.5" />
                    {s.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{s.value}</div>
                  <div className="mt-0.5 text-xs text-mute">{s.hint}</div>
                </Card>
              );
            })}
          </div>

          {data.observations.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-mute">
                Observations
              </div>
              <ul className="space-y-1.5">
                {data.observations.map((o, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-mute">•</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-mute">
              Top posts by likes
            </div>
            <table className="w-full text-sm">
              <tbody>
                {data.top.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="w-32 px-4 py-2.5 align-top">
                      <span className="text-xs">
                        @{p.handle}
                        {p.is_own && (
                          <span className="ml-1 text-lime">(you)</span>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 align-top text-mute">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {p.caption.slice(0, 90) || "(no caption)"}
                        </a>
                      ) : (
                        p.caption.slice(0, 90) || "(no caption)"
                      )}
                    </td>
                    <td className="w-20 px-2 py-2.5 text-right align-top">
                      {fmt(p.likes)}
                    </td>
                    <td className="w-20 px-4 py-2.5 text-right align-top text-mute">
                      {fmt(p.comments)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-mute">
              Accounts tracked
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-mute">
                  <th className="px-4 py-2 font-normal">Handle</th>
                  <th className="px-2 py-2 text-right font-normal">Posts</th>
                  <th className="px-2 py-2 text-right font-normal">Avg likes</th>
                  <th className="px-4 py-2 text-right font-normal">Avg comments</th>
                </tr>
              </thead>
              <tbody>
                {data.handles.map((h) => (
                  <tr key={h.handle} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      @{h.handle}
                      {h.is_own && <span className="ml-1 text-lime">(you)</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right">{h.posts}</td>
                    <td className="px-2 py-2.5 text-right">{fmt(h.avg_likes)}</td>
                    <td className="px-4 py-2.5 text-right text-mute">
                      {fmt(h.avg_comments)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {data.best_hours.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-mute">
                Your best hours (avg likes)
              </div>
              <div className="flex flex-wrap gap-3">
                {data.best_hours.map((h) => (
                  <div
                    key={h.hour}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="font-medium">
                      {String(h.hour).padStart(2, "0")}:00
                    </div>
                    <div className="text-xs text-mute">
                      {fmt(h.avg_likes)} avg · {h.posts} post(s)
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
