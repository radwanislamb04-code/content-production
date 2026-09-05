import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, Database } from "lucide-react";
import { Badge, Card, OutlineBtn, PrimaryBtn } from "../ui";

type Status = "ok" | "error" | "never" | "nokey";

type Source = {
  id: string;
  name: string;
  fetchTag: string;
  status: Status;
  keySlot?: string;
  error?: string;
};

const SOURCES: Source[] = [
  { id: "ig-competitors", name: "Instagram — Competitors", fetchTag: "via Apify", status: "nokey", keySlot: "Key slot 1 — Radwan" },
  { id: "ig-hashtags", name: "Instagram — Hashtags", fetchTag: "via Apify", status: "nokey", keySlot: "Key slot 2 — Radwan" },
  { id: "tiktok", name: "TikTok", fetchTag: "via Apify", status: "nokey", keySlot: "Key slot 3 — Radwan" },
  { id: "x", name: "X (Twitter)", fetchTag: "via Apify", status: "nokey", keySlot: "Key slot 4 — Radwan" },
  { id: "hn", name: "Hacker News", fetchTag: "no key required", status: "never" },
  { id: "reddit", name: "Reddit", fetchTag: "needs Reddit app credentials", status: "nokey" },
  { id: "producthunt", name: "Product Hunt", fetchTag: "needs a developer token", status: "nokey" },
  { id: "youtube", name: "YouTube", fetchTag: "needs a YouTube Data API key", status: "nokey" },
  { id: "serpapi", name: "SerpApi", fetchTag: "needs a SerpApi key", status: "nokey" },
];

const STATUS_META: Record<
  Status,
  { label: string; tone: "success" | "danger" | "neutral" | "warning" }
> = {
  ok: { label: "OK", tone: "success" },
  error: { label: "Error", tone: "danger" },
  never: { label: "Never run", tone: "neutral" },
  nokey: { label: "No key", tone: "warning" },
};

function Toggle({ label }: { label: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Enable ${label}`}
      onClick={() => setOn((v) => !v)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
        on ? "border-lime bg-lime" : "border-line bg-surface"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all ${
          on ? "left-[22px] bg-app" : "left-0.5 bg-mute"
        }`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

function StatTile({ label }: { label: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-sm font-semibold text-fg">{label}</div>
    </Card>
  );
}

function SourceCard({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[source.status];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg">{source.name}</div>
          <div className="mt-0.5 text-xs text-mute">{source.fetchTag}</div>
        </div>
        <Toggle label={source.name} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <div className="mt-3 space-y-1 text-xs text-fg2">
        <div>Last fetched: —</div>
        <div>Items fetched: 0</div>
        {source.keySlot && <div className="text-mute">{source.keySlot}</div>}
      </div>

      <div className="mt-4">
        <OutlineBtn className="h-9">Run now</OutlineBtn>
      </div>

      {source.status === "error" && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-md text-xs text-err outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app"
          >
            <ChevronDown
              size={13}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            />
            Error details
          </button>
          {open && (
            <p className="mt-2 rounded-lg border border-[rgba(255,93,93,0.3)] bg-surface p-3 text-xs text-fg2">
              {source.error ?? "No error message available."}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export function SourcesScreen() {
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <Database size={18} className="text-mute" />
        <h1 className="text-[clamp(1.25rem,5vw,1.6rem)] font-bold text-fg">Sources</h1>
      </div>

      <div
        role="status"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-[rgba(246,196,83,0.3)] bg-[rgba(246,196,83,0.1)] px-4 py-3 text-sm text-fg2"
      >
        <AlertTriangle size={16} className="text-warn" />
        <span>No API keys configured yet.</span>
        <Link
          to="/settings"
          className="rounded-md font-semibold text-lime underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-app"
        >
          Add them in Settings &gt; API Keys.
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`${SOURCES.length} sources`} />
        <StatTile label="0 active" />
        <StatTile label="0 errors" />
        <StatTile label="Last run —" />
      </div>

      <PrimaryBtn>Run all sources now</PrimaryBtn>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SOURCES.map((s) => (
          <SourceCard key={s.id} source={s} />
        ))}
      </div>
    </div>
  );
}
