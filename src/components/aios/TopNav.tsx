import { apiFetch } from "@/lib/api";
import { toggleSidebar, useSidebarOpen } from "@/lib/sidebar";
import { ProfileMenu } from "./ProfileMenu";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Download,
  Info,
  KanbanSquare,
  Lightbulb,
  ListTodo,
  Menu,
  Play,
  Search,
  Sparkles,
  Sun,
  X,
} from "lucide-react";

type SearchResult = {
  id: string;
  title: string;
  module: string;
  date: string;
  href?: string;
  snippet?: string;
};

type NotificationItem = {
  id: string;
  ts: number;
  module: string;
  action: string;
  detail: string;
  level: "error" | "success" | "info";
  href: string;
};

const LAST_SEEN_KEY = "contentos.notifications.lastSeen";

export function TopNav({
  title,
  onMenu,
}: {
  title: string;
  onMenu?: () => void;
  /** Deprecated: the unread badge is computed from the activity feed now. */
  hasUnread?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  // The header sits to the right of the sidebar, so it has to move with it.
  const [sidebarOpen, setSidebarOpen] = useSidebarOpen();

  // One event source, two places: the same `activity` rows that feed Telegram
  // delivery also feed this bell.
  const loadNotifications = useCallback(async () => {
    let since = 0;
    try {
      since = Number(localStorage.getItem(LAST_SEEN_KEY) ?? 0) || 0;
    } catch {
      since = 0;
    }
    try {
      const res = await apiFetch(`/api/notifications?limit=20&since=${since}`);
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
      setUnread(Number(json?.unread) || 0);
    } catch {
      /* leave the badge as-is if the feed is unreachable */
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 60_000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  const toggleBell = useCallback(() => {
    if (!bellOpen) {
      setUnread(0);
      try {
        localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    }
    setBellOpen(!bellOpen);
  }, [bellOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setBellOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-0 z-20 border-b border-line bg-header backdrop-blur-md ${
          sidebarOpen ? "lg:left-[200px]" : "lg:left-0"
        }`}
      >
        <div className="grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 sm:grid-cols-[180px_minmax(0,1fr)_180px] sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={onMenu}
              aria-label="Open navigation"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-fg2 transition-colors hover:bg-cardx hover:text-fg lg:hidden"
            >
              <Menu size={20} />
            </button>

            <div className="min-w-0 truncate text-base font-semibold text-fg">
              {title}
            </div>
          </div>

          <div className="hidden min-w-0 justify-center sm:flex">
            <button
              onClick={() => setOpen(true)}
              className="group flex h-9 w-full max-w-[400px] items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-left transition-all hover:border-line2 focus:border-lime focus:shadow-[0_0_0_2px_rgba(82,255,46,0.15)] focus:outline-none"
            >
              <Search size={15} className="shrink-0 text-mute" />
              <span className="flex-1 truncate text-sm text-mute">
                Search anything...
              </span>
              <span className="shrink-0 rounded border-none bg-line px-1.5 py-0.5 font-mono text-[11px] text-mute">
                ⌘K
              </span>
            </button>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-3">
            <button
              onClick={() => setOpen(true)}
              aria-label="Search"
              className="grid h-11 w-11 place-items-center rounded-md text-fg2 transition-colors hover:bg-cardx hover:text-fg sm:hidden"
            >
              <Search size={18} />
            </button>
            <div className="relative">
              <button
                onClick={toggleBell}
                aria-label="Notifications"
                aria-expanded={bellOpen}
                className="grid h-11 w-11 place-items-center rounded-md text-fg2 transition-colors hover:bg-cardx hover:text-fg sm:h-9 sm:w-9"
              >
                <Bell size={16} />
              </button>
              {unread > 0 && (
                <span className="pointer-events-none absolute right-2.5 top-2.5 h-2 w-2 sm:right-1.5 sm:top-1.5">
                  <span className="absolute inset-0 rounded-full bg-lime aios-ripple" />
                  <span className="absolute inset-0 rounded-full bg-lime shadow-[0_0_6px_#52FF2E]" />
                </span>
              )}

              {bellOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setBellOpen(false)}
                  />
                  <div className="absolute right-0 top-11 z-40 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-cardx shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
                    <div className="border-b border-line px-4 py-2.5 text-[11px] uppercase tracking-wide text-mute">
                      {items.length === 0
                        ? "Notifications"
                        : `${items.length} recent event(s)`}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto aios-scroll">
                      {items.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-mute">
                          Nothing yet — pipeline runs and briefs show up here.
                        </p>
                      ) : (
                        items.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => {
                              setBellOpen(false);
                              if (n.href) navigate({ to: n.href } as any);
                            }}
                            className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-cardhi"
                          >
                            {n.level === "error" ? (
                              <AlertTriangle
                                size={14}
                                className="mt-0.5 shrink-0 text-err"
                              />
                            ) : n.level === "success" ? (
                              <CheckCircle2
                                size={14}
                                className="mt-0.5 shrink-0 text-lime"
                              />
                            ) : (
                              <Info size={14} className="mt-0.5 shrink-0 text-mute" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-fg">
                                {n.detail || n.action}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-mute">
                                {n.module} · {n.action} ·{" "}
                                {new Date(n.ts).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Was a static "EN" badge (the brand's initials) that did nothing —
                now the account control: who you are, switching, adding users. */}
            <ProfileMenu />
          </div>
        </div>


      </header>

      {open && <Spotlight onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * ⌘K actions — ⑦ of the master plan.
 *
 * Search used to be the only thing this palette could do. These run the thing you
 * came for: start a scraper run, queue today's tasks, score what is unscored,
 * download the library. Each one calls the same endpoint the page calls, so the
 * palette cannot drift away from the app.
 */
type PaletteAction = {
  id: string;
  title: string;
  hint: string;
  keywords: string;
  Icon: typeof Search;
  run: (ctx: {
    navigate: (to: string) => void;
    close: () => void;
    setMode: (mode: "search" | "task") => void;
  }) => void | Promise<void>;
};

async function jsonPost(path: string, body?: unknown) {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { res, json: await res.json().catch(() => null) };
}

const ACTIONS: PaletteAction[] = [
  {
    id: "new-idea",
    title: "New idea",
    hint: "Open the Ideator and generate ideas",
    keywords: "new idea ideate generate brainstorm",
    Icon: Lightbulb,
    run: ({ navigate, close }) => {
      close();
      navigate("/ideator");
    },
  },
  {
    id: "add-task",
    title: "Add a task…",
    hint: "Type the task and press Enter — it lands in today's queue",
    keywords: "add task todo queue telegram",
    Icon: ListTodo,
    run: ({ setMode }) => setMode("task"),
  },
  {
    id: "queue-today",
    title: "Queue today's tasks",
    hint: "Turn today's calendar entries and draft scripts into tasks",
    keywords: "queue today tasks calendar auto",
    Icon: CalendarClock,
    run: async ({ close }) => {
      close();
      const id = toast.loading("Queueing today's tasks…");
      try {
        const { res, json } = await jsonPost("/api/auto-queue");
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? "failed");
        toast.success(
          json.created > 0
            ? `Queued ${json.created} task(s) for ${json.date_key}.`
            : `Nothing new — ${json.skipped} already queued for ${json.date_key}.`,
          { id },
        );
      } catch (err: any) {
        toast.error(`Could not queue: ${err?.message ?? err}`, { id });
      }
    },
  },
  {
    id: "run-scraper",
    title: "Run scraper now",
    hint: "Competitor scrape (Apify) on demand",
    keywords: "run scraper scrape apify competitor now",
    Icon: Play,
    run: async ({ close }) => {
      close();
      const id = toast.loading("Running the competitor scrape…");
      try {
        const { res, json } = await jsonPost("/api/run-pipeline", { steps: ["scrape"] });
        const step = json?.steps?.[0];
        if (!res.ok || !json?.ok || step?.ok === false) {
          throw new Error(step?.detail ?? json?.error ?? "failed");
        }
        toast.success(`Scrape finished — ${step?.detail ?? "done"}.`, { id });
      } catch (err: any) {
        toast.error(`Scrape failed: ${err?.message ?? err}`, { id });
      }
    },
  },
  {
    id: "run-trends",
    title: "Run trend fetch now",
    hint: "YouTube / SerpApi trends on demand",
    keywords: "run trends youtube serpapi fetch now",
    Icon: Play,
    run: async ({ close }) => {
      close();
      const id = toast.loading("Fetching trends…");
      try {
        const { res, json } = await jsonPost("/api/run-pipeline", { steps: ["trends"] });
        const step = json?.steps?.[0];
        if (!res.ok || !json?.ok || step?.ok === false) {
          throw new Error(step?.detail ?? json?.error ?? "failed");
        }
        toast.success(`Trends updated — ${step?.detail ?? "done"}.`, { id });
      } catch (err: any) {
        toast.error(`Trend fetch failed: ${err?.message ?? err}`, { id });
      }
    },
  },
  {
    id: "todays-brief",
    title: "Open today's brief",
    hint: "The morning brief for today",
    keywords: "brief today daily morning open",
    Icon: Sun,
    run: ({ navigate, close }) => {
      close();
      navigate("/daily-brief");
    },
  },
  {
    id: "score-unscored",
    title: "Score all unscored",
    hint: "Batch-score five library items",
    keywords: "score content quality batch unscored",
    Icon: Sparkles,
    run: async ({ close }) => {
      close();
      const id = toast.loading("Scoring up to five items…");
      try {
        const { res, json } = await jsonPost("/api/score-content", {
          batch: true,
          limit: 5,
        });
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? "failed");
        toast.success(
          json.message ??
            `Scored ${json.scored} item(s)${json.failed ? `, ${json.failed} failed` : ""} · ${json.remaining} left.`,
          { id },
        );
      } catch (err: any) {
        toast.error(`Scoring failed: ${err?.message ?? err}`, { id });
      }
    },
  },
  {
    id: "export-library",
    title: "Export the library (JSON)",
    hint: "Download everything you have saved",
    keywords: "export download backup library json",
    Icon: Download,
    run: async ({ close }) => {
      close();
      try {
        const res = await apiFetch("/api/library-export?format=json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `content-os-library-${new Date()
          .toISOString()
          .slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success("Library downloaded");
      } catch (err: any) {
        toast.error(`Export failed: ${err?.message ?? err}`);
      }
    },
  },
  {
    id: "toggle-sidebar",
    title: "Hide / show the sidebar",
    hint: "Ctrl+B — more room for the content",
    keywords: "sidebar hide show collapse expand menu panel toggle",
    Icon: Menu,
    run: () => toggleSidebar(),
  },
  {
    id: "open-board",
    title: "Open the board",
    hint: "Kanban board",
    keywords: "board kanban cards open",
    Icon: KanbanSquare,
    run: ({ navigate, close }) => {
      close();
      navigate("/board");
    },
  },
];

function Spotlight({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"search" | "task">("search");
  const [savingTask, setSavingTask] = useState(false);
  const [taskNote, setTaskNote] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matchingActions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ACTIONS.slice(0, 5);
    return ACTIONS.filter(
      (a) =>
        a.title.toLowerCase().includes(needle) ||
        a.keywords.includes(needle) ||
        a.hint.toLowerCase().includes(needle),
    );
  }, [q]);

  const rows = useMemo(
    () => [
      ...matchingActions.map((action) => ({ kind: "action" as const, action })),
      ...(results ?? []).map((result) => ({ kind: "result" as const, result })),
    ],
    [matchingActions, results],
  );

  /** Task mode: what you type becomes a task instead of a search. */
  const saveTask = useCallback(async () => {
    const text = q.trim();
    if (!text) return;
    setSavingTask(true);
    try {
      const res = await apiFetch("/api/telegram-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setTaskNote(json?.error ?? "Could not save the task.");
        return;
      }
      toast.success("Task added to today's queue");
      onClose();
    } catch (err: any) {
      setTaskNote(err?.message ?? "Could not save the task.");
    } finally {
      setSavingTask(false);
    }
  }, [q, onClose]);

  const runRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      if (row.kind === "result") {
        onClose();
        if (row.result.href) navigate({ to: row.result.href } as any);
        return;
      }
      void row.action.run({
        navigate: (to) => navigate({ to } as any),
        close: onClose,
        setMode,
      });
    },
    [rows, navigate, onClose],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((json) => {
          if (cancelled) return;
          // The endpoint returns a flat array. Older builds returned
          // { projects, library }, so tolerate both instead of showing nothing.
          const list = Array.isArray(json)
            ? json
            : Array.isArray(json?.results)
              ? json.results
              : Array.isArray(json?.library)
                ? json.library
                : [];
          setResults(list);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setError(true);
          setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (mode === "task") {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!savingTask) void saveTask();
        }
        return;
      }
      if (!rows.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % rows.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + rows.length) % rows.length);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        runRow(cursor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, onClose, mode, savingTask, saveTask, runRow]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] overflow-hidden rounded-xl border border-line bg-cardx shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          {mode === "task" ? (
            <ListTodo size={15} className="shrink-0 text-lime" />
          ) : (
            <Search size={15} className="shrink-0 text-mute" />
          )}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder={
              mode === "task"
                ? "What needs doing? Press Enter to save…"
                : "Search anything, or type an action..."
            }
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-mute outline-none"
          />
          {mode === "task" && (
            <button
              onClick={() => {
                setMode("search");
                setTaskNote(null);
              }}
              className="shrink-0 text-[11px] text-mute hover:text-fg2"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close search"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-mute hover:text-fg2"
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-3 aios-scroll">
          {mode === "task" ? (
            <div className="px-1 py-4 text-center">
              <p className="text-sm text-fg2">
                Press <span className="text-lime">Enter</span> to add it to today's
                queue.
              </p>
              <p className="mt-1 text-[11px] text-mute">
                It shows up on the Dashboard and in the next Telegram briefing.
              </p>
              {taskNote && <p className="mt-2 text-[12px] text-err">{taskNote}</p>}
            </div>
          ) : (
            <>
              {matchingActions.length > 0 && (
                <>
                  <div className="mb-2 px-1 text-[11px] uppercase tracking-wide text-mute">
                    Actions
                  </div>
                  {matchingActions.map((action, i) => (
                    <button
                      key={action.id}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => runRow(i)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                        cursor === i ? "bg-[rgba(82,255,46,0.08)]" : ""
                      }`}
                    >
                      <action.Icon size={15} className="shrink-0 text-lime" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">
                          {action.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-mute">
                          {action.hint}
                        </span>
                      </span>
                    </button>
                  ))}
                </>
              )}

              <div className="mb-2 mt-3 px-1 text-[11px] uppercase tracking-wide text-mute">
                {q ? "Results" : "Your content"}
              </div>

              {loading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="aios-pulse h-11 rounded-lg bg-cardhi" />
                  ))}
                </div>
              )}

              {!loading && error && (
                <p className="px-1 py-6 text-center text-sm text-mute">
                  Search is unavailable right now.
                </p>
              )}

              {!loading && !error && !results?.length && (
                <p className="px-1 py-6 text-center text-sm text-mute">
                  Nothing matches — {q ? "try another word, or use an action above." : "nothing saved yet."}
                </p>
              )}

              {!loading &&
                !error &&
                results?.map((r, i) => {
                  const index = matchingActions.length + i;
                  return (
                    <button
                      key={r.id}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => runRow(index)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                        cursor === index ? "bg-[rgba(82,255,46,0.08)]" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{r.title}</span>
                        {r.snippet ? (
                          <span className="mt-0.5 block truncate text-[11px] text-mute">
                            {r.snippet}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-fg2">
                        {r.module}
                      </span>
                      <span className="shrink-0 text-[11px] text-mute">{r.date}</span>
                    </button>
                  );
                })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
