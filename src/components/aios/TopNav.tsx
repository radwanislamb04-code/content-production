import { useEffect, useRef, useState } from "react";
import { Search, Bell, X } from "lucide-react";

export const TABS = ["Dashboard", "Projects", "Templates", "Library"] as const;
export type TabId = (typeof TABS)[number];

type SearchResult = { id: string; title: string; module: string; date: string };

export function TopNav({
  title,
  activeTab,
  onTabChange,
}: {
  title: string;
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="fixed left-[200px] right-0 top-0 z-20 border-b border-line bg-[rgba(3,5,4,0.85)] backdrop-blur-md">
        <div className="flex h-14 items-center gap-4 px-6">
          <div className="min-w-0 shrink-0 truncate text-base font-semibold text-fg">
            {title}
          </div>

          <div className="flex flex-1 justify-center">
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

          <div className="flex shrink-0 items-center gap-3">
            <div className="relative">
              <button
                aria-label="Notifications"
                className="grid h-9 w-9 place-items-center rounded-md text-fg2 transition-colors hover:bg-cardx hover:text-fg"
              >
                <Bell size={16} />
              </button>
              <span className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-lime shadow-[0_0_6px_#52FF2E]" />
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-lime bg-surface text-xs font-semibold text-fg">
              EN
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-t border-line px-4 aios-scroll">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === t
                  ? "border-lime text-fg"
                  : "border-transparent text-mute hover:text-fg2"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {open && <Spotlight onClose={() => setOpen(false)} />}
    </>
  );
}

function Spotlight({ onClose }: { onClose: () => void }) {
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
          setResults(Array.isArray(json) ? json : []);
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
      if (e.key === "Enter") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results, onClose]);

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
                onClick={onClose}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                  cursor === i ? "bg-[rgba(82,255,46,0.08)]" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {r.title}
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
