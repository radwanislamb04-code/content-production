import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Badge, Card, OutlineBtn } from "../ui";

/**
 * Setup Health — one card that answers "is anything quietly broken?".
 *
 * ⑦ of the master plan. Both of the failures that cost real time here (an Apify
 * token that had spent its allowance, and the Library API answering `[]` for
 * weeks) would have shown up on this card the moment they happened. Everything
 * on it comes from `/api/health`, which reads live state — nothing is cached
 * from a previous session and nothing is assumed.
 */

type Problem = { level: "error" | "warn" | "info"; message: string; href?: string };

type Health = {
  ok: boolean;
  identity: { user_id: string; email: string | null; name: string | null; switched: boolean };
  keys: {
    ai: { ready: boolean; base_url: string | null };
    youtube: boolean;
    serpapi: boolean;
    reddit: boolean;
    producthunt: boolean;
    imagegen: boolean;
    instagram_handle: boolean;
    telegram: { token: boolean; chat_id: boolean };
    apify_slots: number;
  };
  apify: Array<{
    id: string;
    label: string;
    state: string;
    account: string | null;
    plan: string | null;
    spentUsd: number | null;
    allowanceUsd: number | null;
    remainingUsd: number | null;
    cycle_end: string | null;
    error?: string;
  }>;
  telegram: {
    chat_id: string | null;
    intake_registered: boolean;
    last_update_at: number | null;
    updates_seen: number;
    last_error: string | null;
  };
  data: {
    library: { total: number; by_type: Array<{ type: string; n: number }>; unscored: number };
    projects: number;
    resources: number;
    board: { boards: number; cards: number };
    tasks: { open: number; total: number };
  };
  schedule: {
    crons: Array<{ cron: string; label: string }>;
    last_cron: { action: string; detail: string | null; at: number } | null;
    recent_failures: Array<{ module: string; action: string; detail: string; at: number }>;
  };
  problems: Problem[];
};

function ago(ts?: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `$${value.toFixed(2)}`;
}

export function SetupHealth() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/health");
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Could not read the health report.");
        setHealth(null);
        return;
      }
      setHealth(json as Health);
    } catch (err: any) {
      setError(err?.message ?? "Could not read the health report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const problems = health?.problems ?? [];
  const errors = problems.filter((p) => p.level === "error").length;

  const rows: Array<{ label: string; value: string; tone: "ok" | "warn" | "bad" }> = [];
  if (health) {
    const k = health.keys;
    rows.push({
      label: "AI key",
      value: k.ai.ready ? "ready" : "missing — add your own",
      tone: k.ai.ready ? "ok" : "bad",
    });
    rows.push({
      label: "Apify",
      value: k.apify_slots
        ? `${k.apify_slots} token(s)`
        : "no token — scraping paused",
      tone: k.apify_slots ? "ok" : "warn",
    });
    rows.push({
      label: "Telegram",
      value: k.telegram.token
        ? `sending${k.telegram.chat_id ? "" : " (no chat id yet)"} · intake ${
            health.telegram.intake_registered ? "on" : "off"
          }`
        : "not configured",
      tone: k.telegram.token ? (health.telegram.intake_registered ? "ok" : "warn") : "bad",
    });
    rows.push({
      label: "Trend data",
      value: `${k.youtube ? "YouTube" : "YouTube ✗"} · ${k.serpapi ? "SerpApi" : "SerpApi ✗"}`,
      tone: k.youtube || k.serpapi ? "ok" : "warn",
    });
    rows.push({
      label: "Library",
      value: `${health.data.library.total} item(s)${
        health.data.library.unscored ? ` · ${health.data.library.unscored} unscored` : ""
      }`,
      tone: "ok",
    });
    rows.push({
      label: "Task queue",
      value: `${health.data.tasks.open} open of ${health.data.tasks.total}`,
      tone: "ok",
    });
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {errors > 0 ? (
            <ShieldAlert className="h-4 w-4 text-err" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-lime" />
          )}
          <span className="text-[15px] font-semibold text-fg">Setup health</span>
          {health && (
            <Badge tone={errors ? "danger" : problems.length ? "warning" : "success"}>
              {errors
                ? `${errors} thing(s) broken`
                : problems.length
                  ? `${problems.length} thing(s) to look at`
                  : "everything wired"}
            </Badge>
          )}
        </div>
        <OutlineBtn onClick={load} disabled={loading} title="Re-read every check">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Checking…" : "Re-check"}
        </OutlineBtn>
      </div>

      {error ? (
        <p className="text-sm text-err">{error}</p>
      ) : !health ? (
        <p className="text-sm text-mute">Reading…</p>
      ) : (
        <>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-mute">{row.label}</span>
                <span
                  className={`text-right text-[12px] ${
                    row.tone === "bad"
                      ? "text-err"
                      : row.tone === "warn"
                        ? "text-warn"
                        : "text-fg2"
                  }`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {health.apify.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-line pt-3">
              {health.apify.map((slot) => (
                <div
                  key={slot.id}
                  className="flex flex-wrap items-baseline justify-between gap-2"
                >
                  <span className="text-[12px] text-fg2">
                    Apify · {slot.label}
                    {slot.account ? ` (${slot.account})` : ""}
                  </span>
                  <span
                    className={`text-[12px] ${
                      slot.state === "blocked"
                        ? "text-err"
                        : slot.state === "warn"
                          ? "text-warn"
                          : "text-fg2"
                    }`}
                  >
                    {slot.state === "error"
                      ? (slot.error ?? "could not be checked")
                      : `${money(slot.spentUsd)} of ${money(slot.allowanceUsd)} used · ${money(
                          slot.remainingUsd,
                        )} left${slot.cycle_end ? ` · resets ${slot.cycle_end.slice(0, 10)}` : ""}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
            <span className="text-[12px] text-mute">
              Automatic runs: {health.schedule.crons.map((c) => c.label).join(" · ")}
            </span>
            <span className="text-[12px] text-fg2">
              Last: {health.schedule.last_cron ? `${health.schedule.last_cron.action} (${ago(health.schedule.last_cron.at)})` : "never run"}
            </span>
          </div>

          {problems.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              {problems.slice(0, 6).map((p, i) => (
                <div key={i} className="flex items-start gap-2">
                  {p.level === "error" ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-err" />
                  ) : p.level === "warn" ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                  ) : (
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mute" />
                  )}
                  <span className="min-w-0 flex-1 text-[12px] text-fg2">{p.message}</span>
                  {p.href ? (
                    <button
                      onClick={() => navigate({ to: p.href } as any)}
                      className="shrink-0 text-[12px] text-lime hover:underline"
                    >
                      Fix →
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
