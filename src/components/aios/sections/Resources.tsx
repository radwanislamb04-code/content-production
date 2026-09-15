import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  EmptyState,
  Input,
  OutlineBtn,
  Pill,
  PrimaryBtn,
  Select,
  SkeletonCards,
} from "../ui";
import { useApi } from "@/hooks/useApi";
import {
  BookOpen,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

/**
 * Resources — your saved sites, straight from the database.
 *
 * The list used to be a hardcoded array merged with the database rows, so the
 * built-in sites could not be edited or deleted. Everything now lives in the
 * `resources` table (seeded once from the old array, is_custom = 0), and this
 * screen can add, edit and delete.
 *
 * Opening a site happens inside the app. Sites that forbid framing get a second
 * in-app option: the reader, which shows the page's extracted text.
 */

export const CATEGORIES = [
  "Video Download",
  "Trends",
  "Creator Research",
  "Writing",
  "AI Tools",
  "AI Video",
] as const;

type Category = (typeof CATEGORIES)[number];

type Site = {
  id: string;
  name: string;
  url: string;
  category: Category;
  description?: string | null;
  is_custom?: number | boolean | null;
};

type ReaderPayload = {
  ok: boolean;
  title?: string;
  description?: string;
  headings?: string[];
  paragraphs?: string[];
  links?: { text: string; href: string }[];
  chars?: number;
  truncated?: boolean;
  finalUrl?: string;
  fetchedAt?: number;
  error?: string;
};

const FILTERS = ["All", ...CATEGORIES] as const;

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function favicon(url: string) {
  const host = hostOf(url);
  return host
    ? `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    : "";
}

function isBuiltIn(site: Site) {
  return site.is_custom === 0 || site.is_custom === false;
}

/* ---------- section ---------- */

export function Resources() {
  const { data, loading, setData } = useApi<Site[]>("/api/resources");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [preview, setPreview] = useState<Site | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sites = useMemo(() => {
    const all = Array.isArray(data) ? data : [];
    return filter === "All" ? all : all.filter((s) => s.category === filter);
  }, [data, filter]);

  const upsert = (site: Site) =>
    setData((prev) => {
      const list = prev ?? [];
      const at = list.findIndex((s) => s.id === site.id);
      if (at === -1) return [site, ...list];
      const next = list.slice();
      next[at] = site;
      return next;
    });

  const remove = async (site: Site) => {
    setBusyId(site.id);
    try {
      const res = await fetch(`/api/resources/${encodeURIComponent(site.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? "Could not delete that site");
        return;
      }
      setData((prev) => (prev ?? []).filter((s) => s.id !== site.id));
      toast.success(`${site.name} deleted`);
    } catch (err: any) {
      toast.error(`Could not delete: ${err?.message ?? "network error"}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="text-sm text-mute">
            Your toolbox of download, trend and creator-research sites. Click any
            card to open it inside the app.
          </p>
        </div>
        <PrimaryBtn
          className="shrink-0"
          onClick={() => {
            setEditing(null);
            setModal(true);
          }}
        >
          <Plus size={16} /> Add Site
        </PrimaryBtn>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}>
            <Pill active={filter === f}>{f}</Pill>
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : !sites.length ? (
        <EmptyState
          icon={<Globe size={22} />}
          message="No sites in this category yet — add one with “Add Site”."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sites.map((s) => (
            <SiteCard
              key={s.id}
              site={s}
              busy={busyId === s.id}
              onOpen={() => setPreview(s)}
              onEdit={() => {
                setEditing(s);
                setModal(true);
              }}
              onDelete={() => remove(s)}
            />
          ))}
        </div>
      )}

      {preview && (
        <SiteViewer site={preview} onClose={() => setPreview(null)} />
      )}

      {modal && (
        <SiteModal
          site={editing}
          onClose={() => setModal(false)}
          onSaved={(site) => {
            upsert(site);
            setModal(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------- card ---------- */

function SiteCard({
  site,
  busy,
  onOpen,
  onEdit,
  onDelete,
}: {
  site: Site;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-lime"
    >
      <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-lime">
        <img
          src={favicon(site.url)}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          className="mt-0.5 h-7 w-7 shrink-0 rounded-md bg-surface"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-fg">
              {site.name}
            </span>
            <Pill variant="accent">{site.category}</Pill>
            {isBuiltIn(site) && <Pill>Built-in</Pill>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-fg2">
            {site.description || hostOf(site.url)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <OutlineBtn onClick={onOpen}>
              <Globe size={14} /> Open in app
            </OutlineBtn>

            {confirming ? (
              <>
                {/* OutlineBtn takes no event argument, so the click is caught on
                    a wrapper that stops the card's own "open" handler. */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <OutlineBtn>
                    <Trash2 size={14} /> Confirm delete
                  </OutlineBtn>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirming(false);
                  }}
                >
                  <OutlineBtn>Cancel</OutlineBtn>
                </div>
              </>
            ) : (
              <>
                <button
                  aria-label={`Edit ${site.name}`}
                  title="Edit this site"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-lime"
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={`Delete ${site.name}`}
                  title="Delete this site"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirming(true);
                  }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-err disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 size={15} className="aios-spin-slow" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
                <button
                  aria-label={`Open ${site.name} in a new tab`}
                  title="Last resort — only needed if the site refuses to load or be read in the app"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(site.url, "_blank", "noopener,noreferrer");
                  }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-lime"
                >
                  <ExternalLink size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------- in-app viewer ---------- */

function SiteViewer({ site, onClose }: { site: Site; onClose: () => void }) {
  const [mode, setMode] = useState<"page" | "reader">("page");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [frameReason, setFrameReason] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // reader state
  const [readerUrl, setReaderUrl] = useState(site.url);
  const [reading, setReading] = useState(false);
  const [reader, setReader] = useState<ReaderPayload | null>(null);

  /**
   * Ask the server whether this site forbids framing BEFORE mounting the iframe.
   * A blocked frame still fires `load` (with the browser's error page inside it),
   * so without this check the user just saw Chrome's "refused to connect" or
   * Google's own 403 page instead of our explanation.
   */
  useEffect(() => {
    if (mode !== "page") return;
    let cancelled = false;
    setChecking(true);
    setFailed(false);
    setLoaded(false);
    setFrameReason(null);
    fetch(`/api/frame-check?url=${encodeURIComponent(site.url)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d && d.framed === false) {
          setFrameReason(d.reason ?? null);
          setFailed(true);
        }
      })
      .catch(() => {
        /* unknown — still try the frame */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce, mode, site.url]);

  useEffect(() => {
    if (mode !== "page" || checking || failed) return;
    timer.current = setTimeout(() => setFailed(true), 10000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [nonce, mode, checking, failed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadReader = (url: string) => {
    setMode("reader");
    setReaderUrl(url);
    setReading(true);
    setReader(null);
    fetch(`/api/reader?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d: ReaderPayload) => setReader(d))
      .catch((err: any) =>
        setReader({ ok: false, error: `Could not read the page: ${err?.message}` }),
      )
      .finally(() => setReading(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-3 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl border border-line bg-cardx"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <img
            src={favicon(site.url)}
            alt=""
            width={18}
            height={18}
            className="h-[18px] w-[18px] shrink-0 rounded"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-fg">
              {site.name}
            </div>
            <div className="truncate text-[11px] text-mute">
              {mode === "reader" ? `reading ${hostOf(readerUrl)}` : hostOf(site.url)}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-full border border-line p-0.5">
            <button
              onClick={() => setMode("page")}
              className={`h-7 rounded-full px-3 text-[11px] ${
                mode === "page" ? "bg-lime font-bold text-app" : "text-fg2"
              }`}
            >
              Page
            </button>
            <button
              onClick={() =>
                mode === "reader" && reader ? setMode("reader") : loadReader(site.url)
              }
              className={`h-7 rounded-full px-3 text-[11px] ${
                mode === "reader" ? "bg-lime font-bold text-app" : "text-fg2"
              }`}
            >
              Reader
            </button>
          </div>

          <button
            aria-label="Reload"
            onClick={() => {
              if (mode === "reader") loadReader(readerUrl);
              else setNonce((n) => n + 1);
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-lime"
          >
            <RefreshCw size={15} />
          </button>
          <button
            aria-label="Open in new tab"
            title="Opens in a new tab — only needed for sites that block in-app viewing"
            onClick={() => window.open(site.url, "_blank", "noopener,noreferrer")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-lime"
          >
            <ExternalLink size={15} />
          </button>
          <button
            aria-label="Close"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-surface">
          {mode === "reader" ? (
            <ReaderPane
              state={reader}
              loading={reading}
              url={readerUrl}
              onFollow={(href) => loadReader(href)}
            />
          ) : failed ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-[560px] text-center">
                <Globe size={22} className="mx-auto text-mute" />
                <p className="mt-3 text-sm font-semibold text-fg">
                  {frameReason
                    ? `${site.name} does not allow being shown inside another page`
                    : `${site.name} did not load inside the app`}
                </p>
                <p className="mt-1 text-xs text-mute">
                  {frameReason
                    ? `The site replies with “${frameReason}”, and browsers enforce that — no in-app view can display it.`
                    : "It may need more time, or it may quietly block embedded views."}{" "}
                  Reader view fetches the page server-side and shows its text here
                  instead: useful for articles and docs, but a dashboard drawn with
                  JavaScript will say so honestly.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <PrimaryBtn onClick={() => loadReader(site.url)}>
                    <BookOpen size={14} /> Read here instead
                  </PrimaryBtn>
                  <OutlineBtn onClick={() => setNonce((n) => n + 1)}>
                    <RefreshCw size={14} /> Try page again
                  </OutlineBtn>
                  <OutlineBtn
                    onClick={() =>
                      window.open(site.url, "_blank", "noopener,noreferrer")
                    }
                  >
                    Open externally <ExternalLink size={14} />
                  </OutlineBtn>
                </div>
              </div>
            </div>
          ) : (
            <>
              {(!loaded || checking) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface">
                  <Loader2 size={22} className="aios-spin-slow text-lime" />
                  <span className="text-xs text-mute">
                    {checking ? "Checking whether it allows an in-app view…" : "Loading page…"}
                  </span>
                </div>
              )}
              {!checking && (
                <iframe
                  key={nonce}
                  src={site.url}
                  title={site.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation"
                  onLoad={() => {
                    if (timer.current) clearTimeout(timer.current);
                    setLoaded(true);
                  }}
                  onError={() => setFailed(true)}
                  className="h-full w-full border-0 bg-surface"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- reader pane ---------- */

function ReaderPane({
  state,
  loading,
  url,
  onFollow,
}: {
  state: ReaderPayload | null;
  loading: boolean;
  url: string;
  onFollow: (href: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 size={22} className="aios-spin-slow text-lime" />
        <span className="text-xs text-mute">Reading the page…</span>
      </div>
    );
  }
  if (!state) return null;

  if (!state.ok) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-[520px] text-center">
          <BookOpen size={22} className="mx-auto text-mute" />
          <p className="mt-3 text-sm font-semibold text-fg">
            Nothing readable at {hostOf(url)}
          </p>
          <p className="mt-1 text-xs text-mute">{state.error}</p>
          <div className="mt-4 flex justify-center">
            <OutlineBtn
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              Open externally <ExternalLink size={14} />
            </OutlineBtn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-[760px] px-6 py-6">
      <h1 className="text-lg font-semibold text-fg">{state.title}</h1>
      {state.description && (
        <p className="mt-1 text-sm text-fg2">{state.description}</p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-mute">
        <span>Read from {hostOf(state.finalUrl ?? url)}</span>
        {state.fetchedAt && (
          <span>
            · fetched{" "}
            {new Date(state.fetchedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        {state.chars ? <span>· {state.chars.toLocaleString()} characters</span> : null}
        {state.truncated && <span>· truncated</span>}
      </p>

      <div className="mt-5 space-y-3">
        {state.paragraphs?.map((p, i) => (
          <p key={i} className="text-[13.5px] leading-relaxed text-fg2">
            {p}
          </p>
        ))}
      </div>

      {state.headings?.length ? (
        <div className="mt-6 border-t border-line pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-mute">
            Headings on the page
          </div>
          <ul className="mt-2 space-y-1">
            {state.headings.map((h, i) => (
              <li key={i} className="text-[13px] text-fg2">
                • {h}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.links?.length ? (
        <div className="mt-6 border-t border-line pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-mute">
            Links (read them here)
          </div>
          <ul className="mt-2 space-y-1">
            {state.links.map((l) => (
              <li key={l.href}>
                <button
                  onClick={() => onFollow(l.href)}
                  className="text-left text-[13px] text-fg2 hover:text-lime"
                >
                  {l.text}{" "}
                  <span className="text-mute">· {hostOf(l.href)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

/* ---------- add / edit ---------- */

function SiteModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site | null;
  onClose: () => void;
  onSaved: (site: Site) => void;
}) {
  const editing = Boolean(site);
  const [url, setUrl] = useState(site?.url ?? "");
  const [name, setName] = useState(site?.name ?? "");
  const [category, setCategory] = useState<Category>(site?.category ?? "Video Download");
  const [description, setDescription] = useState(site?.description ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmedUrl = url.trim();
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 80) {
      setError("Enter a name (max 80 characters).");
      return;
    }
    try {
      new URL(trimmedUrl);
    } catch {
      setError("Enter a full URL, e.g. https://example.com");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const body = {
        url: trimmedUrl,
        name: trimmedName,
        category,
        description: description.trim() || null,
      };
      const res = await fetch(
        editing ? `/api/resources/${encodeURIComponent(site!.id)}` : "/api/resources",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        setError(json?.error ?? "Could not save that site. Try again.");
        return;
      }
      onSaved((json.resource ?? json) as Site);
      toast.success(editing ? "Site updated" : "Site added");
    } catch (err: any) {
      setError(`Could not save: ${err?.message ?? "network error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-xl border border-line bg-cardx p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg">
            {editing ? "Edit Site" : "Add Site"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-mute hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs text-fg2">
            URL
            <Input
              className="mt-1"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </label>
          <label className="block text-xs text-fg2">
            Name
            <Input
              className="mt-1"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Example Tool"
            />
          </label>
          <label className="block text-xs text-fg2">
            Category
            <Select
              className="mt-1"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </label>
          <label className="block text-xs text-fg2">
            Note (optional)
            <Input
              className="mt-1"
              value={description ?? ""}
              maxLength={300}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What you use it for"
            />
          </label>

          {error && <p className="text-xs text-err">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
            <PrimaryBtn onClick={saving ? undefined : submit}>
              {saving ? "Saving..." : editing ? "Save changes" : "Add Site"}
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
