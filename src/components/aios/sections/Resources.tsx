import { useMemo, useState } from "react";
import { Card, Pill, Input, Select, PrimaryBtn, OutlineBtn, SkeletonCards, EmptyState } from "../ui";
import { useApi } from "@/hooks/useApi";
import { X, ExternalLink, Globe, Plus } from "lucide-react";

type Category = "Video Download" | "Trends" | "Creator Research";

type Site = {
  id: string;
  name: string;
  url: string;
  category: Category;
  iframe: number | boolean;
  description?: string;
};

const FILTERS = ["All", "Video Download", "Trends", "Creator Research"] as const;

const STATIC_SITES: Site[] = [
  {
    id: "cobalt",
    name: "Cobalt.tools",
    url: "https://cobalt.tools",
    category: "Video Download",
    iframe: true,
    description: "Clean, ad-free downloader for most social platforms.",
  },
  {
    id: "google-trends",
    name: "Google Trends",
    url: "https://trends.google.com/trends/",
    category: "Trends",
    iframe: true,
    description: "Search interest over time by region and topic.",
  },
  {
    id: "exploding-topics",
    name: "Exploding Topics",
    url: "https://explodingtopics.com",
    category: "Trends",
    iframe: false,
    description: "Emerging topics before they go mainstream.",
  },
  {
    id: "socialblade",
    name: "SocialBlade",
    url: "https://socialblade.com",
    category: "Trends",
    iframe: false,
    description: "Channel growth stats across platforms.",
  },
  {
    id: "trendtok",
    name: "TrendTok",
    url: "https://trendtok.app",
    category: "Trends",
    iframe: false,
    description: "TikTok sound and hashtag trend tracking.",
  },
  {
    id: "phlanx",
    name: "Phlanx.com",
    url: "https://phlanx.com",
    category: "Creator Research",
    iframe: false,
    description: "Engagement-rate calculator for creators.",
  },
  {
    id: "noxinfluencer",
    name: "NoxInfluencer.com",
    url: "https://noxinfluencer.com",
    category: "Creator Research",
    iframe: false,
    description: "Influencer analytics and rate estimates.",
  },
  {
    id: "hypeauditor",
    name: "HypeAuditor",
    url: "https://hypeauditor.com",
    category: "Creator Research",
    iframe: false,
    description: "Audience quality and fraud detection reports.",
  },
  {
    id: "fb-creator-marketplace",
    name: "FB Creator Marketplace",
    url: "https://www.facebook.com/creators/marketplace",
    category: "Creator Research",
    iframe: false,
    description: "Brand-creator matchmaking inside Meta.",
  },
  {
    id: "viralfindr",
    name: "ViralFindr",
    url: "https://viralfindr.com",
    category: "Creator Research",
    iframe: false,
    description: "Find viral creator content by niche.",
  },
];

function favicon(url: string) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return "";
  }
}

export function Resources() {
  const { data, loading, setData } = useApi<Site[]>("/api/resources");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [preview, setPreview] = useState<Site[]>([]);
  const [modal, setModal] = useState(false);

  const sites = useMemo(() => {
    const dynamic = Array.isArray(data) ? data : [];
    const all = [...STATIC_SITES, ...dynamic];
    return filter === "All" ? all : all.filter((s) => s.category === filter);
  }, [data, filter]);

  const open = (site: Site) => {
    if (site.iframe) {
      setPreview((prev) =>
        prev.some((p) => p.id === site.id)
          ? prev
          : [site, ...prev].slice(0, 2),
      );
    } else {
      window.open(site.url, "_blank", "noopener,noreferrer");
    }
  };

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
            <SiteCard key={s.id} site={s} onOpen={() => open(s)} />
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Preview</h2>
            <OutlineBtn onClick={() => setPreview([])}>Close all</OutlineBtn>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {preview.map((p) => (
              <Card key={p.id} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <span className="min-w-0 truncate text-sm font-semibold text-fg">
                    {p.name}
                  </span>
                  <button
                    aria-label={`Close ${p.name} preview`}
                    onClick={() =>
                      setPreview((prev) => prev.filter((x) => x.id !== p.id))
                    }
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-mute hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>
                <iframe
                  src={p.url}
                  title={p.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  className="h-[360px] w-full border-0 bg-surface"
                />
              </Card>
            ))}
          </div>
        </div>
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

function SiteCard({ site, onOpen }: { site: Site; onOpen: () => void }) {
  const embeddable = Boolean(site.iframe);
  return (
    <Card className="flex items-start gap-3 p-4">
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
        <p className="mt-1 truncate text-sm text-fg2">
          {site.description ?? site.url}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill variant={embeddable ? "accent" : "default"}>
            {embeddable ? "✅ Opens in page" : "🔗 Opens in new tab"}
          </Pill>
          <OutlineBtn onClick={onOpen}>
            {embeddable ? "Preview" : (<><ExternalLink size={14} /> Open</>)}
          </OutlineBtn>
        </div>
      </div>
    </Card>
  );
}

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
              <option>Video Download</option>
              <option>Trends</option>
              <option>Creator Research</option>
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
