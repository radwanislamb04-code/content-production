import { useState } from "react";
import { Card, OutlineBtn, EmptyState, SkeletonList } from "../ui";
import type { SectionId } from "../Sidebar";
import type { TabId } from "../TopNav";
import { useApi } from "@/hooks/useApi";
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


const STATS = [
  { icon: Lightbulb, label: "Ideas", value: 42 },
  { icon: PenLine, label: "Scripts", value: 18 },
  { icon: LayoutPanelLeft, label: "Storyboards", value: 9 },
  { icon: Calendar, label: "Scheduled", value: 7 },
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

const RECENT = [
  { icon: PenLine, title: "Script — Morning routine hack", time: "2h ago" },
  { icon: LayoutPanelLeft, title: "Storyboard — Product launch", time: "5h ago" },
  { icon: Lightbulb, title: "Idea — Behind-the-scenes vlog", time: "8h ago" },
  { icon: Film, title: "Prompt — Runway shot 04", time: "1d ago" },
  { icon: Calendar, title: "Planner — Week of Aug 5", time: "1d ago" },
  { icon: Video, title: "Analyzed — Podcast transcript", time: "2d ago" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

export function Dashboard({
  onNav,
  onTab,
}: {
  onNav: (id: SectionId) => void;
  onTab: (t: TabId) => void;
}) {
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
        <div>
          <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-semibold text-fg">
            {greeting()}, Enzo
          </h1>
          <p className="mt-1 text-sm text-mute">
            Personal AI Content Operating System
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATS.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-lime">
                <s.icon size={18} />
              </div>
              <div className="mt-4 text-xs text-fg2">{s.label}</div>
              <div className="text-[clamp(1.5rem,7vw,2rem)] font-bold leading-tight text-lime">
                {s.value}
              </div>
            </Card>
          ))}
        </div>

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

        <Card className="bg-gradient-to-br from-[#101513] to-[#0C100E] p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-mute">
            Continue Working
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-surface text-lime">
              <PenLine size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-fg">
                Script — Morning routine hack
              </div>
              <div className="text-xs text-mute">Last modified 2 hours ago</div>
            </div>
            <OutlineBtn onClick={() => onNav("script")}>Open</OutlineBtn>
          </div>
        </Card>

        <div>
          <div className="mb-3 text-sm font-semibold text-fg2">
            Recent Generations
          </div>
          <div className="flex gap-3 overflow-x-auto aios-scroll pb-3">
            {RECENT.map((r, i) => (
              <div
                key={i}
                className="flex min-w-[160px] max-w-[160px] shrink-0 flex-col rounded-xl border border-line bg-cardx p-3"
                style={{ height: 200 }}
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-lime">
                  <r.icon size={16} />
                </div>
                <div className="mt-3 line-clamp-3 text-sm text-fg">
                  {r.title}
                </div>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <button className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-lime hover:border-lime">
                    Open
                  </button>
                  <span className="text-[10px] text-mute">{r.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
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
  text: string;
  time: string;
};

const ACTIVITY_ICONS: Record<string, typeof Lightbulb> = {
  discover: Lightbulb,
  script: PenLine,
  storyboard: LayoutPanelLeft,
  prompt: Film,
  planner: Calendar,
  analyzer: Video,
};

function AIActivity() {
  const { data, loading, error } = useApi<ActivityItem[]>("/api/activity");
  const items = (data ?? []).slice(0, 5);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">AI Activity</h2>
        <button className="shrink-0 text-xs text-lime hover:text-lime2">
          View all
        </button>
      </div>

      {loading ? (
        <SkeletonList rows={4} height={40} />
      ) : error || !items.length ? (
        <EmptyState
          icon={<Activity size={20} />}
          message="No activity yet — run a module to get started."
        />
      ) : (
        <div>
          {items.map((a, i) => {
            const Icon = ACTIVITY_ICONS[a.module ?? ""] ?? Activity;
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 py-2.5 ${
                  i < items.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <Icon size={16} className="shrink-0 text-lime" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                  {a.text}
                </span>
                <span className="shrink-0 text-[11px] text-mute">{a.time}</span>
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
