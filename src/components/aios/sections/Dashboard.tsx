import { useEffect, useState } from "react";
import { Card, OutlineBtn, EmptyState, SkeletonList } from "../ui";
import type { SectionId } from "../Sidebar";
import type { TabId } from "../TopNav";
import { apiGet } from "@/lib/api";
import { HeroClock } from "../widgets/HeroClock";
import { QuoteBar } from "../widgets/QuoteBar";

import {
  Lightbulb,
  PenLine,
  LayoutPanelLeft,
  Calendar,
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

type Task = { id: string; text: string; time: string; completed: boolean };

const INITIAL_TASKS: Task[] = [
  { id: "t1", text: "Review 3 competitor reels", time: "10:00", completed: true },
  { id: "t2", text: "Approve script draft for Ep. 12", time: "13:30", completed: false },
  { id: "t3", text: "Post scheduled Reel", time: "18:00", completed: false },
  { id: "t4", text: "Reply to DMs bucket", time: "20:00", completed: false },
];


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
  onTab,
}: {
  onNav: (id: SectionId) => void;
  onTab: (t: TabId) => void;
}) {
  const greeting = useGreeting();
  const QUICK: { label: string; Icon: typeof Plus; onClick: () => void }[] = [
    {
      label: "New Project",
      Icon: PlusCircle,
      onClick: () => {
        onTab("Projects");
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
              {greeting}, Enzo
            </h1>
            <p className="mt-0.5 text-sm text-mute">
              Personal AI Content Operating System
            </p>
          </div>
          <HeroClock />
        </div>

        <QuoteBar />


        <StatsRow />


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
    <Card className="bg-gradient-to-br from-[#101513] to-[#0C100E] p-5">
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
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);

  const toggle = (id: string) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );

  return (
    <Card className="p-5">
      <div className="mb-1 text-xs uppercase tracking-wide text-mute">
        From Telegram
      </div>
      <div className="text-sm font-semibold text-fg">Today's Tasks</div>
      <div className="mt-3 space-y-2">
        {tasks.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-line bg-surface p-2.5 text-sm"
          >
            <input
              type="checkbox"
              checked={t.completed}
              onChange={() => toggle(t.id)}
              className="h-4 w-4 accent-[#52FF2E]"
            />
            <span
              className={
                t.completed
                  ? "flex-1 text-mute line-through opacity-60"
                  : "flex-1 text-fg"
              }
            >
              {t.text}
            </span>
            <span className="rounded-full border border-line bg-cardx px-2 py-0.5 text-[11px] text-fg2">
              {t.time}
            </span>
          </label>
        ))}
      </div>
    </Card>
  );
}
