import { useCallback, useEffect, useState } from "react";
import { Badge, Card, Input, OutlineBtn, Progress, Select } from "../ui";
import { Eye, EyeOff, Save, Plus, X, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Characters } from "./Characters";

const NAV = [
  "API Keys",
  "Instagram",
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
      const res = await fetch("/api/settings");
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
        const res = await fetch("/api/settings", {
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
      <Card className="p-2">
        {NAV.map((n) => (
          <button
            key={n}
            onClick={() => setTab(n)}
            className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm ${
              tab === n
                ? "border-l-2 border-l-lime bg-[rgba(82,255,46,0.08)] text-lime"
                : "text-fg2 hover:text-fg"
            }`}
          >
            {n}
          </button>
        ))}
      </Card>

      <Card className="p-6">
        {tab === "API Keys" && <ApiKeys settings={settings} />}
        {tab === "Instagram" && <InstagramTab settings={settings} />}
        {tab === "Telegram" && <TelegramTab settings={settings} />}
        {tab === "Characters" && <Characters />}
        {(tab === "Schedule" || tab === "Appearance") && (
          <Placeholder label={tab} />
        )}
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
    fetch("/api/settings-imagegen")
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
      const res = await fetch("/api/settings-imagegen", {
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
    <div className="aios-scroll max-h-[70dvh] overflow-y-auto pr-1">
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
          <OutlineBtn onClick={saveApify} disabled={savingApify}>
            {savingApify ? "Saving…" : "Save Apify slots"}
          </OutlineBtn>
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
    <div className="aios-scroll max-h-[70dvh] overflow-y-auto pr-1">
      <div className="text-lg font-semibold text-fg">Telegram</div>
      <p className="mt-2 text-sm text-fg2">
        Outgoing notifications: the 08:00 daily brief and the 20:00 competitor
        check both post here.
      </p>
      <FieldGroup title="Bot">
        <TelegramFields settings={settings} />
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
      const res = await fetch("/api/telegram-chat-id", { method: "POST" });
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
      const res = await fetch("/api/telegram-test", { method: "POST" });
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
                className="text-mute hover:text-err"
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
            className="h-7 min-w-[140px] flex-1 bg-transparent px-1 text-xs text-fg outline-none placeholder:text-mute"
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
  onChange,
  onRemove,
}: {
  slot: ApifySlotView;
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
            className="text-mute hover:text-err"
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
        <Progress value={0} />
        <div className="mt-1 text-[11px] text-mute">
          $0.00 / ${slot.cap.toFixed(2)} — spend tracking not implemented yet
        </div>
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="grid min-h-[300px] place-items-center text-center text-sm text-mute">
      <div>
        <div className="text-fg">{label} settings</div>
        <div className="mt-1">
          Not built yet — there is no backend for this section, so nothing here
          would persist.
        </div>
      </div>
    </div>
  );
}
