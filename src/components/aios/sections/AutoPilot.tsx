import { useCallback, useEffect, useState } from "react";
import { Card, PrimaryBtn, OutlineBtn } from "../ui";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Send,
} from "lucide-react";

/**
 * AutoPilot — the pipeline console.
 *
 * Everything here is real now: the buttons call `POST /api/run-pipeline`, the
 * status cards and the log panel read the `activity` table (the design's
 * activity-logger), and the schedule mirrors the two cron triggers in
 * wrangler.toml. No hardcoded history.
 */

type ActivityRow = {
  id: string;
  module: string;
  action: string;
  detail: string | null;
  created_at: number;
};

type StepResult = {
  step: string;
  ok: boolean;
  detail: string;
  items?: number;
  ms: number;
};

type PipelineReport = {
  ok: boolean;
  steps?: StepResult[];
  telegramSent?: number;
  error?: string;
};

const SCHEDULE = [
  {
    cron: "0 2 * * *",
    local: "08:00 Asia/Dhaka",
    label: "Morning brief",
    detail: "trends → competitor scrape → brief → Telegram",
  },
  {
    cron: "0 14 * * *",
    local: "20:00 Asia/Dhaka",
    label: "Evening check",
    detail: "competitor scrape → brief → Telegram",
  },
];

const STEP_LABELS: Record<string, string> = {
  trends: "Trends",
  scrape: "Competitor scrape",
  brief: "Compose brief",
  send: "Send to Telegram",
};

function ago(ts?: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function clock(ts?: number | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function AutoPilot() {
  const [feed, setFeed] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/activity?limit=50");
      const data = (await res.json()) as ActivityRow[];
      setFeed(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Could not load the activity log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = useCallback(
    async (label: string, steps: string[] | null) => {
      setRunning(label);
      setError(null);
      setReport(null);
      try {
        const res = await fetch("/api/run-pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(steps ? { steps } : {}),
        });
        const data = (await res.json()) as PipelineReport;
        setReport(data);
        if (!res.ok && data?.error) setError(data.error);
        await load();
      } catch (err: any) {
        setError(err?.message ?? "The pipeline call failed");
      } finally {
        setRunning(null);
      }
    },
    [load],
  );

  const latestOf = (modules: string[]) =>
    feed.find((r) => modules.includes(r.module)) ?? null;

  const lastScrape = latestOf(["scrape-competitor"]);
  const lastTrends = latestOf(["trends"]);
  const lastSend = latestOf(["telegram-sync"]);
  const lastCron = latestOf(["cron"]);

  const statusCards = [
    {
      icon: Bot,
      label: "Last competitor scrape",
      row: lastScrape,
      empty: "No scrape has run yet",
    },
    {
      icon: Clock,
      label: "Last trend fetch",
      row: lastTrends,
      empty: "No trend fetch yet",
    },
    {
      icon: Send,
      label: "Last Telegram report",
      row: lastSend,
      empty: "Nothing has been sent yet",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AutoPilot</h1>
          <p className="mt-0.5 text-sm text-muted">
            Run the content pipeline on demand, or let the schedule do it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OutlineBtn onClick={load} title="Reload the activity log">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </OutlineBtn>
          <PrimaryBtn
            onClick={() => run("full", null)}
            disabled={running !== null}
            title="Run every step in order"
          >
            {running === "full" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running === "full" ? "Running…" : "Run Full Pipeline Now"}
          </PrimaryBtn>
        </div>
      </div>

      {/* Individual steps */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase tracking-wide text-muted">
            Run a step
          </span>
          <OutlineBtn
            onClick={() => run("scrape", ["scrape"])}
            disabled={running !== null}
            title="Apify Instagram scrape → post_performance"
          >
            {running === "scrape" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
            Run Scraper
          </OutlineBtn>
          <OutlineBtn
            onClick={() => run("agents", ["trends", "brief"])}
            disabled={running !== null}
            title="Trend agent + brief composition (no Telegram send)"
          >
            {running === "agents" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
            Run Agents (trends + brief)
          </OutlineBtn>
          <OutlineBtn
            onClick={() => run("send", ["send"])}
            disabled={running !== null}
            title="Send today's stored brief to Telegram"
          >
            {running === "send" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Report
          </OutlineBtn>
        </div>
      </Card>

      {/* Last run report */}
      {(report || error) && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            {error || report?.ok === false ? (
              <AlertTriangle className="h-4 w-4 text-err" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-lime" />
            )}
            <span className="text-sm font-medium">
              {error
                ? "Run failed"
                : report?.ok
                  ? "Run finished"
                  : "Run finished with failures"}
            </span>
            {report?.telegramSent ? (
              <span className="text-xs text-muted">
                · {report.telegramSent} message(s) sent
              </span>
            ) : null}
          </div>
          {error && <p className="text-sm text-err">{error}</p>}
          <div className="space-y-2">
            {(report?.steps ?? []).map((s) => (
              <div
                key={s.step}
                className="flex items-start gap-2 text-sm"
              >
                {s.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-err" />
                )}
                <span className="w-40 shrink-0 font-medium">
                  {STEP_LABELS[s.step] ?? s.step}
                </span>
                <span className={s.ok ? "text-muted" : "text-err"}>
                  {s.detail}
                  {typeof s.items === "number" ? ` · ${s.items} item(s)` : ""}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {(s.ms / 1000).toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Status */}
      <div className="grid gap-3 sm:grid-cols-3">
        {statusCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                <Icon className="h-3.5 w-3.5" />
                {c.label}
              </div>
              {c.row ? (
                <>
                  <div className="mt-2 text-lg font-semibold">
                    {ago(c.row.created_at)}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted">
                    {c.row.detail || c.row.action}
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-2 text-lg font-semibold text-muted">
                    Never
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{c.empty}</div>
                </>
              )}
            </Card>
          );
        })}
      </div>

      {/* Schedule */}
      <Card className="p-4">
        <div className="mb-3 text-xs uppercase tracking-wide text-muted">
          Schedule
        </div>
        <div className="space-y-3">
          {SCHEDULE.map((s) => (
            <div key={s.cron} className="flex items-start gap-3 text-sm">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <div>
                <div className="font-medium">
                  {s.label} · {s.local}
                </div>
                <div className="text-xs text-muted">
                  <code>{s.cron}</code> (UTC) — {s.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-border pt-3 text-xs text-muted">
          Last scheduled run:{" "}
          {lastCron ? (
            <span>
              {ago(lastCron.created_at)} · {lastCron.action} ·{" "}
              {lastCron.detail}
            </span>
          ) : (
            <span>nothing yet</span>
          )}
        </div>
      </Card>

      {/* Logs */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted">
            Recent activity
          </div>
          <div className="text-xs text-muted">{feed.length} entries</div>
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted">Loading…</div>
        ) : feed.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">
            Nothing logged yet — run a step above, or wait for the next
            scheduled run.
          </div>
        ) : (
          <div className="max-h-96 space-y-1.5 overflow-y-auto">
            {feed.map((row) => (
              <div
                key={row.id}
                className="flex items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-cardhi"
              >
                <span className="w-24 shrink-0 text-xs text-muted">
                  {clock(row.created_at)}
                </span>
                <span className="w-32 shrink-0 truncate text-xs text-muted">
                  {row.module}
                </span>
                <span className="w-28 shrink-0 truncate text-xs">
                  {row.action}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {row.detail}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
