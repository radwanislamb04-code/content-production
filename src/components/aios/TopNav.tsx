import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  Menu,
  Search,
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
      const res = await fetch(`/api/notifications?limit=20&since=${since}`);
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
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-line bg-[rgba(3,5,4,0.85)] backdrop-blur-md lg:left-[200px]">
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
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-lime bg-surface text-xs font-semibold text-fg">
              EN
            </div>
          </div>
        </div>


      </header>

      {open && <Spotlight onClose={() => setOpen(false)} />}
    </>
  );
}

function Spotlight({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
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
      if (e.key === "Escape") onClose();
      if (!results?.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % results.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + results.length) % results.length);
      }
      if (e.key === "Enter") {
        const hit = results[cursor];
        onClose();
        if (hit?.href) navigate({ to: hit.href } as any);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results, cursor, onClose, navigate]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(3,5,4,0.7)] p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] overflow-hidden rounded-xl border border-line bg-cardx shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={15} className="shrink-0 text-mute" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder="Search anything..."
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-mute outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-mute hover:text-fg2"
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-3 aios-scroll">
          <div className="mb-2 px-1 text-[11px] uppercase tracking-wide text-mute">
            {q ? "Results" : "Recent searches"}
          </div>

          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aios-pulse h-11 rounded-lg bg-cardhi" />
              ))}
            </div>
          )}

          {!loading && (error || !results?.length) && (
            <p className="px-1 py-6 text-center text-sm text-mute">
              {error
                ? "Search is unavailable right now."
                : "Nothing here yet — generate content and it'll show up in search."}
            </p>
          )}

          {!loading &&
            !error &&
            results?.map((r, i) => (
              <button
                key={r.id}
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  onClose();
                  if (r.href) navigate({ to: r.href } as any);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                  cursor === i ? "bg-[rgba(82,255,46,0.08)]" : ""
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
            ))}
        </div>
      </div>
    </div>
  );
}
