import { useEffect, useState } from "react";
import { Card, OutlineBtn, EmptyState, Pill, SkeletonList } from "../ui";
import type { SectionId } from "../Sidebar";
import { apiFetch, apiGet } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { HeroClock } from "../widgets/HeroClock";
import { QuoteBar } from "../widgets/QuoteBar";
import { SetupHealth } from "./SetupHealth";

import {
  Lightbulb,
  PenLine,
  LayoutPanelLeft,
  Calendar,
  Check,
  Trash2,
  Video,
  Film,
  ArrowRight,
  Plus,
  PlusCircle,
  Star,
  TrendingUp,

  Activity,
} from "lucide-react";


const LIB_TYPES = [
  { slug: "idea", label: "Ideas", icon: Lightbulb },
  { slug: "script", label: "Scripts", icon: PenLine },
  { slug: "storyboard", label: "Storyboards", icon: LayoutPanelLeft },
  { slug: "video_prompt", label: "Video Prompts", icon: Film },
];


const PIPELINE: {
  label: string;
  status: "ready" | "pending" | "empty";
  icon: typeof Lightbulb;
}[] = [
  { label: "Discover", status: "ready", icon: Lightbulb },
  { label: "Script+Hook", status: "ready", icon: PenLine },
  { label: "Storyboard", status: "pending", icon: LayoutPanelLeft },
  { label: "Video Prompt", status: "empty", icon: Film },
  { label: "Planner", status: "empty", icon: Calendar },
];

/** A row of the real `telegram_tasks` table (`done` = already delivered). */
type TgTask = {
  id: string;
  text: string;
  time?: string | null;
  done?: number | boolean | null;
  created_at?: number;
  source?: string | null;
  due_date?: string | null;
  /** Where a Telegram message was filed: board | calendar | library | remind | task */
  routed_to?: string | null;
};

/** The label for a filed message — "→ Board" reads better than "routed_to: board". */
const ROUTE_LABEL: Record<string, string> = {
  board: "Board",
  calendar: "Calendar",
  library: "Ideas",
  remind: "Briefing",
  task: "Task",
};


function useGreeting() {
  const [text, setText] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    setText(h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening");
  }, []);
  return text;
}

export function Dashboard({
  onNav,
}: {
  onNav: (id: SectionId) => void;
}) {
  const greeting = useGreeting();
  const QUICK: { label: string; Icon: typeof Plus; onClick: () => void }[] = [
    {
      label: "New Project",
      Icon: PlusCircle,
      onClick: () => {
        onNav("analyzer");
      },
    },
    { label: "AI Ideation", Icon: Lightbulb, onClick: () => onNav("discover") },
    { label: "Content Score", Icon: Star, onClick: () => onNav("score") },
    {
      label: "Trend Analysis",
      Icon: TrendingUp,
      onClick: () => onNav("discover"),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ---------- Left column ---------- */}
      <div className="min-w-0 space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-[clamp(1.4rem,5.5vw,1.6rem)] font-semibold leading-tight text-fg">
              {greeting}, Enzorico
            </h1>
            <p className="mt-0.5 text-sm text-mute">
              Personal AI Content Operating System
            </p>
          </div>
          <HeroClock />
        </div>

        <QuoteBar />


        <StatsRow />

        {/* One honest card instead of guessing why something stopped working. */}
        <SetupHealth />

        <Card className="p-5">
          <div className="mb-4 text-sm font-semibold text-fg2">Pipeline</div>
          <div className="flex items-center gap-2 overflow-x-auto aios-scroll pb-2">
            {PIPELINE.map((p, i) => (
              <div key={p.label} className="flex items-center gap-2">
                <div className="min-w-[140px] rounded-lg border border-line bg-surface p-3">
                  <div className="flex items-center gap-2 text-fg">
                    <p.icon size={14} className="text-lime" />
                    <span className="text-sm font-medium">{p.label}</span>
                  </div>
                  <div className="mt-2">
                    {p.status === "ready" && (
                      <span className="text-xs text-lime">✅ Ready</span>
                    )}
                    {p.status === "pending" && (
                      <span className="text-xs text-warn">⏳ Pending</span>
                    )}
                    {p.status === "empty" && (
                      <span className="text-xs text-mute">⚪ Not started</span>
                    )}
                  </div>
                </div>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight
                    size={18}
                    className={`text-line2 ${
                      PIPELINE[i].status === "ready" &&
                      PIPELINE[i + 1].status !== "empty"
                        ? "text-lime aios-pulse"
                        : ""
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>

        <ContinueWorking onNav={onNav} />

        <RecentGenerations />

      </div>

      {/* ---------- Right column ---------- */}
      <div className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold text-fg">
            Quick Actions
          </div>
          <div className="grid grid-cols-2 gap-3">
            {QUICK.map((q) => (
              <button
                key={q.label}
                onClick={q.onClick}
                className="rounded-[10px] border border-line bg-surface p-4 text-left transition-all duration-200 hover:border-lime hover:shadow-[0_0_0_1px_rgba(82,255,46,0.15)]"
              >
                <q.Icon size={18} className="text-lime" />
                <div className="mt-2 text-[13px] text-fg2">{q.label}</div>
              </button>
            ))}
          </div>
        </Card>

        <AIActivity />

        <TelegramTasks />
      </div>
    </div>
  );
}


type ActivityItem = {
  id: string;
  module?: string;
  action?: string;
  detail?: string | null;
  created_at?: number;
};

const ACTIVITY_ICONS: Record<string, typeof Lightbulb> = {
  discover: Lightbulb,
  ideator: Lightbulb,
  script: PenLine,
  "hook-script-writer": PenLine,
  storyboard: LayoutPanelLeft,
  "visual-storyboard": LayoutPanelLeft,
  prompt: Film,
  "video-gen-prompt": Film,
  planner: Calendar,
  analyzer: Video,
};

function timeAgo(ts?: number) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function activityLabel(a: ActivityItem) {
  const base = [a.module, a.action].filter(Boolean).join(" — ");
  return a.detail ? `${base}: ${a.detail}` : base || "Activity";
}

function useActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<ActivityItem[]>("/api/activity")
      .then((rows) => !cancelled && setItems(Array.isArray(rows) ? rows : []))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, error };
}

function StatsRow() {
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancelled = false;
    LIB_TYPES.forEach((t) => {
      apiGet<unknown[]>(`/api/library/${t.slug}`)
        .then((rows) => {
          if (cancelled) return;
          setCounts((c) => ({
            ...c,
            [t.slug]: Array.isArray(rows) ? rows.length : 0,
          }));
        })
        .catch(() => {
          if (!cancelled) setCounts((c) => ({ ...c, [t.slug]: 0 }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {LIB_TYPES.map((s) => (
        <Card key={s.slug} className="p-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-lime">
            <s.icon size={18} />
          </div>
          <div className="mt-4 text-xs text-fg2">{s.label}</div>
          <div className="text-[clamp(1.5rem,7vw,2rem)] font-bold leading-tight text-lime">
            {counts[s.slug] ?? "—"}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ContinueWorking({ onNav }: { onNav: (id: SectionId) => void }) {
  const [ideas, setIdeas] = useState<{ key: string; value: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ key: string; value: string }[]>("/api/workspace/selected_idea")
      .then((rows) => !cancelled && setIdeas(Array.isArray(rows) ? rows : []))
      .catch(() => !cancelled && setIdeas([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="bg-gradient-to-br from-cardfrom to-cardto p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-mute">
        Continue Working
      </div>
      {loading ? (
        <div className="mt-3">
          <SkeletonList rows={1} height={48} />
        </div>
      ) : !ideas.length ? (
        <div className="mt-3 text-sm text-mute">
          Nothing in progress — start in Ideator.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {ideas.slice(0, 3).map((i) => (
            <div key={i.key} className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-lime">
                <PenLine size={18} />
              </div>
              <div className="min-w-0 flex-1 truncate text-sm text-fg">
                {i.value}
              </div>
              <OutlineBtn onClick={() => onNav("script")}>Open</OutlineBtn>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RecentGenerations() {
  const { items, loading, error } = useActivity();
  const recent = items.slice(0, 8);

  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-fg2">
        Recent Generations
      </div>
      {loading ? (
        <SkeletonList rows={2} height={64} />
      ) : error || !recent.length ? (
        <EmptyState
          icon={<Activity size={20} />}
          message="No generations yet — run a module to get started."
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto aios-scroll pb-3">
          {recent.map((r) => {
            const Icon = ACTIVITY_ICONS[r.module ?? ""] ?? Activity;
            return (
              <div
                key={r.id}
                className="flex min-w-[160px] max-w-[160px] shrink-0 flex-col rounded-xl border border-line bg-cardx p-3"
                style={{ height: 200 }}
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-lime">
                  <Icon size={16} />
                </div>
                <div className="mt-3 line-clamp-4 text-sm text-fg">
                  {activityLabel(r)}
                </div>
                <div className="mt-auto pt-4 text-[10px] text-mute">
                  {timeAgo(r.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AIActivity() {
  const { items, loading, error } = useActivity();
  const recent = items.slice(0, 5);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">AI Activity</h2>
      </div>

      {loading ? (
        <SkeletonList rows={4} height={40} />
      ) : error || !recent.length ? (
        <EmptyState
          icon={<Activity size={20} />}
          message="No activity yet — run a module to get started."
        />
      ) : (
        <div>
          {recent.map((a, i) => {
            const Icon = ACTIVITY_ICONS[a.module ?? ""] ?? Activity;
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 py-2.5 ${
                  i < recent.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <Icon size={16} className="shrink-0 text-lime" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                  {activityLabel(a)}
                </span>
                <span className="shrink-0 text-[11px] text-mute">
                  {timeAgo(a.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}



function TelegramTasks() {
  const { data, loading, setData } = useApi<TgTask[]>("/api/telegram-tasks");
  const tasks = Array.isArray(data) ? data : [];
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The missing writer: nothing in the app ever queued a task, so this list could
  // only ever be empty. The 08:00 / 20:00 cron delivers whatever is queued here.
  const addTask = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/telegram-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setData((prev) => [json.task as TgTask, ...(prev ?? [])]);
      setDraft("");
    } catch (e: any) {
      setErr(e?.message ?? "Could not save the task");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Tick it off, or put it back. Optimistic on purpose — the queue is the thing
   * you look at while working, and a spinner on a checkbox is worse than a rollback
   * if the write fails.
   */
  const setDone = async (id: string, done: boolean) => {
    setErr(null);
    setData((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, done } : t)));
    try {
      const res = await apiFetch("/api/telegram-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      if (json.task) {
        setData((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, ...json.task } : t)));
      }
    } catch (e: any) {
      setErr(e?.message ?? "Could not update the task");
      setData((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, done: !done } : t)));
    }
  };

  /** Delete for good. The row goes; if the write fails the row comes back. */
  const removeTask = async (id: string) => {
    const snapshot = tasks;
    setErr(null);
    setData((prev) => (prev ?? []).filter((t) => t.id !== id));
    try {
      const res = await apiFetch(`/api/telegram-tasks?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    } catch (e: any) {
      setErr(e?.message ?? "Could not delete the task");
      setData(snapshot);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-1 text-xs uppercase tracking-wide text-mute">
        From Telegram
      </div>
      <div className="text-sm font-semibold text-fg">Tasks</div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={draft}
          maxLength={300}
          placeholder="Add a task — the bot will send it at 08:00 / 20:00"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addTask();
          }}
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 text-sm text-fg outline-none placeholder:text-mute focus:border-lime"
        />
        <OutlineBtn onClick={() => void addTask()} disabled={saving || !draft.trim()}>
          {saving ? "Saving…" : "Add"}
        </OutlineBtn>
      </div>
      {err && <div className="mt-2 text-[11px] text-err">{err}</div>}

      {loading ? (
        <div className="mt-3 text-sm text-mute">Loading…</div>
      ) : tasks.length === 0 ? (
        // Truthful empty state: nothing writes to telegram_tasks yet, so an
        // invented to-do list would be a lie.
        <div className="mt-3 text-sm text-mute">
          Nothing is queued. Add one above and the bot will send it with the next
          automatic run.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-2 rounded-md border border-line bg-surface p-2.5 text-sm"
            >
              <button
                type="button"
                onClick={() => void setDone(t.id, !t.done)}
                title={t.done ? "Put it back in the open list" : "Mark as done"}
                aria-label={t.done ? "Put it back in the open list" : "Mark as done"}
                className={`mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors ${
                  t.done
                    ? "border-lime bg-lime/10 text-lime"
                    : "border-line text-mute hover:border-lime hover:text-lime"
                }`}
              >
                {t.done ? <Check size={12} /> : null}
              </button>

              <span
                className={`min-w-0 flex-1 ${t.done ? "text-mute line-through" : "text-fg"}`}
              >
                {t.text}
              </span>

              {t.time && <span className="shrink-0 text-xs text-mute">{t.time}</span>}

              {t.routed_to ? (
                <span
                  className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-mute"
                  title="You filed this from Telegram — it lives there now"
                >
                  → {ROUTE_LABEL[t.routed_to] ?? t.routed_to}
                </span>
              ) : (
                <Pill variant={t.done ? "default" : "accent"}>
                  {t.done ? "handled" : "queued"}
                </Pill>
              )}

              <button
                type="button"
                onClick={() => void removeTask(t.id)}
                title="Delete this task"
                aria-label="Delete this task"
                className="mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded text-mute transition-colors hover:text-err"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-[11px] text-mute">
        Ticked = done; the bin deletes it for good. Queued tasks go out with the
        next bot run (08:00 / 20:00), and a message you filed to the Board, the
        calendar or Ideas leaves this list and shows where it went.
      </div>
    </Card>
  );
}
