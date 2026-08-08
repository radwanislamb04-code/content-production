import { useEffect, useMemo, useState } from "react";
import {
  Pill,
  Input,
  EmptyState,
  SkeletonList,
  GhostBtn,
  Card,
  PrimaryBtn,
  OutlineBtn,
  Textarea,
} from "../ui";
import { apiGet, apiPut, apiDelete, errorMessage } from "@/lib/api";
import { toast } from "sonner";
import type { LibraryRow } from "@/lib/content-types";
import { PenLine, LayoutPanelLeft, Film, Lightbulb, Check, X } from "lucide-react";

const TABS = [
  { label: "Scripts", slug: "script", Icon: PenLine, empty: "No scripts saved yet — generate one in Script & Hook." },
  { label: "Storyboards", slug: "storyboard", Icon: LayoutPanelLeft, empty: "No storyboards yet — build one in Storyboard." },
  { label: "Video Prompts", slug: "video_prompt", Icon: Film, empty: "No video prompts yet — create one in Video Prompt." },
  { label: "Ideas", slug: "idea", Icon: Lightbulb, empty: "No ideas saved yet — capture some in Ideator." },
] as const;

type Tab = (typeof TABS)[number];

export function Library() {
  const [tab, setTab] = useState<Tab>(TABS[0]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-bold text-fg">Library</h1>
        <p className="mt-1 text-sm text-fg2">All your saved content in one place</p>
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

function formatDate(ts?: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function LibraryList({ tab }: { tab: Tab }) {
  const [items, setItems] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<LibraryRow[]>(`/api/library/${tab.slug}`)
      .then((rows) => {
        if (!cancelled) setItems(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab.slug]);

  const visible = useMemo(() => {
    const list = items.filter((i) =>
      (i.title ?? "").toLowerCase().includes(query.trim().toLowerCase()),
    );
    return [...list].sort((a, b) =>
      sort === "newest"
        ? (b.created_at ?? 0) - (a.created_at ?? 0)
        : (a.created_at ?? 0) - (b.created_at ?? 0),
    );
  }, [items, query, sort]);

  const rename = async (id: string, title: string) => {
    const prev = items;
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, title } : i)));
    try {
      await apiPut(`/api/library/${tab.slug}/${id}`, { title });
    } catch (err) {
      setItems(prev);
      toast.error(errorMessage(err));
    }
  };

  const remove = async (id: string) => {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== id));
    if (openId === id) setOpenId(null);
    try {
      await apiDelete(`/api/library/${tab.slug}/${id}`);
      toast.success("Deleted");
    } catch (err) {
      setItems(prev);
      toast.error(errorMessage(err));
    }
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
          <span className="hidden sm:inline">Sort</span>
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
      ) : !visible.length ? (
        <EmptyState icon={<tab.Icon size={22} />} message={tab.empty} />
      ) : (
        <div>
          {visible.map((item) => (
            <LibraryRowView
              key={item.id}
              item={item}
              Icon={tab.Icon}
              onRename={rename}
              onOpen={() => setOpenId(item.id)}
              onDelete={() => remove(item.id)}
            />
          ))}
        </div>
      )}

      {openId && (
        <DetailModal
          type={tab.slug}
          id={openId}
          onClose={() => setOpenId(null)}
          onSaved={(row) =>
            setItems((cur) => cur.map((i) => (i.id === row.id ? { ...i, ...row } : i)))
          }
        />
      )}
    </div>
  );
}

function LibraryRowView({
  item,
  Icon,
  onRename,
  onOpen,
  onDelete,
}: {
  item: LibraryRow;
  Icon: typeof PenLine;
  onRename: (id: string, title: string) => Promise<void>;
  onOpen: () => void;
  onDelete: () => void;
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
    <div className="mb-2 flex items-center gap-3 rounded-[10px] border border-line bg-cardx px-4 py-4 sm:gap-4 sm:px-5">
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
      {item.content_pillar && (
        <span className="hidden shrink-0 sm:block">
          <Pill>{item.content_pillar}</Pill>
        </span>
      )}
      <span className="hidden shrink-0 text-[11px] text-mute sm:block">
        {formatDate(item.created_at)}
      </span>
      <GhostBtn onClick={onOpen}>Open →</GhostBtn>
      <button
        onClick={onDelete}
        aria-label="Delete"
        className="shrink-0 text-mute transition-colors hover:text-err"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function DetailModal({
  type,
  id,
  onClose,
  onSaved,
}: {
  type: string;
  id: string;
  onClose: () => void;
  onSaved: (row: LibraryRow) => void;
}) {
  const [row, setRow] = useState<LibraryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<LibraryRow>(`/api/library/${type}/${id}`)
      .then((data) => {
        if (cancelled) return;
        setRow(data);
        setTitle(data.title ?? "");
        setContent(
          typeof data.content === "string"
            ? data.content
            : JSON.stringify(data.content ?? "", null, 2),
        );
      })
      .catch((err) => !cancelled && toast.error(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  const save = async () => {
    setSaving(true);
    try {
      await apiPut(`/api/library/${type}/${id}`, { title, content });
      onSaved({ ...(row as LibraryRow), title, content });
      toast.success("Saved");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={onClose}
    >
      <Card
        elevated
        className="max-h-[85vh] w-full max-w-2xl overflow-auto p-5"
        // eslint-disable-next-line
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-[15px] font-semibold text-fg">Edit item</div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-mute hover:text-fg"
            >
              <X size={18} />
            </button>
          </div>

          {loading ? (
            <SkeletonList rows={3} height={48} />
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-mute">
                  Title
                </div>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-mute">
                  Content
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  style={{ minHeight: 260 }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
                <PrimaryBtn onClick={save} loading={saving}>
                  Save
                </PrimaryBtn>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
