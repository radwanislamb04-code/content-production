import { useEffect, useMemo, useState } from "react";
import { Pill, Input, EmptyState, SkeletonList, GhostBtn } from "../ui";
import { useApi } from "@/hooks/useApi";
import {
  PenLine,
  LayoutPanelLeft,
  Film,
  Lightbulb,
  Check,
} from "lucide-react";

const TABS = [
  { label: "Scripts", slug: "scripts", Icon: PenLine, empty: "No scripts saved yet — generate one in Script + Hook." },
  { label: "Storyboards", slug: "storyboards", Icon: LayoutPanelLeft, empty: "No storyboards yet — build one in Storyboard." },
  { label: "Video Prompts", slug: "video-prompts", Icon: Film, empty: "No video prompts yet — create one in Video Prompt." },
  { label: "Ideas", slug: "ideas", Icon: Lightbulb, empty: "No ideas saved yet — capture some in Ideator." },
] as const;

type LibraryItem = {
  id: string;
  title: string;
  module: string;
  date: string;
  createdAt?: string;
};

export function Library() {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold text-fg">Library</h1>
        <p className="mt-1 text-sm text-fg2">
          All your saved content in one place
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.slug} onClick={() => setTab(t)}>
            <Pill active={tab.slug === t.slug}>{t.label}</Pill>
          </button>
        ))}
      </div>

      <LibraryList key={tab.slug} tab={tab} />
    </div>
  );
}

function LibraryList({ tab }: { tab: (typeof TABS)[number] }) {
  const { data, loading, error, setData } = useApi<LibraryItem[]>(
    `/api/library/${tab.slug}`,
  );
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const list = (data ?? []).filter((i) =>
      i.title.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return sort === "oldest" ? [...list].reverse() : list;
  }, [data, query, sort]);

  const rename = (id: string, title: string) => {
    setData((prev) =>
      (prev ?? []).map((i) => (i.id === id ? { ...i, title } : i)),
    );
    return fetch(`/api/library/${tab.slug}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0 max-w-[280px]">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title..."
            className="h-9"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-mute">
          <span>Sort</span>
          <button onClick={() => setSort("newest")}>
            <Pill active={sort === "newest"}>Newest</Pill>
          </button>
          <button onClick={() => setSort("oldest")}>
            <Pill active={sort === "oldest"}>Oldest</Pill>
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={5} height={64} />
      ) : error || !items.length ? (
        <EmptyState icon={<tab.Icon size={22} />} message={tab.empty} />
      ) : (
        <div>
          {items.map((item) => (
            <LibraryRow
              key={item.id}
              item={item}
              Icon={tab.Icon}
              onRename={rename}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryRow({
  item,
  Icon,
  onRename,
}: {
  item: LibraryItem;
  Icon: typeof PenLine;
  onRename: (id: string, title: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.title);
  const [saved, setSaved] = useState(false);

  useEffect(() => setValue(item.title), [item.title]);

  const commit = async () => {
    setEditing(false);
    const next = value.trim();
    if (!next || next === item.title) {
      setValue(item.title);
      return;
    }
    await onRename(item.id, next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="mb-2 flex items-center gap-4 rounded-[10px] border border-line bg-cardx px-5 py-4">
      <Icon size={18} className="shrink-0 text-lime" />

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setValue(item.title);
                setEditing(false);
              }
            }}
            className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[15px] font-semibold text-fg outline-none focus:border-lime focus:shadow-[0_0_0_2px_rgba(82,255,46,0.15)]"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="block max-w-full truncate text-left text-[15px] font-semibold text-fg hover:text-lime"
          >
            {item.title}
          </button>
        )}
      </div>

      {saved && <Check size={15} className="shrink-0 text-lime" />}
      <span className="hidden shrink-0 sm:block">
        <Pill>{item.module}</Pill>
      </span>
      <span className="shrink-0 text-[11px] text-mute">{item.date}</span>
      <GhostBtn>Open →</GhostBtn>
    </div>
  );
}
