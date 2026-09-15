import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Modal, OutlineBtn, PrimaryBtn } from "../ui";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

/**
 * Board — a Trello-style kanban, built from what the owner actually asked for:
 * columns you can rename and reorder, cards you can drag between them, labels, due
 * dates, checklists, a description and an inline "Add a card".
 *
 * Positions are REAL numbers, so dropping a card between two others sends the
 * midpoint and no other row moves. Every mutation returns the whole board, which
 * the UI adopts as-is — simpler and more truthful than patching local state and
 * hoping it matches the database.
 */

type CardRow = {
  id: string;
  title: string;
  description: string | null;
  labels: string[];
  dueDate: string | null;
  checklist: { text: string; done: boolean }[];
  position: number;
  comments: { id: string; body: string; createdAt: number }[];
  links: { id: string; libraryId: string; title: string; type: string }[];
  attachments: { id: string; name: string; size: number; type: string | null }[];
};

type ListRow = {
  id: string;
  name: string;
  position: number;
  cards: CardRow[];
};

type BoardData = {
  board: { id: string; name: string };
  labels: string[];
  lists: ListRow[];
};

export function BoardScreen() {
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ card: CardRow; from: string } | null>(null);
  const [overList, setOverList] = useState<string | null>(null);
  const [overCardId, setOverCardId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newList, setNewList] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const apply = useCallback((res: any) => {
    if (res?.ok) {
      const { ok, ...rest } = res;
      setData(rest as BoardData);
      setError(null);
    } else {
      setError(res?.error ?? "Board update failed");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      apply(await apiGet<any>("/api/board"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      apply(await apiPost<any>("/api/board", payload));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /** Midpoint of the neighbours: no renumbering, no other card touched. */
  const positionFor = (list: ListRow, index: number) => {
    const before = list.cards[index - 1];
    const after = list.cards[index];
    if (!before && after) return after.position - 500;
    if (before && !after) return before.position + 500;
    if (before && after) return (before.position + after.position) / 2;
    return 1000;
  };

  const drop = async (list: ListRow, index: number) => {
    const dragged = dragging;
    setDragging(null);
    setOverList(null);
    setOverCardId(null);
    if (!dragged) return;
    const target = list.cards.filter((c) => c.id !== dragged.card.id);
    const insertAt = Math.min(index, target.length);
    const before = target[insertAt - 1];
    const after = target[insertAt];
    let position: number;
    if (!before && after) position = after.position - 500;
    else if (before && !after) position = before.position + 500;
    else if (before && after) position = (before.position + after.position) / 2;
    else position = 1000;
    await act({ action: "move_card", cardId: dragged.card.id, listId: list.id, position });
  };

  const moveByKeyboard = async (card: CardRow, list: ListRow, dir: -1 | 1) => {
    const listIndex = data?.lists.findIndex((l) => l.id === list.id) ?? -1;
    if (listIndex === -1 || !data) return;
    const target = data.lists[listIndex + dir];
    if (!target) return;
    await act({
      action: "move_card",
      cardId: card.id,
      listId: target.id,
      position: (target.cards[target.cards.length - 1]?.position ?? 0) + 500,
    });
  };

  const openCard =
    (data?.lists ?? [])
      .flatMap((l) => l.cards)
      .find((c) => c.id === openId) ?? null;

  if (loading) {
    return (
      <div className="grid min-h-[300px] place-items-center">
        <Loader2 size={20} className="animate-spin text-lime" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">
            {data?.board.name ?? "Board"}
          </h1>
          <p className="mt-1 text-sm text-mute">
            Drag a card between columns · click a card to edit it · positions are saved
            as you drop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy && <span className="text-[11px] text-mute">saving…</span>}
          <OutlineBtn onClick={() => void load()}>Refresh</OutlineBtn>
        </div>
      </div>

      {error && (
        <Card className="border-err p-3">
          <div className="text-[12px] text-err">{error}</div>
        </Card>
      )}

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {(data?.lists ?? []).map((list, li) => (
          <div
            key={list.id}
            className={`w-[290px] shrink-0 rounded-xl border bg-surface p-2.5 ${
              overList === list.id && !overCardId ? "border-lime" : "border-line"
            }`}
            onDragOver={(ev) => {
              if (!dragging) return;
              ev.preventDefault();
              ev.dataTransfer.dropEffect = "move";
              setOverList(list.id);
            }}
            onDrop={(ev) => {
              if (!dragging) return;
              ev.preventDefault();
              void drop(list, list.cards.length);
            }}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                {list.name}
              </span>
              <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] text-mute">
                {list.cards.length}
              </span>
              <button
                aria-label={`Move ${list.name} left`}
                disabled={li === 0}
                onClick={() =>
                  void act({
                    action: "move_list",
                    listId: list.id,
                    position:
                      (data!.lists[li - 1].position + list.position) / 2 ||
                      list.position - 1000,
                  })
                }
                className="grid h-6 w-6 place-items-center rounded text-mute hover:text-lime disabled:opacity-30"
              >
                <ArrowLeft size={12} />
              </button>
              <button
                aria-label={`Move ${list.name} right`}
                disabled={li === (data?.lists.length ?? 0) - 1}
                onClick={() =>
                  void act({
                    action: "move_list",
                    listId: list.id,
                    position:
                      (list.position + data!.lists[li + 1].position) / 2 ||
                      list.position + 1000,
                  })
                }
                className="grid h-6 w-6 place-items-center rounded text-mute hover:text-lime disabled:opacity-30"
              >
                <ArrowRight size={12} />
              </button>
              <button
                aria-label={`Delete ${list.name}`}
                onClick={() => {
                  if (
                    list.cards.length &&
                    !confirm(`Delete “${list.name}” and its ${list.cards.length} card(s)?`)
                  )
                    return;
                  void act({ action: "delete_list", listId: list.id });
                }}
                className="grid h-6 w-6 place-items-center rounded text-mute hover:text-err"
              >
                <Trash2 size={12} />
              </button>
            </div>

            <div className="space-y-2">
              {list.cards.map((c, ci) => {
                const done = c.checklist.filter((i) => i.done).length;
                const overdue =
                  c.dueDate && new Date(c.dueDate).getTime() < Date.now() ? true : false;
                return (
                  <div
                    key={c.id}
                    draggable
                    tabIndex={0}
                    role="button"
                    onDragStart={(ev) => {
                      setDragging({ card: c, from: list.id });
                      ev.dataTransfer.effectAllowed = "move";
                      ev.dataTransfer.setData("text/plain", c.title);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOverList(null);
                      setOverCardId(null);
                    }}
                    onDragOver={(ev) => {
                      if (!dragging || dragging.card.id === c.id) return;
                      ev.preventDefault();
                      ev.stopPropagation();
                      setOverList(list.id);
                      setOverCardId(c.id);
                    }}
                    onDrop={(ev) => {
                      if (!dragging || dragging.card.id === c.id) return;
                      ev.preventDefault();
                      ev.stopPropagation();
                      const others = list.cards.filter((x) => x.id !== dragging.card.id);
                      void drop(list, others.findIndex((x) => x.id === c.id));
                    }}
                    onKeyDown={(ev: ReactKeyboardEvent) => {
                      if (ev.key === "ArrowRight") {
                        ev.preventDefault();
                        void moveByKeyboard(c, list, 1);
                      } else if (ev.key === "ArrowLeft") {
                        ev.preventDefault();
                        void moveByKeyboard(c, list, -1);
                      } else if (ev.key === "Enter") {
                        setOpenId(c.id);
                      }
                    }}
                    onClick={() => setOpenId(c.id)}
                    className={`cursor-grab rounded-lg border bg-cardx p-2.5 transition hover:border-lime active:cursor-grabbing ${
                      overCardId === c.id ? "border-lime ring-1 ring-lime" : "border-line"
                    } ${dragging?.card.id === c.id ? "opacity-40" : ""}`}
                  >
                    {c.labels.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {c.labels.map((l) => (
                          <span
                            key={l}
                            className="rounded-full border border-lime/40 bg-lime/10 px-1.5 py-[1px] text-[10px] text-lime"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-start gap-1.5">
                      <GripVertical size={12} className="mt-0.5 shrink-0 text-mute" />
                      <span className="min-w-0 flex-1 text-[13px] text-fg">{c.title}</span>
                    </div>
                    {(c.dueDate || done > 0) && (
                      <div className="mt-1.5 flex items-center gap-2 pl-4 text-[10px]">
                        {c.dueDate && (
                          <span className={overdue ? "text-err" : "text-mute"}>
                            {c.dueDate}
                          </span>
                        )}
                        {done > 0 && (
                          <span className="text-mute">
                            ✓ {done}/{c.checklist.length}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-2">
              <input
                value={draft[list.id] ?? ""}
                placeholder="Add a card"
                onChange={(e) => setDraft((d) => ({ ...d, [list.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const title = (draft[list.id] ?? "").trim();
                  if (!title) return;
                  void act({ action: "create_card", listId: list.id, title });
                  setDraft((d) => ({ ...d, [list.id]: "" }));
                }}
                className="h-8 w-full rounded-md border border-line bg-cardx px-2 text-[13px] text-fg outline-none placeholder:text-mute focus:border-lime"
              />
            </div>
          </div>
        ))}

        <div className="w-[240px] shrink-0">
          {addingList ? (
            <Card className="space-y-2 p-2.5">
              <input
                autoFocus
                value={newList}
                onChange={(e) => setNewList(e.target.value)}
                placeholder="Column name"
                className="h-8 w-full rounded-md border border-line bg-cardx px-2 text-[13px] text-fg outline-none placeholder:text-mute focus:border-lime"
              />
              <div className="flex items-center gap-2">
                <PrimaryBtn
                  onClick={() => {
                    const name = newList.trim();
                    if (!name) return;
                    void act({ action: "create_list", name });
                    setNewList("");
                    setAddingList(false);
                  }}
                >
                  Add
                </PrimaryBtn>
                <OutlineBtn onClick={() => setAddingList(false)}>Cancel</OutlineBtn>
              </div>
            </Card>
          ) : (
            <OutlineBtn className="w-full" onClick={() => setAddingList(true)}>
              <Plus size={14} /> Add column
            </OutlineBtn>
          )}
        </div>
      </div>

      <CardDetail
        card={openCard}
        labels={data?.labels ?? []}
        onClose={() => setOpenId(null)}
        act={act}
        reload={load}
        onSave={async (patch) => {
          if (!openCard) return;
          await act({ action: "update_card", cardId: openCard.id, ...patch });
          setOpenId(null);
        }}
        onDelete={async () => {
          if (!openCard) return;
          await act({ action: "delete_card", cardId: openCard.id });
          setOpenId(null);
        }}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CardDetail({
  card,
  labels,
  onClose,
  onSave,
  onDelete,
  act,
  reload,
}: {
  card: CardRow | null;
  labels: string[];
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
  act: (payload: Record<string, unknown>) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [linking, setLinking] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; type: string; title: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);

  // The picker searches the user's own library (the search route already returns
  // the latest items when the query is empty).
  useEffect(() => {
    if (!linking) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`)
        .then((r) => r.json())
        .then((rows: any) => {
          if (cancelled) return;
          setResults(
            Array.isArray(rows)
              ? rows
                  .filter((r) => r.id && r.title)
                  .map((r) => ({ id: r.id, type: r.type ?? "", title: r.title }))
                  .slice(0, 12)
              : [],
          );
        })
        .catch(() => {
          /* the picker simply stays empty */
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [linking, query]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [checklist, setChecklist] = useState<{ text: string; done: boolean }[]>([]);
  const [item, setItem] = useState("");

  useEffect(() => {
    if (!card) return;
    setTitle(card.title);
    setDescription(card.description ?? "");
    setPicked(card.labels);
    setDueDate(card.dueDate ?? "");
    setChecklist(card.checklist);
    setItem("");
  }, [card]);

  if (!card) return null;

  return (
    <Modal open={Boolean(card)} onClose={onClose} title="Card">
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs text-mute">Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg outline-none focus:border-lime"
          />
        </div>

        <div>
          <div className="mb-1 text-xs text-mute">Description</div>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-sm text-fg outline-none focus:border-lime"
          />
        </div>

        <div>
          <div className="mb-1 text-xs text-mute">Labels</div>
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => {
              const on = picked.includes(l);
              return (
                <button
                  key={l}
                  onClick={() =>
                    setPicked((p) => (on ? p.filter((x) => x !== l) : [...p, l]))
                  }
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    on ? "border-lime bg-lime/15 text-lime" : "border-line text-fg2"
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs text-mute">Due date</div>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg outline-none focus:border-lime"
          />
        </div>

        <div>
          <div className="mb-1 text-xs text-mute">
            Checklist {checklist.length > 0 && `(${checklist.filter((i) => i.done).length}/${checklist.length})`}
          </div>
          <div className="space-y-1">
            {checklist.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  aria-label={it.done ? "Mark not done" : "Mark done"}
                  onClick={() =>
                    setChecklist((c) =>
                      c.map((x, j) => (j === i ? { ...x, done: !x.done } : x)),
                    )
                  }
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                    it.done ? "border-lime bg-lime text-app" : "border-line"
                  }`}
                >
                  {it.done && <Check size={10} />}
                </button>
                <span
                  className={`min-w-0 flex-1 truncate text-[13px] ${
                    it.done ? "text-mute line-through" : "text-fg"
                  }`}
                >
                  {it.text}
                </span>
                <button
                  aria-label="Remove item"
                  onClick={() => setChecklist((c) => c.filter((_, j) => j !== i))}
                  className="text-mute hover:text-err"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <input
            value={item}
            placeholder="Add an item"
            onChange={(e) => setItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !item.trim()) return;
              setChecklist((c) => [...c, { text: item.trim(), done: false }]);
              setItem("");
            }}
            className="mt-2 h-8 w-full rounded-md border border-line bg-surface px-2 text-[13px] text-fg outline-none placeholder:text-mute focus:border-lime"
          />
        </div>
      </div>

      {/* ---- linked Content OS items ---- */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-mute">Linked content</span>
          <button
            onClick={() => setLinking((v) => !v)}
            className="text-[11px] text-lime hover:underline"
          >
            {linking ? "Close" : "Link content"}
          </button>
        </div>
        {card.links.length === 0 && !linking && (
          <div className="text-[11px] text-mute">
            Not linked to an idea, script or storyboard yet.
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {card.links.map((l) => (
            <span
              key={l.id}
              className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg2"
            >
              <span className="max-w-[200px] truncate">{l.title}</span>
              {l.type && <span className="text-mute">· {l.type}</span>}
              <button
                aria-label={`Unlink ${l.title}`}
                onClick={() => void act({ action: "unlink_item", linkId: l.id })}
                className="text-mute hover:text-err"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        {linking && (
          <div className="mt-2 rounded-md border border-line bg-surface p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library…"
              className="h-8 w-full rounded-md border border-line bg-cardx px-2 text-[13px] text-fg outline-none placeholder:text-mute focus:border-lime"
            />
            <div className="mt-1 max-h-[150px] overflow-auto">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    void act({ action: "link_item", cardId: card.id, libraryId: r.id });
                    setLinking(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left hover:bg-cardhi"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-fg">
                    {r.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-mute">{r.type}</span>
                </button>
              ))}
              {!results.length && (
                <div className="px-1.5 py-2 text-[11px] text-mute">
                  {query.trim() ? "Nothing matched." : "Your latest items appear here."}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---- attachments (R2) ---- */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-mute">Attachments</span>
          <label className="cursor-pointer text-[11px] text-lime hover:underline">
            {uploading ? "Uploading…" : "Add file"}
            <input
              type="file"
              className="hidden"
              accept="image/*,application/pdf,text/*,video/mp4"
              onChange={async (ev) => {
                const file = ev.target.files?.[0];
                ev.target.value = "";
                if (!file) return;
                setUploading(true);
                try {
                  const fd = new FormData();
                  fd.append("cardId", card.id);
                  fd.append("file", file);
                  const res = await fetch("/api/board-attach", { method: "POST", body: fd });
                  const json = await res.json().catch(() => null);
                  if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
                  await reload();
                } catch (err: any) {
                  toast.error(err?.message ?? "Upload failed");
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </div>
        {card.attachments.length === 0 ? (
          <div className="text-[11px] text-mute">
            Images, PDF, video or text — up to 5 MB each.
          </div>
        ) : (
          <div className="space-y-1">
            {card.attachments.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-[12px]">
                <a
                  href={`/api/board-attach?id=${encodeURIComponent(f.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-lime hover:underline"
                >
                  {f.name}
                </a>
                <span className="shrink-0 text-[10px] text-mute">
                  {formatBytes(f.size)}
                </span>
                <button
                  aria-label={`Remove ${f.name}`}
                  onClick={() => void act({ action: "delete_attachment", attachmentId: f.id })}
                  className="text-mute hover:text-err"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- comments ---- */}
      <div className="mt-3">
        <div className="mb-1 text-xs text-mute">
          Comments {card.comments.length > 0 && `(${card.comments.length})`}
        </div>
        {card.comments.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {card.comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2 rounded-md border border-line bg-surface p-2">
                <span className="min-w-0 flex-1 whitespace-pre-wrap text-[12px] text-fg">
                  {c.body}
                </span>
                <span className="shrink-0 text-[10px] text-mute">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
                <button
                  aria-label="Delete comment"
                  onClick={() => void act({ action: "delete_comment", commentId: c.id })}
                  className="shrink-0 text-mute hover:text-err"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          value={comment}
          placeholder="Write a note — Enter to save"
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !comment.trim()) return;
            void act({ action: "add_comment", cardId: card.id, body: comment.trim() });
            setComment("");
          }}
          className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[13px] text-fg outline-none placeholder:text-mute focus:border-lime"
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={() => void onDelete()}
          className="text-[11px] text-err hover:underline"
        >
          Delete card
        </button>
        <div className="flex items-center gap-2">
          <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
          <PrimaryBtn
            onClick={() =>
              void onSave({
                title: title.trim() || card.title,
                description: description.trim() || null,
                labels: picked,
                dueDate: dueDate || null,
                checklist,
              })
            }
          >
            Save
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}
