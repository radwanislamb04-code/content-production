import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, Database, CheckCircle2 } from "lucide-react";
import { Badge, Card, OutlineBtn, PrimaryBtn } from "../ui";

type Status = "ok" | "error" | "never" | "nokey" | "running";

type Masked = { configured: boolean; last4: string | null };

type SettingsSnapshot = {
  data: {
    youtube: Masked;
    serpapi: Masked;
    redditId: Masked;
    redditSecret: Masked;
    producthunt: Masked;
  };
  apify: {
    slots: {
      id: number;
      label: string;
      job: string;
      configured: boolean;
      last4: string | null;
    }[];
  };
  instagram: { handle: string | null; competitors: string[] };
};

type KeyCheck = { ready: boolean; note: string };

type Def = {
  id: string;
  name: string;
  fetchTag: string;
  keySlot?: string;
  /** How to tell whether this source can run right now. */
  check: (s: SettingsSnapshot | null) => KeyCheck;
  /** Which endpoint "Run now" calls; undefined = not implemented yet. */
  run?: "youtube" | "google" | "instagram";
};

const apifySlot = (s: SettingsSnapshot | null, job: string) =>
  s?.apify.slots.find((x) => x.job === job && x.configured);

const apifyCheck = (job: string, slotLabel: string) => (s: SettingsSnapshot | null): KeyCheck => {
  const slot = apifySlot(s, job);
  return slot
    ? { ready: true, note: slotLabel }
    : { ready: false, note: `${slotLabel} — no Apify token in that slot` };
};

const DEFS: Def[] = [
  {
    id: "ig-competitors",
    name: "Instagram — Competitors",
    fetchTag: "via Apify",
    keySlot: "Key slot 1 — Radwan",
    check: apifyCheck("Instagram competitor", "Apify slot: Instagram competitor"),
    run: "instagram",
  },
  {
    id: "ig-hashtags",
    name: "Instagram — Hashtags",
    fetchTag: "via Apify",
    keySlot: "Key slot 2 — Radwan",
    check: apifyCheck("Instagram hashtag", "Apify slot: Instagram hashtag"),
  },
  {
    id: "tiktok",
    name: "TikTok",
    fetchTag: "via Apify",
    keySlot: "Key slot 3 — Radwan",
    check: apifyCheck("TikTok", "Apify slot: TikTok"),
  },
  {
    id: "x",
    name: "X (Twitter)",
    fetchTag: "via Apify",
    keySlot: "Key slot 4 — Radwan",
    check: apifyCheck("X (Twitter)", "Apify slot: X (Twitter)"),
  },
  {
    id: "hn",
    name: "Hacker News",
    fetchTag: "no key required",
    check: () => ({ ready: true, note: "No key required" }),
  },
  {
    id: "reddit",
    name: "Reddit",
    fetchTag: "needs Reddit app credentials",
    check: (s) =>
      s?.data.redditId.configured && s?.data.redditSecret.configured
        ? { ready: true, note: "Reddit app credentials configured" }
        : { ready: false, note: "Needs Reddit Client ID + Secret in Settings" },
  },
  {
    id: "producthunt",
    name: "Product Hunt",
    fetchTag: "needs a developer token",
    check: (s) =>
      s?.data.producthunt.configured
        ? { ready: true, note: "Developer token configured" }
        : { ready: false, note: "Needs a Product Hunt token in Settings" },
  },
  {
    id: "youtube",
    name: "YouTube",
    fetchTag: "YouTube Data API",
    check: (s) =>
      s?.data.youtube.configured
        ? { ready: true, note: "YouTube Data API key configured" }
        : { ready: false, note: "Needs a YouTube Data API key in Settings" },
    run: "youtube",
  },
  {
    id: "serpapi",
    name: "SerpApi",
    fetchTag: "Google Trends (trending now)",
    check: (s) =>
      s?.data.serpapi.configured
        ? { ready: true, note: "SerpApi key configured" }
        : { ready: false, note: "Needs a SerpApi key in Settings" },
    run: "google",
  },
];

const STATUS_META: Record<
  Status,
  { label: string; tone: "success" | "danger" | "neutral" | "warning" }
> = {
  ok: { label: "OK", tone: "success" },
  error: { label: "Error", tone: "danger" },
  never: { label: "Never run", tone: "neutral" },
  nokey: { label: "No key", tone: "warning" },
  running: { label: "Running…", tone: "neutral" },
};

type RunState = {
  status: Status;
  error?: string;
  lastFetched?: string;
  items?: number;
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

/** POST/GET the endpoint behind a source and normalise the result. */
async function callSource(
  def: Def,
  snapshot: SettingsSnapshot | null,
): Promise<{ items: number; error?: string }> {
  if (def.run === "youtube") {
    const res = await fetch("/api/trends?platform=youtube");
    const d: any = await res.json();
    if (!Array.isArray(d)) return { items: 0, error: d?.error ?? "Unexpected response" };
    const err = d.find((x: any) => typeof x?.title === "string" && /error|not configured/i.test(x.title));
    return err ? { items: 0, error: err.title } : { items: d.length };
  }
  if (def.run === "google") {
    const res = await fetch("/api/trends?platform=google");
    const d: any = await res.json();
    if (!Array.isArray(d)) return { items: 0, error: d?.error ?? "Unexpected response" };
    const err = d.find((x: any) => typeof x?.title === "string" && /error|not configured/i.test(x.title));
    return err ? { items: 0, error: err.title } : { items: d.length };
  }
  if (def.run === "instagram") {
    const handle = snapshot?.instagram.competitors?.[0];
    if (!handle) return { items: 0, error: "Add a competitor handle in Settings → Instagram first." };
    const res = await fetch("/api/scrape-competitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, platform: "instagram" }),
    });
    const d: any = await res.json().catch(() => null);
    if (!res.ok || d?.error) return { items: 0, error: d?.error ?? `HTTP ${res.status}` };
    const count = d?.posts?.length ?? d?.items?.length ?? (Array.isArray(d) ? d.length : 0);
    return { items: count };
  }
  return { items: 0, error: "This source has no fetch implementation yet." };
}

function SourceCard({
  def,
  snapshot,
  state,
  onRun,
}: {
  def: Def;
  snapshot: SettingsSnapshot | null;
  state: RunState;
  onRun: () => void;
}) {
  const [open, setOpen] = useState(false);
  const key = def.check(snapshot);
  const meta = STATUS_META[state.status];
  const canRun = key.ready && !!def.run && state.status !== "running";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg">{def.name}</div>
          <div className="mt-0.5 text-xs text-mute">{def.fetchTag}</div>
        </div>
        <Toggle label={def.name} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={key.ready ? "success" : "warning"}>
          {key.ready ? "Key OK" : "No key"}
        </Badge>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <div className="mt-3 space-y-1 text-xs text-fg2">
        <div>Last fetched: {state.lastFetched ?? "—"}</div>
        <div>Items fetched: {state.items ?? 0}</div>
        <div className="text-mute">{key.note}</div>
        {def.keySlot && <div className="text-mute">{def.keySlot}</div>}
      </div>

      <div className="mt-4">
        <OutlineBtn
          className="h-9"
          onClick={onRun}
          disabled={!canRun}
          title={
            !def.run
              ? "No fetch implementation yet for this source"
              : !key.ready
                ? "Configure this source's key in Settings first"
                : undefined
          }
        >
          {state.status === "running" ? "Running…" : "Run now"}
        </OutlineBtn>
      </div>

      {state.error && (
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
              {state.error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export function SourcesScreen() {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [states, setStates] = useState<Record<string, RunState>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const d = await res.json();
      if (d?.ok) setSnapshot(d as SettingsSnapshot);
    } catch {
      /* the banner below reports the missing-keys case anyway */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runOne = useCallback(
    async (def: Def) => {
      setStates((prev) => ({
        ...prev,
        [def.id]: { ...prev[def.id], status: "running" },
      }));
      let next: RunState;
      try {
        const { items, error } = await callSource(def, snapshot);
        next = error
          ? { status: "error", error, items: 0 }
          : {
              status: "ok",
              items,
              lastFetched: new Date().toLocaleTimeString(),
            };
      } catch (err: any) {
        next = { status: "error", error: err?.message ?? String(err) };
      }
      setStates((prev) => ({ ...prev, [def.id]: next }));
      return next;
    },
    [snapshot],
  );

  const runAll = useCallback(async () => {
    for (const def of DEFS) {
      if (!def.run) continue;
      if (!def.check(snapshot).ready) continue;
      await runOne(def);
    }
  }, [runOne, snapshot]);

  const ready = DEFS.filter((d) => d.check(snapshot).ready);
  const errors = Object.values(states).filter((s) => s.status === "error");
  const lastRun = Object.values(states)
    .map((s) => s.lastFetched)
    .filter(Boolean)
    .pop();

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <Database size={18} className="text-mute" />
        <h1 className="text-[clamp(1.25rem,5vw,1.6rem)] font-bold text-fg">Sources</h1>
      </div>

      {ready.length === 0 ? (
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
      ) : (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-[rgba(82,255,46,0.3)] bg-[rgba(82,255,46,0.08)] px-4 py-3 text-sm text-fg2"
        >
          <CheckCircle2 size={16} className="text-lime" />
          <span>
            {ready.length} of {DEFS.length} sources are ready to run.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`${DEFS.length} sources`} />
        <StatTile label={`${ready.length} ready`} />
        <StatTile label={`${errors.length} errors`} />
        <StatTile label={`Last run ${lastRun ?? "—"}`} />
      </div>

      <PrimaryBtn onClick={runAll} disabled={ready.length === 0}>
        Run all sources now
      </PrimaryBtn>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DEFS.map((d) => (
          <SourceCard
            key={d.id}
            def={d}
            snapshot={snapshot}
            state={states[d.id] ?? { status: d.check(snapshot).ready ? "never" : "nokey" }}
            onRun={() => void runOne(d)}
          />
        ))}
      </div>
    </div>
  );
}
