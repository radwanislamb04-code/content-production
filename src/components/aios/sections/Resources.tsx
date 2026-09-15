import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Pill, Input, Select, PrimaryBtn, OutlineBtn, SkeletonCards, EmptyState } from "../ui";
import { useApi } from "@/hooks/useApi";
import { X, ExternalLink, Globe, Plus, RefreshCw, Loader2 } from "lucide-react";

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
  iframe?: number | boolean;
  description?: string;
};

const FILTERS = ["All", ...CATEGORIES] as const;

const STATIC_SITES: Site[] = [
  {
    id: "cobalt",
    name: "Cobalt.tools",
    url: "https://cobalt.tools",
    category: "Video Download",
    description: "Clean, ad-free downloader for most social platforms.",
  },
  {
    id: "savefrom",
    name: "SaveFrom.net",
    url: "https://savefrom.net",
    category: "Video Download",
    description: "Multi-site downloader with format options.",
  },
  {
    id: "google-trends",
    name: "Google Trends",
    url: "https://trends.google.com/trends/",
    category: "Trends",
    description: "Search interest over time by region and topic.",
  },
  {
    id: "exploding-topics",
    name: "Exploding Topics",
    url: "https://explodingtopics.com",
    category: "Trends",
    description: "Emerging topics before they go mainstream.",
  },
  {
    id: "socialblade",
    name: "SocialBlade",
    url: "https://socialblade.com",
    category: "Trends",
    description: "Channel growth stats across platforms.",
  },
  {
    id: "trendtok",
    name: "TrendTok",
    url: "https://trendtok.app",
    category: "Trends",
    description: "TikTok sound and hashtag trend tracking.",
  },
  {
    id: "phlanx",
    name: "Phlanx.com",
    url: "https://phlanx.com",
    category: "Creator Research",
    description: "Engagement-rate calculator for creators.",
  },
  {
    id: "noxinfluencer",
    name: "NoxInfluencer.com",
    url: "https://noxinfluencer.com",
    category: "Creator Research",
    description: "Influencer analytics and rate estimates.",
  },
  {
    id: "hypeauditor",
    name: "HypeAuditor",
    url: "https://hypeauditor.com",
    category: "Creator Research",
    description: "Audience quality and fraud detection reports.",
  },
  {
    id: "fb-creator-marketplace",
    name: "FB Creator Marketplace",
    url: "https://www.facebook.com/creators/marketplace",
    category: "Creator Research",
    description: "Brand-creator matchmaking inside Meta.",
  },
  {
    id: "viralfindr",
    name: "ViralFindr",
    url: "https://viralfindr.com",
    category: "Creator Research",
    description: "Find viral creator content by niche.",
  },
  {
    id: "instagram-transcript-generator",
    name: "Instagram Transcript Generator",
    url: "https://saveto.ai/instagram-transcript-generator/",
    category: "Video Download",
    description:
      "Generate accurate text transcripts from Instagram Reels and videos.",
  },
  {
    id: "gemini-watermark-remover",
    name: "Gemini Watermark Remover",
    url: "https://geminiwatermarkremover.io/",
    category: "AI Tools",
    description:
      "AI-powered watermark remover for Gemini-generated images while preserving image quality.",
  },
  {
    id: "google-flow",
    name: "Google Flow",
    url: "https://labs.google/fx/tools/flow",
    category: "AI Video",
    description:
      "Experimental AI filmmaking tool for cinematic videos, scenes and creative storytelling workflows.",
  },
];

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

/* ---------- section ---------- */

export function Resources() {
  const { data, loading, setData } = useApi<Site[]>("/api/resources");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [preview, setPreview] = useState<Site | null>(null);
  const [modal, setModal] = useState(false);

  const sites = useMemo(() => {
    const dynamic = Array.isArray(data) ? data : [];
    const all = [...STATIC_SITES, ...dynamic];
    return filter === "All" ? all : all.filter((s) => s.category === filter);
  }, [data, filter]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-bold text-fg">
            Resources
          </h1>
          <p className="mt-1 text-sm text-fg2">
            Your toolbox of download, trend and creator-research sites
          </p>
        </div>
        <PrimaryBtn className="shrink-0" onClick={() => setModal(true)}>
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
            <SiteCard key={s.id} site={s} onPreview={() => setPreview(s)} />
          ))}
        </div>
      )}

      {preview && (
        <PreviewModal site={preview} onClose={() => setPreview(null)} />
      )}

      {modal && (
        <AddSiteModal
          onClose={() => setModal(false)}
          onAdded={(site) => setData((prev) => [site, ...(prev ?? [])])}
        />
      )}
    </div>
  );
}

function SiteCard({ site, onPreview }: { site: Site; onPreview: () => void }) {

  // The card itself opens the in-app viewer: every resource is browsed inside
  // the app, and a new tab is only ever a last resort on the sites that forbid
  // framing (see the viewer's fallback).
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPreview}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview();
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
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-fg2">
          {site.description ?? hostOf(site.url)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill>Opens in the app</Pill>
          <OutlineBtn onClick={onPreview}>
            <Globe size={14} /> Open in app
          </OutlineBtn>
          <button
            aria-label={`Open ${site.name} in a new tab`}
            title="Last resort — only needed if the site refuses to load in the app"
            onClick={(e) => {
              e.stopPropagation();
              window.open(site.url, "_blank", "noopener,noreferrer");
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-lime"
          >
            <ExternalLink size={15} />
          </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------- in-app site viewer ---------- */

function PreviewModal({ site, onClose }: { site: Site; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    timer.current = setTimeout(() => setFailed(true), 10000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,5,4,0.75)] p-3 backdrop-blur-sm"
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
              {hostOf(site.url)}
            </div>
          </div>
          <button
            aria-label="Refresh preview"
            onClick={() => setNonce((n) => n + 1)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-lime"
          >
            <RefreshCw size={15} />
          </button>
          <button
            aria-label="Open in new tab"
            onClick={() =>
              window.open(site.url, "_blank", "noopener,noreferrer")
            }
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-lime"
          >
            <ExternalLink size={15} />
          </button>
          <button
            aria-label="Close preview"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-mute transition-colors hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-surface">
          {failed ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-[540px] text-center">
                <Globe size={22} className="mx-auto text-mute" />
                <p className="mt-3 text-sm font-semibold text-fg">
                  {site.name} refused to load inside the app
                </p>
                <p className="mt-1 text-xs text-mute">
                  This site replies with X-Frame-Options or a CSP
                  frame-ancestors rule that forbids being shown in another page.
                  Browsers enforce that, so no in-app view can display it.
                  Everything else in the list opens here.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <PrimaryBtn onClick={() => setNonce((n) => n + 1)}>
                    <RefreshCw size={14} /> Try again
                  </PrimaryBtn>
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
              {!loaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface">
                  <Loader2 size={22} className="aios-spin-slow text-lime" />
                  <span className="text-xs text-mute">Loading preview…</span>
                </div>
              )}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- add site ---------- */

function AddSiteModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (site: Site) => void;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("Video Download");
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
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl, name: trimmedName, category }),
      });
      if (!res.ok) throw new Error();
      onAdded((await res.json()) as Site);
      onClose();
    } catch {
      setError("Could not save that site. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(3,5,4,0.7)] p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-xl border border-line bg-cardx p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg">Add Site</h2>
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
              maxLength={500}
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

          {error && <p className="text-xs text-err">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
            <PrimaryBtn onClick={saving ? undefined : submit}>
              {saving ? "Saving..." : "Add Site"}
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
