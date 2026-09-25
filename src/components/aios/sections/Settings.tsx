import { apiFetch } from "@/lib/api";
import { AppearancePanel } from "./AppearancePanel";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card, Input, OutlineBtn, Progress, Select } from "../ui";
import { Eye, EyeOff, Save, Plus, X, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Characters } from "./Characters";

const NAV = [
  "API Keys",
  "Instagram",
  "Creator",
  "Telegram",
  "Schedule",
  "Characters",
  "Appearance",
];

const JOBS = [
  "Instagram competitor",
  "Instagram hashtag",
  "TikTok",
  "X (Twitter)",
  "Overflow only",
];

/* ------------------------------------------------------------------- types */

type Masked = { configured: boolean; last4: string | null };

/** Live credit per Apify token, from /api/apify-usage. */
type ApifyUsageRow = {
  id: string;
  label: string;
  job: string;
  tokenSuffix: string;
  cap: number | null;
  state: "ok" | "warn" | "blocked" | "no-token" | "error";
  account: string | null;
  plan: string | null;
  allowanceUsd: number | null;
  spentUsd: number | null;
  remainingUsd: number | null;
  usedPercent: number | null;
  cycle: { startAt?: string | null; endAt?: string | null } | null;
  subLimits: { label: string; used: number; limit: number; unit: string }[];
  error?: string;
};

type ApifySlotView = {
  id: number;
  label: string;
  job: string;
  cap: number;
  configured: boolean;
  last4: string | null;
  /** Only set while the user is typing a replacement token. */
  token?: string;
};

type Snapshot = {
  ai: { baseUrl: string | null; apiKey: Masked; ready: boolean };
  data: {
    youtube: Masked;
    serpapi: Masked;
    redditId: Masked;
    redditSecret: Masked;
    producthunt: Masked;
  };
  apify: { slots: ApifySlotView[] };
  telegram: { botToken: Masked; chatId: string | null; ready: boolean };
  instagram: { handle: string | null; competitors: string[] };
  content: {
    pillars: string[];
    postingTimes: { reel: string; story: string; carousel: string };
  };
  creator: {
    brand: string;
    handle: string;
    niche: string;
    language: string;
    referenceCreators: string[];
  };
};

/* -------------------------------------------------------------- data layer */

/**
 * One place that talks to /api/settings. Every group save returns the fresh
 * (masked) snapshot, so the UI can never drift from what is actually stored.
 */
function useSettings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setFailed(data?.error ?? `HTTP ${res.status}`);
      } else {
        setFailed(null);
        setSnapshot(data as Snapshot);
      }
    } catch (err: any) {
      setFailed(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (patch: unknown, label: string) => {
      try {
        const res = await apiFetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          toast.error(data?.error ?? "Save failed");
          return false;
        }
        setSnapshot(data as Snapshot);
        toast.success(`${label} saved`);
        return true;
      } catch (err: any) {
        toast.error(`Save failed: ${err?.message ?? String(err)}`);
        return false;
      }
    },
    [],
  );

  return { snapshot, loading, failed, save, reload: load };
}

/* ------------------------------------------------------------------- shell */

export function Settings() {
  const [tab, setTab] = useState(NAV[0]);
  const settings = useSettings();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      {/* A phone gets a scrollable strip of chips; the vertical list is a desktop sidebar
          pattern and, stacked, it pushed the actual settings below the fold. */}
      <Card className="p-2">
        <div className="flex gap-1 overflow-x-auto overscroll-contain pb-1 lg:block lg:overflow-visible lg:pb-0">
        {NAV.map((n) => (
          <button
            key={n}
            onClick={() => setTab(n)}
            className={`flex w-auto shrink-0 items-center whitespace-nowrap rounded-md px-3 py-2 text-left text-sm lg:w-full ${
              tab === n
                ? "border-l-2 border-l-lime bg-[rgba(82,255,46,0.08)] text-lime"
                : "text-fg2 hover:text-fg"
            }`}
          >
            {n}
          </button>
        ))}
        </div>
      </Card>

      <Card className="p-6">
        {tab === "API Keys" && <ApiKeys settings={settings} />}
        {tab === "Instagram" && <InstagramTab settings={settings} />}
        {tab === "Creator" && <CreatorTab settings={settings} />}
        {tab === "Telegram" && <TelegramTab settings={settings} />}
        {tab === "Characters" && <Characters />}
        {tab === "Schedule" && <ScheduleTab settings={settings} />}
        {tab === "Appearance" && <AppearancePanel />}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- API Keys */

function ApiKeys({ settings }: { settings: ReturnType<typeof useSettings> }) {
  const { snapshot, loading, failed } = settings;

  // AI Brain
  const [baseUrl, setBaseUrl] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [savingAi, setSavingAi] = useState(false);

  // Data sources
  const [data, setData] = useState({
    youtube: "",
    serpapi: "",
    redditId: "",
    redditSecret: "",
    producthunt: "",
  });
  const [savingData, setSavingData] = useState(false);

  // Apify
  const [slots, setSlots] = useState<ApifySlotView[]>([]);
  const [savingApify, setSavingApify] = useState(false);

  // Remaining credit per token — read straight from Apify (cached 10 min server
  // side), so a token can be swapped before it runs dry rather than after.
  const [apifyUsage, setApifyUsage] = useState<ApifyUsageRow[]>([]);
  const [apifyUsageLoading, setApifyUsageLoading] = useState(false);

  const loadApifyUsage = async (fresh = false) => {
    setApifyUsageLoading(true);
    try {
      const res = await apiFetch(`/api/apify-usage${fresh ? "?fresh=1" : ""}`);
      const json = await res.json();
      if (json?.ok) setApifyUsage(json.slots ?? []);
    } catch {
      /* keep whatever we showed before */
    } finally {
      setApifyUsageLoading(false);
    }
  };

  useEffect(() => {
    void loadApifyUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Image generation (its own route, pre-existing behaviour)
  const IG_ALLOWED_MODELS = [
    "@cf/black-forest-labs/flux-2-klein-4b",
    "@cf/black-forest-labs/flux-2-dev",
    "@cf/black-forest-labs/flux-2-klein-9b",
  ];
  const [igDefaultModel, setIgDefaultModel] = useState<string>(
    IG_ALLOWED_MODELS[0],
  );
  const [igVyceaiConfigured, setIgVyceaiConfigured] = useState(false);
  const [igVyceaiLast4, setIgVyceaiLast4] = useState<string | null>(null);
  const [igKeyInput, setIgKeyInput] = useState("");
  const [igSaving, setIgSaving] = useState(false);

  useEffect(() => {
    if (snapshot) setSlots(snapshot.apify.slots);
  }, [snapshot]);

  useEffect(() => {
    apiFetch("/api/settings-imagegen")
      .then((r) => r.json())
      .then((d) => {
        if (d?.defaultModel) setIgDefaultModel(d.defaultModel);
        if (d?.vyceai) {
          setIgVyceaiConfigured(!!d.vyceai.configured);
          setIgVyceaiLast4(d.vyceai.last4 ?? null);
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  const saveAi = async () => {
    setSavingAi(true);
    const body: Record<string, unknown> = {};
    if (baseUrl.trim() !== "") body.baseUrl = baseUrl.trim();
    if (aiKey.trim() !== "") body.apiKey = aiKey.trim();
    if (Object.keys(body).length === 0) {
      setSavingAi(false);
      toast.error("Nothing to save — type a value first.");
      return;
    }
    const ok = await settings.save({ ai: body }, "AI Brain");
    if (ok) {
      setAiKey("");
      setBaseUrl("");
    }
    setSavingAi(false);
  };

  const clearAiKey = async () => {
    await settings.save({ ai: { clearApiKey: true } }, "AI key removed");
  };

  const saveData = async () => {
    setSavingData(true);
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v.trim() !== "") body[k] = v.trim();
    }
    if (Object.keys(body).length === 0) {
      setSavingData(false);
      toast.error("Nothing to save — type a value first.");
      return;
    }
    const ok = await settings.save({ data: body }, "Data sources");
    if (ok) setData(Object.fromEntries(Object.keys(data).map((k) => [k, ""])) as typeof data);
    setSavingData(false);
  };

  const clearDataKey = async (key: keyof typeof data) => {
    await settings.save({ data: { clear: [key] } }, `${key} removed`);
  };

  const saveApify = async () => {
    setSavingApify(true);
    const ok = await settings.save(
      {
        apify: {
          slots: slots.map((s) => ({
            id: s.id,
            label: s.label,
            job: s.job,
            cap: s.cap,
            // Only send a token when the user typed one; otherwise the server
            // keeps whatever is already stored for that slot.
            ...(s.token && s.token.trim() !== "" ? { token: s.token.trim() } : {}),
          })),
        },
      },
      "Apify slots",
    );
    if (ok) setSlots((prev) => prev.map((s) => ({ ...s, token: "" })));
    setSavingApify(false);
  };

  const handleSaveImageGen = async () => {
    setIgSaving(true);
    try {
      const body: { defaultModel?: string; vyceaiKey?: string } = {
        defaultModel: igDefaultModel,
      };
      if (igKeyInput.length > 0) body.vyceaiKey = igKeyInput;
      const res = await apiFetch("/api/settings-imagegen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) {
        toast.error(d?.error ?? "Save failed");
        return;
      }
      if (d.vyceai) {
        setIgVyceaiConfigured(!!d.vyceai.configured);
        setIgVyceaiLast4(d.vyceai.last4 ?? null);
      }
      if (d.defaultModel) setIgDefaultModel(d.defaultModel);
      setIgKeyInput("");
      toast.success("Image generation settings saved");
    } catch (err: any) {
      toast.error(`Save failed: ${err?.message ?? String(err)}`);
    } finally {
      setIgSaving(false);
    }
  };

  const addSlot = () =>
    setSlots((prev) => [
      ...prev,
      {
        id: (prev[prev.length - 1]?.id ?? 0) + 1,
        label: "",
        job: JOBS[0]!,
        cap: 4.5,
        configured: false,
        last4: null,
        token: "",
      },
    ]);

  const removeSlot = (id: number) =>
    setSlots((prev) => prev.filter((s) => s.id !== id));

  if (loading && !snapshot) {
    return <div className="text-sm text-mute">Loading settings…</div>;
  }

  return (
    <div className="aios-scroll max-h-[70dvh] overflow-y-auto overscroll-contain pr-1">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold text-fg">API Keys</div>
        <OutlineBtn onClick={() => void settings.reload()} className="!px-3">
          <RefreshCw size={13} /> Reload
        </OutlineBtn>
      </div>

      {failed ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-[rgba(255,90,90,0.35)] bg-[rgba(255,90,90,0.1)] p-3 text-sm text-err"
        >
          Could not load settings: {failed}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm text-fg2">
          Everything on this page is stored in Cloudflare KV and takes effect
          immediately — no redeploy needed. Saved keys are never sent back to the
          browser; you will only see the last 4 characters.
        </div>
      )}

      {/* ---------------------------------------------------------- AI Brain */}
      <FieldGroup title="AI Brain">
        <SecretRow
          label="manifest.build — Base URL"
          value={baseUrl}
          onChange={setBaseUrl}
          status={
            snapshot?.ai.baseUrl
              ? `Configured: ${snapshot.ai.baseUrl}`
              : "Not configured"
          }
          revealable={false}
        />
        <SecretRow
          label="manifest.build — API Key"
          value={aiKey}
          onChange={setAiKey}
          status={statusText(snapshot?.ai.apiKey)}
          masked
          onClear={snapshot?.ai.apiKey.configured ? clearAiKey : undefined}
        />
        <SaveRow
          onSave={saveAi}
          saving={savingAi}
          label="Save AI Brain"
          hint="Both the base URL and the key are required for any AI feature."
        />
      </FieldGroup>

      {/* ------------------------------------------------- Image Generation */}
      <FieldGroup title="Image Generation">
        <div className="space-y-2">
          <div className="text-sm text-fg">Workers AI — Model</div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={igDefaultModel}
              onChange={(e) => setIgDefaultModel(e.target.value)}
              className="min-w-[280px]"
            >
              {IG_ALLOWED_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Badge tone="success">No key required</Badge>
          </div>
        </div>
        <SecretRow
          label="VyceAI — API Key"
          value={igKeyInput}
          onChange={setIgKeyInput}
          masked
          status={
            igVyceaiConfigured
              ? `Configured (…${igVyceaiLast4 ?? "????"})`
              : "Not configured"
          }
        />
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="text-sm text-fg">VyceAI — Model</div>
          <div>
            <Badge>grok-imagine-2</Badge>
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <OutlineBtn onClick={handleSaveImageGen} disabled={igSaving}>
            {igSaving ? "Saving…" : "Save image generation"}
          </OutlineBtn>
        </div>
      </FieldGroup>

      {/* ---------------------------------------------------------- Scrapers */}
      <FieldGroup title="Scrapers — Apify">
        <div className="space-y-3">
          {slots.length === 0 && (
            <div className="text-sm text-mute">
              No slots yet — add one to connect an Apify account.
            </div>
          )}
          {slots.map((slot, i) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              usage={apifyUsage.find((u) => u.id === String(slot.id))}
              onChange={(next) =>
                setSlots((prev) => prev.map((s, j) => (j === i ? next : s)))
              }
              onRemove={() => removeSlot(slot.id)}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <OutlineBtn onClick={addSlot}>
            <Plus size={14} /> Add slot
          </OutlineBtn>
          <div className="flex items-center gap-2">
            <OutlineBtn
              onClick={() => void loadApifyUsage(true)}
              disabled={apifyUsageLoading}
            >
              <RefreshCw size={14} />
              {apifyUsageLoading ? "Checking credit…" : "Refresh credit"}
            </OutlineBtn>
            <OutlineBtn onClick={saveApify} disabled={savingApify}>
              {savingApify ? "Saving…" : "Save Apify slots"}
            </OutlineBtn>
          </div>
        </div>
      </FieldGroup>

      {/* ----------------------------------------------------- Data Sources */}
      <FieldGroup title="Data Sources">
        <SecretRow
          label="YouTube Data API Key"
          value={data.youtube}
          onChange={(v) => setData({ ...data, youtube: v })}
          masked
          status={statusText(snapshot?.data.youtube)}
          onClear={
            snapshot?.data.youtube.configured
              ? () => clearDataKey("youtube")
              : undefined
          }
        />
        <SecretRow
          label="SerpApi Key"
          value={data.serpapi}
          onChange={(v) => setData({ ...data, serpapi: v })}
          masked
          status={statusText(snapshot?.data.serpapi)}
          onClear={
            snapshot?.data.serpapi.configured
              ? () => clearDataKey("serpapi")
              : undefined
          }
        />
        <SecretRow
          label="Reddit Client ID"
          value={data.redditId}
          onChange={(v) => setData({ ...data, redditId: v })}
          status={statusText(snapshot?.data.redditId)}
          onClear={
            snapshot?.data.redditId.configured
              ? () => clearDataKey("redditId")
              : undefined
          }
        />
        <SecretRow
          label="Reddit Client Secret"
          value={data.redditSecret}
          onChange={(v) => setData({ ...data, redditSecret: v })}
          masked
          status={statusText(snapshot?.data.redditSecret)}
          onClear={
            snapshot?.data.redditSecret.configured
              ? () => clearDataKey("redditSecret")
              : undefined
          }
        />
        <SecretRow
          label="Product Hunt Developer Token"
          value={data.producthunt}
          onChange={(v) => setData({ ...data, producthunt: v })}
          masked
          status={statusText(snapshot?.data.producthunt)}
          onClear={
            snapshot?.data.producthunt.configured
              ? () => clearDataKey("producthunt")
              : undefined
          }
        />
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="text-sm text-fg">Hacker News</div>
          <div>
            <Badge tone="success">No key required</Badge>
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <OutlineBtn onClick={saveData} disabled={savingData}>
            {savingData ? "Saving…" : "Save data sources"}
          </OutlineBtn>
        </div>
      </FieldGroup>

      {/* ---------------------------------------------------- Notifications */}
      <FieldGroup title="Notifications">
        <TelegramFields settings={settings} />
      </FieldGroup>
    </div>
  );
}

/* ---------------------------------------------------------------- Telegram */

function TelegramTab({ settings }: { settings: ReturnType<typeof useSettings> }) {
  return (
    <div className="aios-scroll max-h-[70dvh] overflow-y-auto overscroll-contain pr-1">
      <div className="text-lg font-semibold text-fg">Telegram</div>
      <p className="mt-2 text-sm text-fg2">
        Outgoing notifications: the 08:00 daily brief and the 20:00 competitor
        check both post here.
      </p>
      <FieldGroup title="Bot">
        <TelegramFields settings={settings} />
      </FieldGroup>
      <FieldGroup title="Incoming — send tasks from Telegram">
        <TelegramWebhookCard />
      </FieldGroup>
      <FieldGroup title="What gets sent">
        <ul className="list-disc pl-5 text-sm text-fg2">
          <li>
            <span className="text-fg">08:00 (Asia/Dhaka)</span> — daily content
            brief
          </li>
          <li>
            <span className="text-fg">20:00 (Asia/Dhaka)</span> — competitor
            viral check
          </li>
        </ul>
      </FieldGroup>
    </div>
  );
}

function TelegramFields({
  settings,
}: {
  settings: ReturnType<typeof useSettings>;
}) {
  const { snapshot } = settings;
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [finding, setFinding] = useState(false);

  useEffect(() => {
    if (snapshot?.telegram.chatId) setChatId(snapshot.telegram.chatId);
  }, [snapshot?.telegram.chatId]);

  /** Ask the bot which chats messaged it, and save the id we find. */
  const findChatId = async () => {
    setFinding(true);
    try {
      const res = await apiFetch("/api/telegram-chat-id", { method: "POST" });
      const json = await res.json();
      if (!json?.ok) {
        toast.error(json?.error ?? "Could not find the chat id");
        return;
      }
      setChatId(String(json.chat_id));
      await settings.reload();
      toast.success(
        `Chat id saved: ${json.chat_id}${json.name ? ` (${json.name})` : ""}`,
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Could not find the chat id");
    } finally {
      setFinding(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const body: Record<string, unknown> = {};
    if (botToken.trim() !== "") body.botToken = botToken.trim();
    if (chatId.trim() !== snapshot?.telegram.chatId)
      body.chatId = chatId.trim();
    if (Object.keys(body).length === 0) {
      setSaving(false);
      toast.error("Nothing to save — type a value first.");
      return;
    }
    const ok = await settings.save({ telegram: body }, "Telegram settings");
    if (ok) setBotToken("");
    setSaving(false);
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await apiFetch("/api/telegram-test", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d?.ok) {
        toast.error(d?.error ?? "Test failed");
        return;
      }
      toast.success("Test message sent — check Telegram.");
    } catch (err: any) {
      toast.error(`Test failed: ${err?.message ?? String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <SecretRow
        label="Telegram Bot Token"
        value={botToken}
        onChange={setBotToken}
        masked
        status={statusText(snapshot?.telegram.botToken)}
        onClear={
          snapshot?.telegram.botToken.configured
            ? () => settings.save({ telegram: { clearBotToken: true } }, "Bot token removed")
            : undefined
        }
      />
      <SecretRow
        label="Telegram Chat ID"
        value={chatId}
        onChange={setChatId}
        revealable={false}
        status={
          snapshot?.telegram.chatId
            ? `Configured: ${snapshot.telegram.chatId}`
            : "Not configured"
        }
      />
      <div className="rounded-md border border-line bg-surface p-3 text-[12px] leading-relaxed text-mute">
        Save the bot token, then send your bot any message in Telegram and press{" "}
        <span className="text-fg2">Find my chat ID</span> — it reads the bot's
        updates and stores the id for you (no need to open getUpdates by hand).
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <OutlineBtn onClick={findChatId} disabled={finding || saving}>
          {finding ? "Searching…" : "Find my chat ID"}
        </OutlineBtn>
        <OutlineBtn onClick={sendTest} disabled={testing || !snapshot?.telegram.ready}>
          <Send size={13} /> {testing ? "Sending…" : "Send test message"}
        </OutlineBtn>
        <OutlineBtn onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save notifications"}
        </OutlineBtn>
      </div>
    </>
  );
}

/* ------------------------------------------------- Telegram, incoming side */

/**
 * The intake half of Telegram (master-plan step ⑤).
 *
 * Everything shown here comes from Telegram itself — the registered URL, the
 * pending update count and the last delivery error — so when a message does not
 * arrive you can see the reason instead of guessing. The delivery URL is shown
 * because that is the only way to confirm what the bot is pointing at; it is
 * reachable only from behind Access.
 */
type WebhookStatus = {
  configured: boolean;
  hasToken: boolean;
  botUsername: string | null;
  url: string | null;
  registeredAt: number | null;
  lastUpdateAt: number | null;
  updatesSeen: number;
  lastError: string | null;
  telegram?: {
    url: string | null;
    pendingUpdates: number;
    lastErrorDate: number | null;
    lastErrorMessage: string | null;
    allowedUpdates: string[] | null;
  } | null;
  error?: string;
};

function when(ts: number | null | undefined): string {
  if (!ts) return "never";
  return new Date(ts).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TelegramWebhookCard() {
  const [status, setStatus] = useState<WebhookStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/telegram-webhook");
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Could not read the webhook status.");
        return;
      }
      setStatus(json as WebhookStatus);
      if (json?.error) setError(json.error);
    } catch (err: any) {
      setError(err?.message ?? "Could not read the webhook status.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: "register" | "remove" | "rotate", done: string) => {
    setBusy(action);
    setError(null);
    try {
      const res = await apiFetch("/api/telegram-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const message = json?.error ?? "Telegram refused the change.";
        setError(message);
        toast.error(message);
        if (json?.configured !== undefined) setStatus(json as WebhookStatus);
        return;
      }
      setStatus(json as WebhookStatus);
      toast.success(done);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const copyUrl = async () => {
    if (!status?.url) return;
    try {
      await navigator.clipboard.writeText(status.url);
      toast.success("Delivery URL copied");
    } catch {
      toast.error("Copy failed — select the text and copy it manually.");
    }
  };

  const live = !!status?.registeredAt;
  const telegramKnows = !!status?.telegram?.url;

  return (
    <>
      <p className="text-sm text-fg2">
        Message your bot and it becomes a real task on the Dashboard. No app open,
        no laptop on — Telegram calls this Worker directly.
      </p>

      <div className="space-y-2 rounded-md border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg">Status:</span>
          {status === null ? (
            <span className="text-mute">reading…</span>
          ) : !status.hasToken ? (
            <Badge tone="warning">add your bot token above first</Badge>
          ) : live && telegramKnows ? (
            <Badge tone="success">listening since {when(status.registeredAt)}</Badge>
          ) : live && !telegramKnows ? (
            <Badge tone="warning">
              registered here, but Telegram reports no URL — press “Turn on” again
            </Badge>
          ) : (
            <Badge tone="neutral">not switched on yet</Badge>
          )}
          {status?.botUsername ? (
            <span className="text-mute">@ {status.botUsername}</span>
          ) : null}
        </div>

        <div className="grid gap-1 text-[12px] text-mute sm:grid-cols-2">
          <span>Messages received: {status?.updatesSeen ?? 0}</span>
          <span>Last message: {when(status?.lastUpdateAt)}</span>
          <span>Waiting at Telegram: {status?.telegram?.pendingUpdates ?? 0}</span>
          <span>
            Last Telegram error:{" "}
            {status?.telegram?.lastErrorMessage
              ? `${status.telegram.lastErrorMessage} (${when(status.telegram.lastErrorDate)})`
              : "none"}
          </span>
          <span className="sm:col-span-2">
            Telegram delivers:{" "}
            {status?.telegram?.allowedUpdates?.length
              ? status.telegram.allowedUpdates.join(", ")
              : "—"}
            {status?.telegram?.allowedUpdates &&
            !status.telegram.allowedUpdates.includes("callback_query") ? (
              <span className="text-err">
                {" "}
                — button taps are being dropped; press “Turn on” to fix it.
              </span>
            ) : null}
          </span>
        </div>

        {status?.url ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={status.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-md border border-line bg-card px-2 py-1.5 font-mono text-[11px] text-fg2"
            />
            <OutlineBtn onClick={copyUrl}>Copy</OutlineBtn>
          </div>
        ) : null}

        {(error || status?.lastError) && (
          <p className="text-[12px] text-err">
            {error ?? status?.lastError}
          </p>
        )}

        <div className="text-[12px] leading-relaxed text-mute">
          In the chat, <span className="text-fg2">/task buy props</span> saves a
          task · <span className="text-fg2">/list</span> shows what is open ·{" "}
          <span className="text-fg2">/done 2</span> ticks one off ·{" "}
          <span className="text-fg2">/id</span> reports the chat id (it saves
          itself the first time you say hello).
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <OutlineBtn onClick={load} disabled={busy !== null}>
          <RefreshCw size={13} /> Refresh
        </OutlineBtn>
        <OutlineBtn
          onClick={() => act("rotate", "New delivery URL registered")}
          disabled={busy !== null || !status?.hasToken}
        >
          {busy === "rotate" ? "Working…" : "New URL"}
        </OutlineBtn>
        <OutlineBtn
          onClick={() => act("remove", "Incoming messages switched off")}
          disabled={busy !== null || !live}
        >
          {busy === "remove" ? "Working…" : "Turn off"}
        </OutlineBtn>
        <OutlineBtn
          onClick={() => act("register", "Telegram is now delivering to this app")}
          disabled={busy !== null || !status?.hasToken}
        >
          <Send size={13} /> {busy === "register" ? "Talking to Telegram…" : "Turn on"}
        </OutlineBtn>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- Instagram */

function InstagramTab({
  settings,
}: {
  settings: ReturnType<typeof useSettings>;
}) {
  const { snapshot, loading } = settings;
  const [handle, setHandle] = useState("");
  const [comps, setComps] = useState<string[]>([]);
  const [add, setAdd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!snapshot) return;
    setHandle(snapshot.instagram.handle ?? "");
    setComps(snapshot.instagram.competitors ?? []);
  }, [snapshot]);

  const save = async () => {
    setSaving(true);
    await settings.save(
      {
        instagram: {
          handle: handle.trim(),
          competitors: comps,
        },
      },
      "Instagram settings",
    );
    setSaving(false);
  };

  if (loading && !snapshot) {
    return <div className="text-sm text-mute">Loading settings…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-fg">Instagram</div>
      <div>
        <div className="mb-1 text-xs text-mute">My Handle</div>
        <Input value={handle} onChange={(e) => setHandle(e.target.value)} />
      </div>
      <div>
        <div className="mb-2 text-xs text-mute">Competitor Handles</div>
        <div className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-2">
          {comps.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-cardx px-3 py-1 text-xs text-lime"
            >
              {c}
              <button
                onClick={() => setComps(comps.filter((x) => x !== c))}
                className="-m-1.5 grid h-8 w-8 place-items-center rounded text-mute hover:text-err"
                aria-label={`Remove ${c}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            value={add}
            onChange={(e) => setAdd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && add) {
                setComps([...comps, add.startsWith("@") ? add : `@${add}`]);
                setAdd("");
              }
            }}
            placeholder="+ Add competitor"
            className="h-7 min-w-0 flex-1 sm:min-w-[140px] bg-transparent px-1 text-xs text-fg outline-none placeholder:text-mute"
          />
        </div>
        <div className="mt-1 text-[11px] text-mute">
          The 20:00 competitor check scrapes these handles via Apify.
        </div>
      </div>
      <div className="flex justify-end">
        <OutlineBtn onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Instagram"}
        </OutlineBtn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Creator */

/**
 * Who the channel belongs to. Every AI prompt that used to name one hardcoded
 * brand and handle reads these five values instead, so a second account stops
 * being told to write for someone else's channel.
 *
 * The handle is deliberately shared with Settings → Instagram: both fields write
 * the same value server-side (see /api/settings), because a prompt that says
 * "@a" while the scraper looks at "@b" is exactly how this app has drifted
 * before.
 */
function CreatorTab({ settings }: { settings: ReturnType<typeof useSettings> }) {
  const { snapshot, loading } = settings;
  const [brand, setBrand] = useState("");
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [language, setLanguage] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [add, setAdd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!snapshot) return;
    setBrand(snapshot.creator.brand ?? "");
    setHandle(snapshot.creator.handle ?? "");
    setNiche(snapshot.creator.niche ?? "");
    setLanguage(snapshot.creator.language ?? "");
    setRefs(snapshot.creator.referenceCreators ?? []);
  }, [snapshot]);

  const save = async () => {
    setSaving(true);
    await settings.save(
      {
        creator: {
          brand: brand.trim(),
          handle: handle.trim(),
          niche: niche.trim(),
          language: language.trim(),
          referenceCreators: refs,
        },
      },
      "Creator profile",
    );
    setSaving(false);
  };

  if (loading && !snapshot) {
    return <div className="text-sm text-mute">Loading settings…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-fg">Creator</div>
      <div className="text-xs text-mute">
        Written into the brief, planner, thumbnail and scoring prompts for this
        account. The app's own name is not the same thing as your brand.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-mute">Brand</div>
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          <div className="mt-1 text-[11px] text-mute">
            What the AI writes for — e.g. “Content OS”.
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-mute">Handle</div>
          <Input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@yourhandle"
          />
          <div className="mt-1 text-[11px] text-mute">
            Shared with Settings → Instagram (the competitor check scrapes it).
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs text-mute">Niche</div>
          <Input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="e.g. AI updates & tools"
          />
          <div className="mt-1 text-[11px] text-mute">
            The lane the account is in — this is what the planner plans for.
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs text-mute">Language on camera</div>
          <Input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="e.g. Bangla/Banglish — technical terms stay in English"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs text-mute">Reference creators</div>
        <div className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-2">
          {refs.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-cardx px-3 py-1 text-xs text-lime"
            >
              {c}
              <button
                onClick={() => setRefs(refs.filter((x) => x !== c))}
                className="-m-1.5 grid h-8 w-8 place-items-center rounded text-mute hover:text-err"
                aria-label={`Remove ${c}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            value={add}
            onChange={(e) => setAdd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && add.trim()) {
                setRefs([...refs, add.trim()]);
                setAdd("");
              }
            }}
            placeholder="+ Add a creator you study"
            className="h-7 min-w-[140px] flex-1 bg-transparent px-1 text-xs text-fg outline-none placeholder:text-mute"
          />
        </div>
        <div className="mt-1 text-[11px] text-mute">
          Optional. Creators whose hooks and structure the AI should learn from —
          not the accounts the competitor check scrapes (that list is in
          Instagram).
        </div>
      </div>

      <div className="flex justify-end">
        <OutlineBtn onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save creator profile"}
        </OutlineBtn>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

function statusText(masked: Masked | undefined): string {
  if (!masked) return "Not configured";
  return masked.configured
    ? `Configured (…${masked.last4 ?? "????"})`
    : "Not configured";
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h3 className="sticky top-0 z-10 -mx-1 bg-cardx px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">
        {title}
      </h3>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function SaveRow({
  onSave,
  saving,
  label,
  hint,
}: {
  onSave: () => void;
  saving: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      {hint ? <div className="text-[11px] text-mute">{hint}</div> : <span />}
      <OutlineBtn onClick={onSave} disabled={saving}>
        <Save size={13} /> {saving ? "Saving…" : label}
      </OutlineBtn>
    </div>
  );
}

function SecretRow({
  label,
  value,
  onChange,
  status,
  masked = false,
  revealable = true,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  status?: string;
  masked?: boolean;
  revealable?: boolean;
  onClear?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-start">
      <div className="text-sm text-fg sm:pt-2">{label}</div>
      <div className="min-w-0">
        <Input
          type={masked && revealable && !show ? "password" : "text"}
          value={value}
          placeholder={
            masked && revealable
              ? "Paste to replace the stored value"
              : "Not set"
          }
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="mt-1 flex items-center gap-2 text-[11px] text-mute">
          <span>{status ?? "Not configured"}</span>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-mute underline hover:text-err"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {masked && revealable ? (
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide value" : "Show value"}
          className="grid h-10 w-10 place-items-center rounded-md border border-line text-fg2 hover:border-lime hover:text-lime"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      ) : (
        <span className="hidden sm:block sm:h-10 sm:w-10" />
      )}
    </div>
  );
}

function SlotCard({
  slot,
  usage,
  onChange,
  onRemove,
}: {
  slot: ApifySlotView;
  usage?: ApifyUsageRow;
  onChange: (next: ApifySlotView) => void;
  onRemove: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-mute">
          Slot {slot.id}
        </div>
        <div className="flex items-center gap-2">
          {slot.configured ? (
            <Badge tone="success">token …{slot.last4}</Badge>
          ) : (
            <Badge>no token</Badge>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove slot ${slot.id}`}
            className="-m-1.5 grid h-8 w-8 place-items-center rounded text-mute hover:text-err"
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-mute">Label</div>
          <Input
            value={slot.label}
            placeholder="Radwan"
            onChange={(e) => onChange({ ...slot, label: e.target.value })}
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-mute">API Token</div>
          <div className="flex gap-2">
            <Input
              type={show ? "text" : "password"}
              value={slot.token ?? ""}
              placeholder={slot.configured ? "Stored — type to replace" : "apify_api_…"}
              onChange={(e) => onChange({ ...slot, token: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Hide token" : "Show token"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line text-fg2 hover:border-lime hover:text-lime"
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-mute">Assigned job</div>
          <Select
            value={slot.job}
            onChange={(e) => onChange({ ...slot, job: e.target.value })}
          >
            {JOBS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <div className="mb-1 text-xs text-mute">Monthly cap USD</div>
          <Input
            type="number"
            step="0.01"
            value={slot.cap}
            onChange={(e) =>
              onChange({ ...slot, cap: Number(e.target.value) || 0 })
            }
          />
        </div>
      </div>
      <div className="mt-3">
        {!usage || usage.state === "no-token" ? (
          <div className="text-[11px] text-mute">
            Save a token to see how much credit is left on it.
          </div>
        ) : usage.state === "error" ? (
          <div className="text-[11px] text-warn">
            {usage.error ?? "Apify did not answer for this token."}
          </div>
        ) : (
          <>
            <Progress value={usage.usedPercent ?? 0} />
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span
                className={
                  usage.state === "blocked"
                    ? "text-err"
                    : usage.state === "warn"
                      ? "text-warn"
                      : "text-fg2"
                }
              >
                ${usage.spentUsd?.toFixed(2)} of ${usage.allowanceUsd?.toFixed(2)} used
              </span>
              <span className="text-mute">
                · ${usage.remainingUsd?.toFixed(2)} left · {usage.usedPercent}%
              </span>
              {usage.account && (
                <span className="text-mute">
                  · {usage.account}
                  {usage.plan ? ` (${usage.plan})` : ""}
                </span>
              )}
              {usage.cycle?.endAt && (
                <span className="text-mute">
                  · resets {new Date(usage.cycle.endAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {usage.state === "blocked" && (
              <div className="mt-1 text-[11px] text-err">
                The Apify allowance for this token is used up — scraping is
                blocked on it. Add or switch to another token to keep going.
              </div>
            )}
            {usage.state === "warn" && usage.cap !== null && (
              <div className="mt-1 text-[11px] text-warn">
                Past your ${usage.cap.toFixed(2)} cap for this token — switch
                before it runs dry.
              </div>
            )}
            {usage.subLimits.length > 0 && (
              <div className="mt-1 text-[11px] text-mute">
                {usage.subLimits
                  .map((s) => `${s.label} ${s.used.toFixed(1)}/${s.limit} ${s.unit}`)
                  .join(" · ")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Schedule — the content strategy the planner reads: pillars to rotate and the
 * posting cadence (Asia/Dhaka). Both live in KV, so changing them takes effect
 * on the next plan/brief with no redeploy.
 */
function ScheduleTab({
  settings,
}: {
  settings: ReturnType<typeof useSettings>;
}) {
  const { snapshot } = settings;
  const [pillars, setPillars] = useState("");
  const [times, setTimes] = useState({
    reel: "21:00",
    story: "12:00",
    carousel: "18:00",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!snapshot?.content) return;
    setPillars((snapshot.content.pillars ?? []).join(", "));
    setTimes({
      reel: snapshot.content.postingTimes?.reel ?? "21:00",
      story: snapshot.content.postingTimes?.story ?? "12:00",
      carousel: snapshot.content.postingTimes?.carousel ?? "18:00",
    });
  }, [snapshot?.content]);

  const save = async () => {
    setSaving(true);
    const list = pillars
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    await settings.save({ content: { pillars: list, postingTimes: times } }, "Schedule");
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-medium">Content pillars</div>
        <p className="mt-0.5 text-xs text-mute">
          The planner rotates through these, one per post. Comma-separated.
        </p>
        <input
          value={pillars}
          onChange={(e) => setPillars(e.target.value)}
          placeholder="AI tips, productivity, behind the scenes"
          className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg"
        />
      </div>

      <div>
        <div className="text-sm font-medium">Posting times (Asia/Dhaka)</div>
        <p className="mt-0.5 text-xs text-mute">
          Used whenever the planner lays out a month.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["reel", "Reels"],
              ["story", "Stories"],
              ["carousel", "Carousels"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-xs text-mute">{label}</span>
              <input
                type="time"
                value={times[key]}
                onChange={(e) => setTimes({ ...times, [key]: e.target.value })}
                className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <OutlineBtn onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save schedule"}
        </OutlineBtn>
      </div>
    </div>
  );
}

