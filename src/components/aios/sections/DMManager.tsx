import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Card, EmptyState, GhostBtn, OutlineBtn, PrimaryBtn } from "../ui";
import { ConnectionsCard } from "./ConnectionsCard";
import {
  AlertTriangle,
  Ban,
  BarChart2,
  Check,
  Clock,
  FlaskConical,
  Inbox,
  Lightbulb,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  Power,
  RefreshCw,
  Sparkles,
  Tag,
  Timer,
  Wand2,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";

/**
 * DM Manager — stage 1 (no Meta account needed).
 *
 * The whole feature is here: rules, a builder, a simulator that runs the REAL
 * engine, the inbox it fills, the contacts it creates and the numbers it produces.
 * Stage 2 only replaces the trigger — Instagram's webhook calls the same
 * `runEngine` that the Simulate tab calls, so nothing on this page changes when it
 * goes live.
 *
 * Run a rule with the manual job queue and watch it appear real, so no placeholder
 * copy in the app can tell a different story. Nothing is seeded: the empty states
 * are true, and "Simulate" is the one click that fills them.
 */

type Automation = {
  id: string;
  name: string;
  trigger_type: string;
  keywords: string;
  match_mode: string;
  post_scope: string;
  post_id: string | null;
  public_reply: string | null;
  dm_message: string | null;
  dm_button_label: string | null;
  dm_button_url: string | null;
  counter_enabled: number;
  daily_cap: number;
  goal: string | null;
  note?: string | null;
  flow_steps?: string | null;
  enabled: number;
  created_at: number;
};

type Step = { kind: string; label: string; detail: string; ok: boolean };

type SimResult = {
  matched: boolean;
  automation: { id: string; name: string } | null;
  keyword: string | null;
  publicReply: string | null;
  dm: string | null;
  dmVia: "private_reply" | "conversation" | null;
  handoff: boolean;
  paused: boolean;
  contactId: string | null;
  conversationId: string | null;
  withinWindow: boolean;
  windowNote: string;
  steps: Step[];
};

type Conversation = {
  id: string;
  status: string;
  source: string | null;
  last_message_at: number | null;
  last_inbound_at: number | null;
  unread: number;
  username: string | null;
  first_name: string | null;
  ig_user_id: string | null;
  last_text: string | null;
  /** 1 when the owner has taken the thread over and the bot is silent. */
  bot_paused?: number;
  paused_reason?: string | null;
};

type Message = {
  direction: string;
  channel: string;
  text: string;
  matched_keyword: string | null;
  status: string;
  created_at: number;
};

type Contact = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  ig_user_id: string | null;
  comments: number;
  dms: number;
  leads: number;
  last_seen_at: number | null;
  /** S3: what a flow attached to this person — shown as chips, never invented. */
  tags?: string[];
  fields?: Record<string, string>;
};

/** A flow that is parked at a `delay` step, waiting for the ladder's clock. */
type PendingRun = {
  id: string;
  automation_id: string;
  conversation_id: string;
  step_index: number;
  status: string;
  run_at: number;
  note: string | null;
  automation_name: string | null;
};

type DrainReport = {
  due: number;
  resumed: number;
  cancelled: number;
  failed: number;
  simulated: boolean;
};

type TagRow = { id: string; name: string; created_at: number; contacts: number };

type Analytics = {
  contacts: number;
  conversations: number;
  comments: number;
  dms: number;
  leads: number;
  handoffs: number;
  windowSkips: number;
  capSkips: number;
  perAutomation: Array<{
    id: string;
    name: string;
    enabled: number;
    triggers: number;
    dms: number;
    leads: number;
  }>;
  daily: Array<{ date: string; comments: number; dms: number }>;
};

const TABS = [
  { id: "automations", label: "Automations", Icon: Zap },
  { id: "simulate", label: "Simulate", Icon: Play },
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "contacts", label: "Contacts", Icon: Users },
  { id: "tags", label: "Tags", Icon: Tag },
  { id: "analytics", label: "Analytics", Icon: BarChart2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** `keywords` is stored as JSON — one list, one place to parse it. */
function keywordList(a: Automation): string[] {
  try {
    const list = JSON.parse(a.keywords || "[]");
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

function when(ts?: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/**
 * Hours left of the 24-hour conversation window — the number that decides whether
 * an automated DM is still allowed to an existing thread.
 */
function windowHoursLeft(lastInboundAt?: number | null): number | null {
  if (!lastInboundAt) return null;
  const left = 24 - (Date.now() - lastInboundAt) / 3_600_000;
  return Math.max(0, Math.round(left * 10) / 10);
}

/** One step of the sequence the engine will run — see `FlowStep` in src/lib/dm.ts. */
type FlowStep = {
  id: string;
  kind: string;
  text?: string;
  label?: string;
  url?: string;
  options?: string[];
  amount?: number;
  unit?: string;
  field?: string;
  op?: string;
  value?: string;
  /** `library` — hand over something real from the Library instead of a link. */
  library_type?: string;
  library_id?: string;
  library_pick?: string;
};

const STEP_KINDS: Array<{ kind: string; label: string; hint: string }> = [
  { kind: "message", label: "Message", hint: "Text to send. {{first_name}} and friends work." },
  { kind: "button", label: "Button", hint: "A labelled link on its own line." },
  { kind: "quick_reply", label: "Quick replies", hint: "Up to three short options." },
  { kind: "delay", label: "Wait", hint: "Pause here, then carry on. The cron resumes it." },
  { kind: "condition", label: "Condition", hint: "Stop the flow unless something is true." },
  { kind: "tag", label: "Tag", hint: "Put a tag on the person." },
  { kind: "field", label: "Set field", hint: "Save a value on the person (plan, city…)." },
  {
    kind: "library",
    label: "From the Library",
    hint: "Send a real script or hook you already wrote — never a link to it.",
  },
];

/**
 * The 4h / 23h ladder, as one click. Both rungs live inside Meta's 24-hour window,
 * which is the entire reason 23 and not 24.
 */
const LADDER_STEPS = (): FlowStep[] => [
  {
    id: crypto.randomUUID(),
    kind: "message",
    text: "Hey {{first_name}}! Did the guide land okay? Reply here if anything is unclear 🙌",
  },
  { id: crypto.randomUUID(), kind: "delay", amount: 4, unit: "hours" },
  {
    id: crypto.randomUUID(),
    kind: "message",
    text: "Still there? One thing people ask me most about {{keyword}} — want me to send that too?",
  },
  { id: crypto.randomUUID(), kind: "delay", amount: 19, unit: "hours" },
  {
    id: crypto.randomUUID(),
    kind: "message",
    text: "Last note from me, {{first_name}} — the link stays open whenever you need it.",
  },
];

const EMPTY_FORM = {
  id: "" as string | undefined,
  name: "",
  trigger_type: "comment" as "comment" | "dm",
  keywords: "",
  match_mode: "contains" as "contains" | "exact" | "any_word" | "ai",
  post_scope: "any" as "any" | "post" | "next",
  post_id: "",
  public_reply: "",
  dm_message: "",
  dm_button_label: "",
  dm_button_url: "",
  counter_enabled: false,
  daily_cap: 0,
  goal: "",
  note: "",
  flow_steps: [] as FlowStep[],
};

type Form = typeof EMPTY_FORM;

/** Parse `flow_steps` off a stored automation — malformed JSON is an empty flow. */
function flowOf(a: { flow_steps?: string | null }): FlowStep[] {
  try {
    const list = JSON.parse(a?.flow_steps || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .filter((s) => s && typeof s.kind === "string")
      .map((s) => ({ ...s, id: String(s.id ?? crypto.randomUUID()) })) as FlowStep[];
  } catch {
    return [];
  }
}

/** One line per step, for the card and the builder's header. */
function describeStep(s: FlowStep): string {
  switch (s.kind) {
    case "message":
      return s.text ? s.text.slice(0, 70) : "empty message";
    case "button":
      return `${s.label ?? "Open"}${s.url ? ` → ${s.url}` : ""}`;
    case "quick_reply":
      return (s.options ?? []).join(" · ") || "no options";
    case "delay":
      return `wait ${s.amount ?? 0} ${s.unit ?? "minutes"}`;
    case "condition":
      return `${s.field ?? "?"} ${s.op ?? "is"} ${s.value ?? ""}`.trim();
    case "tag":
      return s.label ?? s.text ?? "";
    case "field":
      return `${s.field ?? ""} = ${s.value ?? ""}`;
    default:
      return s.kind;
  }
}

const TEMPLATES: Array<{ label: string; hint: string; patch: Partial<Form> }> = [
  {
    label: "Free guide → DM",
    hint: "Someone comments “guide”, gets a public reply and the link in their DMs.",
    patch: {
      name: "Free guide to DMs",
      keywords: "guide, free guide, send me",
      public_reply: "Just sent it to your DMs, {{first_name}} 📩",
      dm_message:
        "Hey {{first_name}}! Here is the guide you asked for. Save it — I update it every month.",
      dm_button_label: "Open the guide",
      dm_button_url: "",
      goal: "guide",
    },
  },
  {
    label: "Price question → DM",
    hint: "“price / rate / cost” always ends in a DM with your offer.",
    patch: {
      name: "Price questions",
      keywords: "price, pricing, rate, cost",
      public_reply: "Sent you the details in your DMs 🙌",
      dm_message: "Hey {{first_name}} — here is how working together looks:",
      dm_button_label: "See the offer",
      dm_button_url: "",
      goal: "lead",
    },
  },
  {
    label: "Link in bio → DM",
    hint: "The most common comment on any reel.",
    patch: {
      name: "Link in bio",
      keywords: "link, link in bio, where",
      public_reply: "It is in my bio — sending it here too 👇",
      dm_message: "{{first_name}}, here is the link you asked for:",
      goal: "link",
    },
  },
];

export function DMManager() {
  const [tab, setTab] = useState<TabId>("automations");
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toastOk, setToastOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/dm?action=automations");
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not load the automations.");
      setAutomations(json.automations ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Could not load the automations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: any) => {
    const res = await apiFetch("/api/dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  };

  const save = async () => {
    if (!form) return;
    setBusy("save");
    setError(null);
    try {
      await post({
        action: "save",
        ...(form.id ? { id: form.id } : {}),
        name: form.name,
        trigger_type: form.trigger_type,
        keywords: form.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        match_mode: form.match_mode,
        post_scope: form.post_scope,
        post_id: form.post_scope === "post" ? form.post_id || null : null,
        public_reply: form.public_reply || null,
        dm_message: form.dm_message || null,
        dm_button_label: form.dm_button_label || null,
        dm_button_url: form.dm_button_url || null,
        counter_enabled: form.counter_enabled,
        daily_cap: Number(form.daily_cap) || 0,
        goal: form.goal || null,
        note: form.note || null,
        // An empty sequence means "just the message above", which is exactly how a
        // rule written before the flow builder behaves — so the two are one thing.
        flow_steps: form.flow_steps,
      });
      setForm(null);
      setToastOk("Automation saved");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not save the automation.");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (a: Automation) => {
    setError(null);
    try {
      const json = await post({ action: "toggle", id: a.id, enabled: !a.enabled });
      setAutomations(json.automations ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Could not change it.");
    }
  };

  const remove = async (a: Automation) => {
    setError(null);
    try {
      const json = await post({ action: "delete", id: a.id });
      setAutomations(json.automations ?? []);
      setToastOk("Automation deleted");
    } catch (err: any) {
      setError(err?.message ?? "Could not delete it.");
    }
  };

  const edit = (a: Automation) =>
    setForm({
      id: a.id,
      name: a.name,
      trigger_type: (a.trigger_type === "dm" ? "dm" : "comment") as "comment" | "dm",
      keywords: keywordList(a).join(", "),
      match_mode: (["contains", "exact", "any_word", "ai"].includes(a.match_mode)
        ? a.match_mode
        : "contains") as Form["match_mode"],
      post_scope: (a.post_scope === "post"
        ? "post"
        : a.post_scope === "next"
          ? "next"
          : "any") as "any" | "post" | "next",
      post_id: a.post_id ?? "",
      note: a.note ?? "",
      public_reply: a.public_reply ?? "",
      dm_message: a.dm_message ?? "",
      dm_button_label: a.dm_button_label ?? "",
      dm_button_url: a.dm_button_url ?? "",
      counter_enabled: !!a.counter_enabled,
      daily_cap: a.daily_cap ?? 0,
      goal: a.goal ?? "",
      flow_steps: flowOf(a),
    });

  /**
   * The same rule, ready for the next post.
   *
   * Everything the owner tuned is kept — keywords, the flow, the goal — with no id (so
   * saving makes a new rule) and no post of its own yet, because the point of copying is
   * that the next post is a different one.
   */
  const duplicate = (a: Automation) =>
    setForm({
      id: "",
      name: `${a.name} (copy)`,
      trigger_type: (a.trigger_type === "dm" ? "dm" : "comment") as "comment" | "dm",
      keywords: keywordList(a).join(", "),
      match_mode: (["contains", "exact", "any_word", "ai"].includes(a.match_mode)
        ? a.match_mode
        : "contains") as Form["match_mode"],
      post_scope: "post",
      post_id: "",
      note: a.note ?? "",
      public_reply: a.public_reply ?? "",
      dm_message: a.dm_message ?? "",
      dm_button_label: a.dm_button_label ?? "",
      dm_button_url: a.dm_button_url ?? "",
      counter_enabled: !!a.counter_enabled,
      daily_cap: a.daily_cap ?? 0,
      goal: a.goal ?? "",
      flow_steps: flowOf(a),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[clamp(1.5rem,6vw,1.75rem)] font-bold text-fg">
            <MessageSquare className="h-6 w-6 text-lime" />
            DM Manager
          </h1>
          <p className="mt-1 text-sm text-fg2">
            Comment keywords and DM automation for Instagram — rules, replies and the
            inbox they fill.
          </p>
        </div>
        <OutlineBtn onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </OutlineBtn>
      </div>

      {/* Connect the account that the automations answer for. Until one is
          connected, Simulate is how the engine is exercised — and it is the same
          engine either way. */}
      <ConnectionsCard />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              tab === t.id
                ? "border-lime bg-[rgba(82,255,46,0.08)] text-fg"
                : "border-line text-fg2 hover:text-fg"
            }`}
          >
            <t.Icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <Card className="flex items-start gap-2 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-err" />
          <span className="text-sm text-err">{error}</span>
        </Card>
      )}
      {toastOk && (
        <Card className="flex items-start gap-2 p-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-lime" />
          <span className="text-sm text-fg2">{toastOk}</span>
        </Card>
      )}

      {tab === "automations" && (
        <>
          <KeywordTester />
          {form && (
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-fg">
                  {form.id ? "Edit automation" : "New automation"}
                </span>
                <button onClick={() => setForm(null)} className="text-mute hover:text-fg2">
                  <X size={15} />
                </button>
              </div>

              {!form.id && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-mute">
                    Start from a template
                  </span>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => setForm({ ...form, ...t.patch })}
                      title={t.hint}
                      className="rounded-full border border-line px-2.5 py-1 text-[11px] text-fg2 hover:border-lime hover:text-lime"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Free guide to DMs"
                  className={inputClass}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Trigger">
                  <select
                    value={form.trigger_type}
                    onChange={(e) =>
                      setForm({ ...form, trigger_type: e.target.value as Form["trigger_type"] })
                    }
                    className={inputClass}
                  >
                    <option value="comment">A comment on a post</option>
                    <option value="dm">A direct message</option>
                  </select>
                </Field>
                <Field label="Matching">
                  <select
                    value={form.match_mode}
                    onChange={(e) =>
                      setForm({ ...form, match_mode: e.target.value as Form["match_mode"] })
                    }
                    className={inputClass}
                  >
                    <option value="contains">Contains the keyword</option>
                    <option value="exact">Is exactly the keyword</option>
                    <option value="any_word">Contains the word</option>
                    <option value="ai">The AI reads it and decides</option>
                  </select>
                </Field>
              </div>

              <Field
                label="Keywords (comma separated — leave empty to answer everything)"
                hint="Matched case-insensitively against the comment."
              >
                <input
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  placeholder="guide, free guide, send me"
                  className={inputClass}
                />
              </Field>

              <Field
                label="Public reply (the comment you answer with)"
                hint="Leave empty to stay silent in public. {{first_name}} and {{count}} work here."
              >
                <textarea
                  value={form.public_reply}
                  onChange={(e) => setForm({ ...form, public_reply: e.target.value })}
                  rows={2}
                  className={inputClass}
                  placeholder="Sent it to your DMs, {{first_name}} 📩"
                />
              </Field>

              <Field
                label="Private DM"
                hint="Sent inside the 7-day window. Variables: {{first_name}}, {{username}}, {{keyword}}, {{count}}."
              >
                <textarea
                  value={form.dm_message}
                  onChange={(e) => setForm({ ...form, dm_message: e.target.value })}
                  rows={3}
                  className={inputClass}
                  placeholder="Hey {{first_name}}! Here is the guide you asked for…"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="DM button label">
                  <input
                    value={form.dm_button_label}
                    onChange={(e) => setForm({ ...form, dm_button_label: e.target.value })}
                    placeholder="Open the guide"
                    className={inputClass}
                  />
                </Field>
                <Field label="Button link">
                  <input
                    value={form.dm_button_url}
                    onChange={(e) => setForm({ ...form, dm_button_url: e.target.value })}
                    placeholder="https://…"
                    className={inputClass}
                  />
                </Field>
                <Field label="Daily cap (0 = none)" hint="DMs per day, counted in Dhaka time.">
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={form.daily_cap}
                    onChange={(e) => setForm({ ...form, daily_cap: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={
                    form.match_mode === "ai"
                      ? "Goal — this is what the AI reads to decide"
                      : "Goal (a lead is recorded when the DM goes out)"
                  }
                  hint={
                    form.match_mode === "ai"
                      ? "With “the AI reads it and decides”, this line is the whole description the model gets. Leave it vague and the rule will rarely fire."
                      : undefined
                  }
                >
                  <input
                    value={form.goal}
                    onChange={(e) => setForm({ ...form, goal: e.target.value })}
                    placeholder="guide"
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Which posts?"
                  hint="“The next post I publish” pins itself to the first post this rule ever sees — write the rule before you post."
                >
                  <select
                    value={form.post_scope}
                    onChange={(e) =>
                      setForm({ ...form, post_scope: e.target.value as Form["post_scope"] })
                    }
                    className={inputClass}
                  >
                    <option value="any">Any post</option>
                    <option value="post">One specific post</option>
                    <option value="next">The next post I publish</option>
                  </select>
                </Field>
                {form.post_scope === "post" && (
                  <Field
                    label="Post / media id"
                    hint="The id of the post this rule belongs to."
                  >
                    <input
                      value={form.post_id}
                      onChange={(e) => setForm({ ...form, post_id: e.target.value })}
                      placeholder="17912345678901234"
                      className={inputClass}
                    />
                  </Field>
                )}
                <Field
                  label="Note (for you — shown beside the rule)"
                  hint="What a keyword cannot hold: what to say when this one lands while you are live."
                >
                  <input
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="Say the price out loud when this comes in live"
                    className={inputClass}
                  />
                </Field>
                <label className="flex items-end gap-2 pb-2 text-[12px] text-fg2">
                  <input
                    type="checkbox"
                    checked={form.counter_enabled}
                    onChange={(e) => setForm({ ...form, counter_enabled: e.target.checked })}
                  />
                  Offer {"{{count}}"} — how many times this person has triggered it
                </label>
              </div>

              <FlowBuilder
                steps={form.flow_steps}
                fallbackMessage={form.dm_message}
                onChange={(steps) => setForm({ ...form, flow_steps: steps })}
              />

              <div className="flex justify-end gap-2">
                <OutlineBtn onClick={() => setForm(null)}>Cancel</OutlineBtn>
                <PrimaryBtn onClick={save} loading={busy === "save"} disabled={!form.name.trim()}>
                  {form.id ? "Save changes" : "Create automation"}
                </PrimaryBtn>
              </div>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-fg2">
              {loading ? "Loading…" : `${automations.length} automation(s)`}
            </span>
            {!form && (
              <PrimaryBtn onClick={() => setForm({ ...EMPTY_FORM })}>
                <Plus size={14} /> New automation
              </PrimaryBtn>
            )}
          </div>

          {!loading && automations.length === 0 && !form && (
            <EmptyState
              icon={<Zap size={20} />}
              title="No automations yet"
              description="Create one, then press Simulate and watch the real engine answer — exactly what Instagram will trigger in stage 2."
            />
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {automations.map((a) => (
              <Card key={a.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-fg">{a.name}</span>
                      <Badge tone={a.enabled ? "success" : "neutral"}>
                        {a.enabled ? "on" : "off"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-mute">
                      {a.trigger_type === "dm" ? "Direct message" : "Comment"} ·{" "}
                      {a.match_mode === "ai" ? "the AI decides" : a.match_mode.replace("_", " ")}
                       {a.daily_cap ? ` · cap ${a.daily_cap}/day` : ""}
                       {a.goal ? ` · goal: ${a.goal}` : ""}
                       {a.post_scope === "next"
                         ? " · the next post"
                         : a.post_scope === "post"
                           ? " · one post"
                           : ""}
                     </div>
                     {a.note ? (
                       <p className="mt-1 text-[11px] text-fg2">📝 {a.note}</p>
                     ) : null}
                   </div>
                   <div className="flex shrink-0 items-center gap-1">
                     <button
                       onClick={() => void toggle(a)}
                       title={a.enabled ? "Turn off" : "Turn on"}
                       className={`grid h-6 w-6 place-items-center rounded border border-line ${
                         a.enabled ? "text-lime" : "text-mute"
                       } hover:border-lime`}
                     >
                       <Power size={12} />
                     </button>
                     {/*
                       A template, not a copy: same rules and flow, a new name, and — for
                       the common case — aimed at a post of its own.
                     */}
                     <button
                       onClick={() => duplicate(a)}
                       title="Use as a template for another post"
                       className="h-6 rounded border border-line px-1.5 text-[11px] text-fg2 hover:border-lime hover:text-lime"
                     >
                       Copy
                     </button>
                     <button
                       onClick={() => edit(a)}
                       title="Edit"
                       className="h-6 rounded border border-line px-1.5 text-[11px] text-fg2 hover:border-lime hover:text-lime"
                     >
                       Edit
                     </button>
                    <button
                      onClick={() => void remove(a)}
                      title="Delete"
                      className="grid h-6 w-6 place-items-center rounded border border-line text-mute hover:border-err hover:text-err"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {keywordList(a).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {keywordList(a).map((k) => (
                      <span
                        key={k}
                        className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-fg2"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] text-mute">Answers every comment</span>
                )}

                {a.public_reply && (
                  <p className="text-[12px] text-fg2">
                    <span className="text-mute">Public:</span> {a.public_reply}
                  </p>
                )}
                {a.dm_message && (
                  <p className="text-[12px] text-fg2">
                    <span className="text-mute">DM:</span> {a.dm_message}
                  </p>
                )}
                {flowOf(a).length > 0 && (
                  <div className="space-y-0.5 border-l-2 border-line pl-2">
                    <span className="text-[11px] text-mute">
                      Flow · {flowOf(a).length} step(s)
                    </span>
                    {flowOf(a).map((s, i) => (
                      <p key={s.id} className="text-[11px] text-fg2">
                        {i + 1}. {STEP_KINDS.find((k) => k.kind === s.kind)?.label ?? s.kind} —{" "}
                        {describeStep(s)}
                      </p>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === "simulate" && (
        <div className="space-y-4">
          <Simulator automations={automations} />
          <FollowUps />
        </div>
      )}
      {tab === "inbox" && <InboxView />}
      {tab === "contacts" && <ContactsView />}
      {tab === "tags" && <TagsView />}
      {tab === "analytics" && <AnalyticsView />}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

const inputClass =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-fg outline-none placeholder:text-mute focus:border-lime";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] uppercase tracking-wide text-mute">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-mute">{hint}</span>}
    </label>
  );
}

/**
 * The flow builder.
 *
 * An empty sequence is not a broken flow — it means "just send the DM message
 * above", which is what every rule written before this existed already did. The
 * builder says so out loud instead of showing an empty box, because "nothing here"
 * and "nothing will happen" are very different promises.
 */
function FlowBuilder({
  steps,
  fallbackMessage,
  onChange,
}: {
  steps: FlowStep[];
  fallbackMessage: string;
  onChange: (steps: FlowStep[]) => void;
}) {
  const patch = (id: string, next: Partial<FlowStep>) =>
    onChange(steps.map((s) => (s.id === id ? { ...s, ...next } : s)));

  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= steps.length) return;
    const copy = [...steps];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  };

  const add = (kind: string) =>
    onChange([
      ...steps,
      { id: crypto.randomUUID(), kind, amount: kind === "delay" ? 4 : undefined, unit: kind === "delay" ? "hours" : undefined },
    ]);

  const waits = steps.filter((s) => s.kind === "delay").length;

  return (
    <div className="space-y-2 rounded-md border border-line bg-surface/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[11px] uppercase tracking-wide text-mute">
            Flow — the sequence the bot runs
          </span>
          <p className="text-[11px] text-mute">
            {steps.length === 0
              ? "Empty: the DM message above is the whole flow."
              : `${steps.length} step(s)${waits ? `, ${waits} wait(s) — the cron resumes those` : ""}.`}
          </p>
        </div>
        {steps.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="rounded border border-line px-2 py-1 text-[11px] text-mute hover:border-err hover:text-err"
          >
            Clear flow
          </button>
        )}
      </div>

      {steps.map((s, i) => {
        const meta = STEP_KINDS.find((k) => k.kind === s.kind);
        return (
          <div key={s.id} className="rounded border border-line bg-surface p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[11px] text-fg2">
                <span className="grid h-5 w-5 place-items-center rounded-full border border-line text-[10px] text-mute">
                  {i + 1}
                </span>
                <span className="font-semibold text-fg">{meta?.label ?? s.kind}</span>
                <span className="text-mute">{describeStep(s)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded border border-line px-1.5 text-[11px] text-fg2 disabled:opacity-30 hover:border-lime"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === steps.length - 1}
                  className="rounded border border-line px-1.5 text-[11px] text-fg2 disabled:opacity-30 hover:border-lime"
                >
                  ↓
                </button>
                <button
                  onClick={() => onChange(steps.filter((x) => x.id !== s.id))}
                  className="grid h-5 w-5 place-items-center rounded border border-line text-mute hover:border-err hover:text-err"
                >
                  <X size={11} />
                </button>
              </span>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {s.kind === "message" && (
                <div className="sm:col-span-2">
                  <textarea
                    value={s.text ?? ""}
                    onChange={(e) => patch(s.id, { text: e.target.value })}
                    rows={2}
                    placeholder="Hey {{first_name}} — here is what you asked for:"
                    className={inputClass}
                  />
                </div>
              )}

              {s.kind === "button" && (
                <>
                  <input
                    value={s.label ?? ""}
                    onChange={(e) => patch(s.id, { label: e.target.value })}
                    placeholder="Open the guide"
                    className={inputClass}
                  />
                  <input
                    value={s.url ?? ""}
                    onChange={(e) => patch(s.id, { url: e.target.value })}
                    placeholder="https://…"
                    className={inputClass}
                  />
                </>
              )}

              {s.kind === "quick_reply" && (
                <div className="sm:col-span-2">
                  <input
                    value={(s.options ?? []).join(", ")}
                    onChange={(e) =>
                      patch(s.id, {
                        options: e.target.value
                          .split(",")
                          .map((o) => o.trim())
                          .filter(Boolean)
                          .slice(0, 3),
                      })
                    }
                    placeholder="Yes please, Tell me more, Not now"
                    className={inputClass}
                  />
                </div>
              )}

              {s.kind === "library" && (
                <>
                  <input
                    value={s.library_type ?? "script"}
                    onChange={(e) => patch(s.id, { library_type: e.target.value })}
                    placeholder="script"
                    className={inputClass}
                  />
                  <select
                    value={s.library_pick ?? "newest"}
                    onChange={(e) => patch(s.id, { library_pick: e.target.value })}
                    className={inputClass}
                  >
                    <option value="newest">Newest of that type</option>
                    <option value="best">Best scored</option>
                  </select>
                </>
              )}

              {s.kind === "delay" && (
                <>
                  <input
                    type="number"
                    min={0}
                    value={s.amount ?? 0}
                    onChange={(e) => patch(s.id, { amount: Number(e.target.value) })}
                    className={inputClass}
                  />
                  <select
                    value={s.unit ?? "minutes"}
                    onChange={(e) => patch(s.id, { unit: e.target.value })}
                    className={inputClass}
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </>
              )}

              {s.kind === "condition" && (
                <>
                  <select
                    value={s.field ?? "keyword"}
                    onChange={(e) => patch(s.id, { field: e.target.value })}
                    className={inputClass}
                  >
                    <option value="keyword">the matched keyword</option>
                    <option value="text">what they wrote</option>
                    <option value="count">how many times they triggered it</option>
                    <option value="tag">their tags</option>
                    <option value="field:plan">their “plan” field</option>
                    <option value="field:city">their “city” field</option>
                  </select>
                  <select
                    value={s.op ?? "is"}
                    onChange={(e) => patch(s.id, { op: e.target.value })}
                    className={inputClass}
                  >
                    <option value="is">is</option>
                    <option value="is_not">is not</option>
                    <option value="contains">contains</option>
                    <option value="not_contains">does not contain</option>
                    <option value="has_tag">has the tag</option>
                    <option value="not_has_tag">does not have the tag</option>
                    <option value="gt">is more than</option>
                    <option value="lt">is less than</option>
                  </select>
                  <input
                    value={s.value ?? ""}
                    onChange={(e) => patch(s.id, { value: e.target.value })}
                    placeholder="guide"
                    className={`${inputClass} sm:col-span-2`}
                  />
                </>
              )}

              {s.kind === "tag" && (
                <input
                  value={s.label ?? ""}
                  onChange={(e) => patch(s.id, { label: e.target.value })}
                  placeholder="asked-for-guide"
                  className={`${inputClass} sm:col-span-2`}
                />
              )}

              {s.kind === "field" && (
                <>
                  <input
                    value={s.field ?? ""}
                    onChange={(e) => patch(s.id, { field: e.target.value })}
                    placeholder="plan"
                    className={inputClass}
                  />
                  <input
                    value={s.value ?? ""}
                    onChange={(e) => patch(s.id, { value: e.target.value })}
                    placeholder="pro"
                    className={inputClass}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[11px] text-mute">Add step</span>
        {STEP_KINDS.map((k) => (
          <button
            key={k.kind}
            onClick={() => add(k.kind)}
            title={k.hint}
            className="rounded-full border border-line px-2.5 py-1 text-[11px] text-fg2 hover:border-lime hover:text-lime"
          >
            {k.label}
          </button>
        ))}
        <button
          onClick={() => onChange([...steps, ...LADDER_STEPS()])}
          className="rounded-full border border-line px-2.5 py-1 text-[11px] text-lime hover:border-lime"
        >
          + 4h / 23h follow-up ladder
        </button>
      </div>

      {steps.length > 0 && fallbackMessage.trim() && (
        <p className="text-[11px] text-mute">
          The flow replaces the “DM message” box — that box is only used while the flow is
          empty.
        </p>
      )}
    </div>
  );
}

/** "in 3h 20m" / "due now" — the ladder's clock, in words. */
function dueIn(ts?: number | null): string {
  if (!ts) return "—";
  const diff = ts - Date.now();
  if (diff <= 0) return "due now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
}

/**
 * Try comments against the rules without running anything.
 *
 * The Simulator runs the real engine, which means it writes real rows — a contact, an
 * Inbox thread, events. That is the right way to prove behaviour and the wrong way to
 * tune a keyword list. This only matches: nothing stored, nothing sent.
 *
 * It does not consult the model, so an `ai`-mode rule never appears here — that one has
 * to go through the Simulator, where the decision is recorded and can be read back.
 */
function KeywordTester() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<
    Array<{ text: string; matched: boolean; automation: string; keyword: string | null }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", lines }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not test those.");
      setRows(json.results ?? []);
    } catch (err: any) {
      setRows([]);
      setError(err?.message ?? "Could not test those.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical size={14} className="text-mute" />
        <span className="text-sm font-semibold text-fg">Keyword tester</span>
      </div>
      <p className="text-[12px] text-mute">
        One comment per line. Matching only — nothing is stored and nothing is sent, so you
        can tune a rule without filling your own Inbox.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={"send me the guide\ndam koto bhai"}
        className={`${inputClass} resize-y`}
      />
      <OutlineBtn className="h-8 px-3 text-[12px]" onClick={run} loading={busy}>
        Test these
      </OutlineBtn>
      {rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[12px] text-fg2">{r.text}</span>
              <span className="shrink-0 text-[11px] text-mute">
                {r.matched ? `${r.automation} · “${r.keyword ?? "any"}”` : "no rule"}
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-[12px] text-err">{error}</p>}
    </Card>
  );
}

/**
 * The follow-up ladder, made visible.
 *
 * A `delay` step parks a row in `dm_flow_runs` and the fifteen-minute cron picks it
 * up — so until now the only way to see a waiting follow-up was to read the database.
 * This shows the queue, lets one be cancelled, and runs the due ones on demand: dry by
 * default, because a test must never be able to land in a real inbox.
 */
function FollowUps() {
  const [runs, setRuns] = useState<PendingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<DrainReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/dm?action=runs");
      const json = await res.json();
      setRuns(json.runs ?? []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (run: PendingRun) => {
    setBusy(run.id);
    setError(null);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel-run",
          conversation_id: run.conversation_id,
          reason: "cancelled from the Simulate tab",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not cancel it.");
      setRuns(json.runs ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Could not cancel it.");
    } finally {
      setBusy(null);
    }
  };

  const drain = async (live: boolean) => {
    setBusy(live ? "live" : "dry");
    setError(null);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drain", live }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "The run failed.");
      setReport(json as DrainReport);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "The run failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Timer size={14} className="text-mute" />
        <span className="text-sm font-semibold text-fg">Follow-up ladder</span>
        {runs.length > 0 && <Badge tone="info">{runs.length} waiting</Badge>}
      </div>
      <p className="text-[12px] text-mute">
        A <span className="text-fg2">delay</span> step parks a row here and the{" "}
        <span className="text-fg2">*/15</span> cron picks it up — the wait is a row, not a timer in
        memory. The cron runs this same job every fifteen minutes; this button is so you do not have
        to wait for it.
      </p>

      {loading ? (
        <p className="text-sm text-mute">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-[12px] text-mute">
          Nothing is waiting. Add a <span className="text-fg2">delay</span> step to a flow and run a
          simulation — the parked wait appears here.
        </p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div
              key={run.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[12px] text-fg">
                  {run.automation_name ?? "an automation"} · step {run.step_index + 1}
                </p>
                <p className="text-[11px] text-mute">
                  {run.status === "running" ? "running now" : dueIn(run.run_at)} ·{" "}
                  {new Date(run.run_at).toLocaleString()}
                </p>
              </div>
              <OutlineBtn
                className="h-8 px-3 text-[12px]"
                onClick={() => cancel(run)}
                loading={busy === run.id}
              >
                <Ban size={13} /> Cancel
              </OutlineBtn>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <OutlineBtn
          className="h-8 px-3 text-[12px]"
          onClick={() => drain(false)}
          loading={busy === "dry"}
        >
          <RefreshCw size={13} /> Run due follow-ups (dry)
        </OutlineBtn>
        {report && report.due > 0 && (
          <OutlineBtn
            className="h-8 px-3 text-[12px]"
            onClick={() => drain(true)}
            loading={busy === "live"}
          >
            <Play size={13} /> Send these {report.due} for real
          </OutlineBtn>
        )}
      </div>

      {report && (
        <p className="text-[11px] text-mute">
          {report.due} due · {report.resumed} sent · {report.cancelled} cancelled · {report.failed}{" "}
          failed
          {report.simulated ? " — nothing was sent to Instagram" : ""}
        </p>
      )}
      {error && <p className="text-[12px] text-err">{error}</p>}
    </Card>
  );
}

function Simulator({ automations }: { automations: Automation[] }) {
  const [text, setText] = useState("send me the guide please");
  const [kind, setKind] = useState<"comment" | "dm">("comment");
  const [first, setFirst] = useState("Riko");
  const [username, setUsername] = useState("riko_t");
  const [stale, setStale] = useState(0);
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          text,
          kind,
          first_name: first,
          username,
          ig_user_id: `sim_${(username || "tester").toLowerCase().replace(/[^a-z0-9_.]/g, "")}`,
          ...(stale > 0 ? { assume_stale_days: stale } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "The simulation failed.");
      setResult(json.result as SimResult);
    } catch (err: any) {
      setError(err?.message ?? "The simulation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold text-fg">Simulate a comment</div>
        <p className="text-[12px] text-mute">
          This runs the same engine a real Instagram event will run in stage 2 — the
          rule, the public reply, the DM and the daily cap are all real. What it
          writes shows up in the Inbox, Contacts and Analytics.
        </p>
        <ul className="space-y-1 text-[11px] text-mute">
          <li>
            • <span className="text-fg2">public reply</span> — always allowed.
          </li>
          <li>
            • <span className="text-fg2">private reply</span> — one per comment, inside 7
            days of that comment. Send the same simulation twice: the second run is
            refused, because it is the same comment.
          </li>
          <li>
            • <span className="text-fg2">automated DM</span> — only while their own
            message is under 24 hours old. When neither applies the bot stops and puts
            a hand-written reply in your task queue (a human has 7 days).
          </li>
        </ul>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What they wrote">
            <input value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Kind">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "comment" | "dm")}
              className={inputClass}
            >
              <option value="comment">Comment</option>
              <option value="dm">Direct message</option>
            </select>
          </Field>
          <Field label="First name">
            <input value={first} onChange={(e) => setFirst(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Username">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Pretend the comment / last message was N days ago (0 = now)"
          hint="8 blocks the private reply (Meta allows it only inside 7 days of the comment); 2 also closes the 24-hour conversation. Neither is a setting of ours."
        >
          <input
            type="number"
            min={0}
            max={60}
            value={stale}
            onChange={(e) => setStale(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>

        {automations.length === 0 && (
          <p className="text-[12px] text-warn">
            There are no automations yet — create one first or nothing can match.
          </p>
        )}

        <div className="flex justify-end">
          <PrimaryBtn onClick={run} loading={busy} disabled={!text.trim()}>
            <Play size={14} /> Run the engine
          </PrimaryBtn>
        </div>
        {error && <p className="text-[12px] text-err">{error}</p>}
      </Card>

      {result && (
        <>
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">What the engine decided</span>
              <Badge tone={result.matched ? "success" : "warning"}>
                {result.matched ? "matched" : "no match"}
              </Badge>
              {result.keyword && <Badge tone="info">keyword: {result.keyword}</Badge>}
              {result.dm && (
                <Badge tone="success">
                  {result.dmVia === "private_reply" ? "private reply" : "DM (open window)"}
                </Badge>
              )}
              {result.handoff && <Badge tone="warning">waiting for you</Badge>}
              <Badge tone={result.withinWindow ? "neutral" : "danger"}>
                {result.withinWindow ? "24h window open" : "24h window closed"}
              </Badge>
            </div>

            <ol className="space-y-2">
              {result.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  {s.ok ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-fg">{s.label}</span>
                    <span className="block whitespace-pre-wrap text-[11px] text-mute">
                      {s.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="space-y-2 p-4">
              <div className="text-[11px] uppercase tracking-wide text-mute">
                Public reply {result.publicReply ? "" : "(none sent)"}
              </div>
              <p className="whitespace-pre-wrap text-sm text-fg2">
                {result.publicReply ?? "—"}
              </p>
            </Card>
            <Card className="space-y-2 p-4">
              <div className="text-[11px] uppercase tracking-wide text-mute">
                Direct message {result.dm ? "" : "(not sent)"}
              </div>
              <p className="whitespace-pre-wrap text-sm text-fg2">{result.dm ?? "—"}</p>
            </Card>
          </div>

          <p className="text-[11px] text-mute">
            Nothing was sent to Instagram — this is recorded as a simulation. Stage 2
            uses the identical path with the real event.
          </p>
        </>
      )}
    </div>
  );
}

function InboxView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/dm?action=inbox");
      const json = await res.json();
      setConversations(json.conversations ?? []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setOpenId(id);
    setMessages([]);
    setDrafts([]);
    setDraftError(null);
    try {
      const res = await apiFetch(`/api/dm?action=conversation&id=${encodeURIComponent(id)}`);
      const json = await res.json();
      setMessages(json.messages ?? []);
    } catch {
      setMessages([]);
    }
  };

  /**
   * Hand the thread to the bot, or take it back. The same call the Instagram echo
   * makes when you answer from the app, so the button and reality agree.
   */
  const setPaused = async (id: string, paused: boolean) => {
    setBusy(id);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: paused ? "pause" : "resume", conversation_id: id }),
      });
      const json = await res.json().catch(() => null);
      if (json?.conversations) setConversations(json.conversations);
      else await load();
    } catch {
      /* the chip simply will not change */
    } finally {
      setBusy(null);
    }
  };

  /**
   * Drafts are suggestions, never sends. This asks for two and shows them; copying one
   * out is the owner's job, which is the whole point — the thread stopped because it
   * needed a human.
   */
  const draft = async () => {
    if (!openId) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drafts", conversation_id: openId }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not write a draft.");
      setDrafts(json.drafts ?? []);
    } catch (err: any) {
      setDrafts([]);
      setDraftError(err?.message ?? "Could not write a draft.");
    } finally {
      setDrafting(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      /* clipboard blocked — the text is still on screen to select by hand */
    }
  };

  if (loading) return <p className="text-sm text-mute">Loading…</p>;

  const current = conversations.find((c) => c.id === openId) ?? null;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_1fr]">
      <Card className="p-2">
        {conversations.length === 0 ? (
          <p className="p-3 text-sm text-mute">
            No conversations yet. Run a simulation and it appears here.
          </p>
        ) : (
          <div className="space-y-1">
            {conversations.map((c) => {
              const left = windowHoursLeft(c.last_inbound_at);
              return (
                <button
                  key={c.id}
                  onClick={() => void open(c.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left ${
                    openId === c.id
                      ? "border-lime bg-[rgba(82,255,46,0.06)]"
                      : "border-transparent hover:border-line"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-fg">
                      {c.first_name || c.username || "Unknown"}
                    </span>
                    <span className="shrink-0 text-[10px] text-mute">
                      {when(c.last_message_at)}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-mute">{c.last_text ?? "—"}</div>
                   <div className="mt-1 flex flex-wrap items-center gap-1">
                     {c.bot_paused ? (
                       <Badge tone="warning">Bot paused</Badge>
                     ) : (
                       c.status !== "open" && <Badge tone="warning">{c.status}</Badge>
                     )}
                     {left !== null && left <= 6 && (
                      <span className="text-[10px] text-warn">
                        <Clock size={9} className="mr-0.5 inline" />
                        {left > 0
                          ? `24h window closes in ${left}h`
                          : "24h window closed — a human can still reply for 7 days"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="space-y-2 p-4">
        {current && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-fg">
                  {current.first_name || current.username || "Unknown"}
                </span>
                {current.bot_paused ? (
                  <Badge tone="warning">Bot paused</Badge>
                ) : (
                  <Badge tone="success">Bot answering</Badge>
                )}
              </div>
              <p className="text-[11px] text-mute">
                {current.bot_paused
                  ? current.paused_reason ?? "You took this thread over by hand."
                  : "Automation is live on this thread."}
              </p>
            </div>
            {current.bot_paused ? (
              <OutlineBtn
                onClick={() => void setPaused(current.id, false)}
                disabled={busy === current.id}
              >
                {busy === current.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Resume the bot
              </OutlineBtn>
            ) : (
              <OutlineBtn
                onClick={() => void setPaused(current.id, true)}
                disabled={busy === current.id}
              >
                {busy === current.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                Take over
              </OutlineBtn>
            )}
          </div>
        )}

        {!openId ? (
          <p className="text-sm text-mute">Pick a conversation.</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-mute">No messages stored for this conversation.</p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg border px-3 py-2 ${
                m.direction === "in"
                  ? "border-line bg-surface"
                  : "ml-auto border-lime/40 bg-[rgba(82,255,46,0.06)]"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-[10px] text-mute">
                <span>{m.direction === "in" ? "them" : "you"}</span>
                <span>· {m.channel}</span>
                {m.status !== "sent" && <span>· {m.status}</span>}
                {m.matched_keyword && <span>· matched “{m.matched_keyword}”</span>}
                <span>· {when(m.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-[12px] text-fg2">{m.text}</p>
            </div>
          ))
        )}

        {openId && (
          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles size={13} className="text-mute" />
              <span className="text-[12px] text-fg">Reply drafts</span>
              <OutlineBtn
                className="h-8 px-3 text-[12px]"
                onClick={draft}
                loading={drafting}
              >
                <Wand2 size={13} /> Draft a reply
              </OutlineBtn>
            </div>
            <p className="text-[11px] text-mute">
              Two suggestions, in the thread's own language. Nothing is sent from here —
              sending stays yours.
            </p>
            {drafts.length > 0 && (
              <div className="space-y-2">
                {drafts.map((d, i) => (
                  <div key={i} className="rounded-md border border-line px-3 py-2">
                    <p className="whitespace-pre-wrap text-[12px] text-fg2">{d}</p>
                    <button
                      onClick={() => void copy(d)}
                      className="mt-1 text-[11px] text-mute transition-colors hover:text-lime"
                    >
                      {copied === d ? "copied" : "copy"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {draftError && <p className="text-[12px] text-err">{draftError}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

function ContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagFor, setTagFor] = useState<string | null>(null);
  const [tagName, setTagName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/dm?action=contacts");
      const json = await res.json();
      setContacts(json.contacts ?? []);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addTag = async (contact: Contact) => {
    const name = tagName.trim();
    if (!name) return;
    setBusy(contact.id);
    setError(null);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tag", contact_id: contact.id, name }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not tag them.");
      setTagFor(null);
      setTagName("");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not tag them.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-sm text-mute">Loading…</p>;
  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={<Users size={20} />}
        title="No contacts yet"
        description="Anyone the engine has seen — even with no rule matching — is stored here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-wide text-mute">
            <tr>
              <th className="px-4 py-2">Person</th>
              <th className="px-4 py-2">Handle</th>
              <th className="px-4 py-2">Tags</th>
              <th className="px-4 py-2">Fields</th>
              <th className="px-4 py-2">Comments</th>
              <th className="px-4 py-2">DMs in</th>
              <th className="px-4 py-2">Leads</th>
              <th className="px-4 py-2">Seen</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const tags = c.tags ?? [];
              const fields = Object.entries(c.fields ?? {});
              return (
                <tr key={c.id} className="border-b border-line/60 align-top last:border-0">
                  <td className="px-4 py-2 text-fg">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-2 text-fg2">@{c.username ?? c.ig_user_id ?? "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {tags.length === 0 && <span className="text-[11px] text-mute">none</span>}
                      {tags.map((t) => (
                        <Badge key={t} tone="info">
                          {t}
                        </Badge>
                      ))}
                      {tagFor === c.id ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            autoFocus
                            value={tagName}
                            onChange={(e) => setTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void addTag(c);
                              if (e.key === "Escape") {
                                setTagFor(null);
                                setTagName("");
                              }
                            }}
                            placeholder="tag"
                            className="h-7 w-24 rounded border border-line bg-surface px-2 text-[12px] text-fg outline-none placeholder:text-mute focus:border-lime"
                          />
                          <GhostBtn
                            className="h-7 px-2 text-[11px]"
                            onClick={() => addTag(c)}
                            loading={busy === c.id}
                          >
                            Save
                          </GhostBtn>
                          <GhostBtn
                            className="h-7 px-2 text-[11px] text-mute"
                            onClick={() => {
                              setTagFor(null);
                              setTagName("");
                            }}
                          >
                            Cancel
                          </GhostBtn>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setTagFor(c.id);
                            setTagName("");
                          }}
                          className="text-[11px] text-mute transition-colors hover:text-lime"
                        >
                          + tag
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {fields.length === 0 ? (
                      <span className="text-[11px] text-mute">none</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {fields.map(([k, v]) => (
                          <Badge key={k} tone="neutral">
                            {k}={v || "—"}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-fg2">{c.comments}</td>
                  <td className="px-4 py-2 text-fg2">{c.dms}</td>
                  <td className="px-4 py-2 text-fg2">{c.leads}</td>
                  <td className="px-4 py-2 text-mute">{when(c.last_seen_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {error && <p className="text-[12px] text-err">{error}</p>}
    </div>
  );
}

/**
 * Tags, on their own page.
 *
 * A tag is created one of two ways: by a flow's `tag` step, or by tagging somebody by
 * hand from the Contacts tab. Until now it lived only inside a flow definition — there
 * was no list, and no way to undo one.
 */
function TagsView() {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/dm?action=tags");
      const json = await res.json();
      setTags(json.tags ?? []);
    } catch {
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (tag: TagRow) => {
    setBusy(tag.id);
    setError(null);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-tag", tag_id: tag.id }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not delete it.");
      setConfirmId(null);
      setTags(json.tags ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Could not delete it.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-sm text-mute">Loading…</p>;
  if (tags.length === 0) {
    return (
      <EmptyState
        icon={<Tag size={20} />}
        title="No tags yet"
        description="A flow's tag step writes them, or tag somebody by hand from the Contacts tab. They appear here to be seen and removed."
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tag size={14} className="text-mute" />
          <span className="text-sm font-semibold text-fg">Tags</span>
          <Badge tone="neutral">{tags.length}</Badge>
        </div>
        <p className="text-[12px] text-mute">
          Deleting a tag removes it from everyone who carries it. The people themselves are
          untouched — only the label goes.
        </p>
        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[12px] text-fg">{tag.name}</p>
                <p className="text-[11px] text-mute">
                  {tag.contacts === 1 ? "1 contact" : `${tag.contacts} contacts`}
                </p>
              </div>
              {confirmId === tag.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-warn">Remove it from everyone?</span>
                  <OutlineBtn
                    className="h-8 px-3 text-[12px]"
                    onClick={() => remove(tag)}
                    loading={busy === tag.id}
                  >
                    <Trash2 size={13} /> Delete
                  </OutlineBtn>
                  <GhostBtn
                    className="h-8 px-2 text-[12px] text-mute"
                    onClick={() => setConfirmId(null)}
                  >
                    Keep
                  </GhostBtn>
                </div>
              ) : (
                <OutlineBtn className="h-8 px-3 text-[12px]" onClick={() => setConfirmId(tag.id)}>
                  <Trash2 size={13} /> Delete
                </OutlineBtn>
              )}
            </div>
          ))}
        </div>
      </Card>
      {error && <p className="text-[12px] text-err">{error}</p>}
    </div>
  );
}

type AttributionRow = {
  postId: string;
  automation: string;
  leads: number;
  won: number;
  dms: number;
  latest: number;
  /** What the media id actually was, once the owner has said so. */
  label?: string;
  url?: string;
  caption?: string;
  likes?: number | null;
  comments?: number | null;
};

/** A media id is long and opaque; enough of it to tell two reels apart is enough. */
function shortPost(id: string): string {
  if (!id) return "any post / DMs";
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}

/**
 * Which post brought the leads.
 *
 * A blank post is not swept into an "other" bucket: it means the message was a DM, or a
 * comment Meta did not tell us the post for. Saying that plainly is the point — an
 * attribution table that hides its unknowns is one you end up trusting for the wrong
 * reason.
 */
function Attribution() {
  const [rows, setRows] = useState<AttributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorFor, setEditorFor] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/dm?action=attribution");
      const json = await res.json();
      setRows(json.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Say what a post was, once. A media id is not something a person can read, so without
   * this the table is accurate and useless — and the URL is also what joins the row to
   * `post_performance`, which is where the likes and comments come from.
   */
  const saveRef = async (postId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "post-ref",
          post_id: postId,
          url: urlDraft.trim() || null,
          label: labelDraft.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not save that.");
      setEditorFor(null);
      setUrlDraft("");
      setLabelDraft("");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not save that.");
    } finally {
      setBusy(false);
    }
  };

  const totalLeads = rows.reduce((n, r) => n + r.leads, 0);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BarChart2 size={14} className="text-mute" />
        <span className="text-sm font-semibold text-fg">Where the DMs came from</span>
        {totalLeads > 0 && <Badge tone="info">{totalLeads} lead(s)</Badge>}
      </div>
      <p className="text-[12px] text-mute">
        The post a person was first seen on, and the rule that answered them. Recorded
        from the comment that arrived, never inferred afterwards.
      </p>

      {loading ? (
        <p className="text-sm text-mute">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-mute">
          Nothing yet. A rule only records a lead when it has a goal, and a comment only
          carries a post when Meta sends one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wide text-mute">
              <tr>
                <th className="py-2 pr-4">Post</th>
                <th className="py-2 pr-4">Rule</th>
                <th className="py-2 pr-4">Leads</th>
                <th className="py-2 pr-4">Won</th>
                <th className="py-2 pr-4">DMs out</th>
                <th className="py-2">Post stats</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.postId}-${r.automation}-${i}`} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-4 text-fg2" title={r.postId || undefined}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{r.label || shortPost(r.postId)}</span>
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-mute underline transition-colors hover:text-lime"
                        >
                          open
                        </a>
                      )}
                      {!r.postId ? null : editorFor === r.postId ? (
                        <span className="flex flex-wrap items-center gap-1">
                          <input
                            autoFocus
                            value={urlDraft}
                            onChange={(e) => setUrlDraft(e.target.value)}
                            placeholder="https://instagram.com/p/…"
                            className="h-7 w-56 rounded border border-line bg-surface px-2 text-[12px] text-fg outline-none placeholder:text-mute focus:border-lime"
                          />
                          <input
                            value={labelDraft}
                            onChange={(e) => setLabelDraft(e.target.value)}
                            placeholder="name this reel"
                            className="h-7 w-40 rounded border border-line bg-surface px-2 text-[12px] text-fg outline-none placeholder:text-mute focus:border-lime"
                          />
                          <GhostBtn
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void saveRef(r.postId)}
                            loading={busy}
                          >
                            Save
                          </GhostBtn>
                          <GhostBtn
                            className="h-7 px-2 text-[11px] text-mute"
                            onClick={() => setEditorFor(null)}
                          >
                            Cancel
                          </GhostBtn>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setEditorFor(r.postId);
                            setUrlDraft(r.url ?? "");
                            setLabelDraft(r.label ?? "");
                          }}
                          className="text-[11px] text-mute transition-colors hover:text-lime"
                        >
                          {r.url ? "edit link" : "+ link this post"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-fg2">{r.automation || "—"}</td>
                  <td className="py-2 pr-4 text-fg2">{r.leads}</td>
                  <td className="py-2 pr-4 text-fg2">{r.won}</td>
                  <td className="py-2 pr-4 text-mute">{r.dms}</td>
                  <td className="py-2 text-mute">
                    {r.likes === null || r.likes === undefined
                      ? "—"
                      : `${r.likes} likes · ${r.comments ?? 0} comments`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pt-2 text-[11px] text-mute">
            “DMs out” counts every outbound message to the people that post brought in —
            volume beside the leads, not the same thing. “Post stats” come from
            <span className="text-fg2"> post_performance</span> once a post has a link.
          </p>
          {error && <p className="pt-2 text-[12px] text-err">{error}</p>}
        </div>
      )}
    </Card>
  );
}

/**
 * The questions nobody answered, and the Ideas they can become.
 *
 * Every unmatched comment is already recorded as a `no_match` event carrying its own
 * text, so this reads what the engine wrote instead of guessing. A rule can only match
 * what the owner already thought of — a question that keeps arriving is the one brief
 * they cannot get from the rules they have.
 */
function MineIdeas() {
  const [questions, setQuestions] = useState<Array<{ question: string; times: number }>>([]);
  const [created, setCreated] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mine-ideas" }),
      });
      const json = await res.json();
      setQuestions(json.questions ?? []);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mine-ideas", create: true }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not mint the ideas.");
      setCreated(json.created ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Could not mint the ideas.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Card className="p-4 text-sm text-mute">Loading…</Card>;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Lightbulb size={14} className="text-mute" />
        <span className="text-sm font-semibold text-fg">Questions you did not answer</span>
        {questions.length > 0 && <Badge tone="info">{questions.length}</Badge>}
      </div>
      <p className="text-[12px] text-mute">
        Comments no rule matched, asked more than once. Nothing is sent to anyone from
        here — an Idea is a note to yourself.
      </p>

      {questions.length === 0 ? (
        <p className="text-[12px] text-mute">
          Nothing repeating yet. Unmatched comments are recorded here as they arrive.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {questions.map((q) => (
              <div key={q.question} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[12px] text-fg2">{q.question}</span>
                <span className="shrink-0 text-[11px] text-mute">×{q.times}</span>
              </div>
            ))}
          </div>
          <OutlineBtn className="h-8 px-3 text-[12px]" onClick={create} loading={busy}>
            <Plus size={13} /> Turn these into Ideas
          </OutlineBtn>
        </>
      )}

      {created && (
        <p className="text-[11px] text-mute">
          {created.length === 0
            ? "Nothing new to add — those Ideas are already in the Library."
            : `${created.length} Idea(s) added to the Library.`}
        </p>
      )}
      {error && <p className="text-[12px] text-err">{error}</p>}
    </Card>
  );
}

function AnalyticsView() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/dm?action=analytics");
        const json = await res.json();
        setData(json as Analytics);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-sm text-mute">Loading…</p>;
  if (!data) return <p className="text-sm text-err">Could not load the numbers.</p>;

  const peak = Math.max(1, ...data.daily.map((d) => d.comments + d.dms));

  const tiles = [
    { label: "People seen", value: data.contacts },
    { label: "Conversations", value: data.conversations },
    { label: "Public replies", value: data.comments },
    { label: "DMs sent", value: data.dms },
    { label: "Leads", value: data.leads },
    { label: "Handed to you", value: data.handoffs },
    { label: "Skipped — window", value: data.windowSkips },
    { label: "Skipped — cap", value: data.capSkips },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-mute">{t.label}</div>
            <div className="mt-1 text-2xl font-bold text-lime">{t.value}</div>
          </Card>
        ))}
      </div>

      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold text-fg">Last 14 days</div>
        {data.daily.every((d) => d.comments + d.dms === 0) ? (
          <p className="text-[12px] text-mute">
            Nothing sent in the last two weeks — the bars stay flat until something is.
          </p>
        ) : (
          <div className="flex h-28 items-end gap-1">
            {data.daily.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-col justify-end gap-[2px]" style={{ height: "96px" }}>
                  <div
                    className="w-full rounded-sm bg-lime/70"
                    style={{ height: `${(d.comments / peak) * 96}px` }}
                    title={`${d.comments} public repl${d.comments === 1 ? "y" : "ies"}`}
                  />
                  <div
                    className="w-full rounded-sm bg-lime/30"
                    style={{ height: `${(d.dms / peak) * 96}px` }}
                    title={`${d.dms} DM(s)`}
                  />
                </div>
                <span className="text-[9px] text-mute">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] text-mute">
          Solid = public replies · light = DMs. Counted from stored messages only.
        </div>
      </Card>

      <Attribution />

      <MineIdeas />

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-wide text-mute">
            <tr>
              <th className="px-4 py-2">Automation</th>
              <th className="px-4 py-2">State</th>
              <th className="px-4 py-2">Triggers</th>
              <th className="px-4 py-2">DMs</th>
              <th className="px-4 py-2">Leads</th>
            </tr>
          </thead>
          <tbody>
            {data.perAutomation.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-mute">
                  No automations yet.
                </td>
              </tr>
            ) : (
              data.perAutomation.map((a) => (
                <tr key={a.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2 text-fg">{a.name}</td>
                  <td className="px-4 py-2">
                    <Badge tone={a.enabled ? "success" : "neutral"}>
                      {a.enabled ? "on" : "off"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-fg2">{a.triggers}</td>
                  <td className="px-4 py-2 text-fg2">{a.dms}</td>
                  <td className="px-4 py-2 text-fg2">{a.leads}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
