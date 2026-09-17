/**
 * Content OS — DM Manager engine (stage 1).
 *
 * The rules live here and nowhere else. A real Instagram comment (stage 2) and the
 * "Simulate a comment" button (stage 1) call the SAME `runEngine`, so what the
 * simulator shows is what the webhook will do — not a mock-up of it.
 *
 * What it does, in order:
 *   1. match the message against the user's enabled automations (keyword, scope);
 *   2. record the contact and the inbound message (the Inbox is only real if
 *      inbound messages are stored, even when nothing matches);
 *   3. answer publicly (comments) and privately — respecting the messaging window
 *      and the daily cap, and writing down every decision it made.
 *
 * The 7-day window is Meta's rule, not mine: you may keep replying to someone for
 * as long as they have written to you in the last seven days; an older thread
 * cannot be messaged again until they speak first. `assumeStaleDays` exists so the
 * simulator can prove that behaviour without waiting a week.
 */

import { createTask, dhakaDate } from "./telegram-hook";
import { callAi, extractJson } from "./ai";

/**
 * Meta's three clocks — they are NOT interchangeable:
 *
 *   a public reply to a comment  : no limit at all
 *   a private reply to a comment : once per COMMENT, within 7 days of the comment
 *   an automated direct message  : 24 hours from the person's last message
 *   a human writing by hand      : 7 days (the Human Agent tag; automation may not)
 *
 * A comment made four months after a post still arrives as a comment event, so it
 * still gets its reply — the clock that matters runs from the COMMENT, not the
 * post. That is why an automation here never "expires".
 */
export const DM_WINDOW_MS = 24 * 3_600_000;
export const COMMENT_REPLY_WINDOW_MS = 7 * 86_400_000;
export const HUMAN_WINDOW_MS = 7 * 86_400_000;

export type Automation = {
  id: string;
  user_id: string;
  name: string;
  trigger_type: "comment" | "dm" | string;
  keywords: string;
  match_mode: "contains" | "exact" | "any_word" | string;
  post_scope: "any" | "post" | string;
  post_id: string | null;
  public_reply: string | null;
  dm_message: string | null;
  dm_button_label: string | null;
  dm_button_url: string | null;
  counter_enabled: number;
  daily_cap: number;
  goal: string | null;
  enabled: number;
  /** S3: the sequence, as JSON. Empty ⇒ the stage-1 fields above are the whole flow. */
  flow_steps?: string | null;
  created_at: number;
  updated_at: number;
};

/* ------------------------------------------------------------------ the flow */

/**
 * One step of a flow. Every step is a flat object with a `kind`, because that is
 * what survives a round trip through JSON, a D1 TEXT column and a form in the UI
 * without three layers of unions disagreeing with each other.
 *
 *   message      text to send
 *   button       one tappable line (rendered as text — see the note in runFlow)
 *   quick_reply  up to three short options on one line
 *   delay        wait, then continue from the NEXT step (the row is a dm_flow_run)
 *   condition    stop the flow unless something is true
 *   tag          put a tag on the contact
 *   field        set a custom field on the contact
 */
export type FlowStep = {
  id?: string;
  kind: string;
  text?: string;
  label?: string;
  url?: string;
  options?: string[];
  amount?: number;
  unit?: string;
  /** condition */
  field?: string;
  op?: string;
  value?: string;
  /** library — hand over something real from the Library instead of a link */
  library_type?: string;
  library_id?: string;
  library_pick?: string;
};

export type FlowContext = {
  keyword: string | null;
  count: number;
  text: string;
  tags: string[];
  fields: Record<string, string>;
};

/** Defensive by design: a malformed step is dropped, never thrown. */
export function flowStepsOf(a: { flow_steps?: string | null }): FlowStep[] {
  try {
    const list = JSON.parse(a.flow_steps || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .filter((s) => s && typeof s === "object" && typeof s.kind === "string")
      .slice(0, 40) as FlowStep[];
  } catch {
    return [];
  }
}

/** How long a `delay` step waits. Unit-less input is read as minutes. */
export function delayMs(step: FlowStep): number {
  const n = Math.max(0, Math.floor(Number(step.amount ?? 0)) || 0);
  const unit = String(step.unit ?? "minutes").toLowerCase();
  const factor = unit === "hours" ? 3_600_000 : unit === "days" ? 86_400_000 : 60_000;
  // 30 days is well past every Meta window, so a longer wait is a typo, not a plan.
  return Math.min(n * factor, 30 * 86_400_000);
}

/** How a step reads in the trace and in the builder's list. */
export function stepLabel(step: FlowStep): string {
  switch (step.kind) {
    case "message":
      return "Message";
    case "button":
      return "Button";
    case "quick_reply":
      return "Quick replies";
    case "delay":
      return `Wait ${step.amount ?? 0} ${step.unit ?? "minutes"}`;
    case "condition":
      return `If ${step.field ?? "?"} ${step.op ?? "is"} ${step.value ?? ""}`.trim();
    case "tag":
      return `Tag ${step.label ?? step.text ?? ""}`.trim();
    case "field":
      return `Set ${step.field ?? step.label ?? ""}`.trim();
    case "library":
      return `Library ${step.library_type ?? step.library_id ?? "item"}`.trim();
    default:
      return step.kind;
  }
}

/** The newest — or best-scoring — Library row of the requested type. */
export async function pickLibraryItem(
  env: any,
  userId: string,
  step: FlowStep,
): Promise<{ id: string; title: string | null; type: string | null; content: string | null } | null> {
  try {
    if (step.library_id) {
      return (
        (await env.DB.prepare(
          "SELECT id, title, type, content FROM library WHERE id = ? AND user_id = ?",
        )
          .bind(String(step.library_id), userId)
          .first()) ?? null
      );
    }
    const type = String(step.library_type ?? "").trim();
    if (!type) return null;
    // The ORDER BY is one of two literals chosen here, never the caller's string.
    const order =
      step.library_pick === "best"
        ? "COALESCE(quality_score, 0) DESC, created_at DESC"
        : "created_at DESC";
    return (
      (await env.DB.prepare(
        `SELECT id, title, type, content FROM library
          WHERE user_id = ? AND type = ? AND (status IS NULL OR status != 'archived')
          ORDER BY ${order} LIMIT 1`,
      )
        .bind(userId, type)
        .first()) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * A Library row's text, fit to be read in a chat.
 *
 * Script and hook rows store JSON, and a DM that is a wall of JSON is worse than no
 * DM at all. This pulls out the parts a person actually reads. Anything it does not
 * recognise comes back untouched — mangling real work would be worse than sending it.
 */
export function libraryText(content: unknown): string {
  const raw = String(content ?? "").trim();
  if (!raw.startsWith("{")) return raw;
  try {
    const j: any = JSON.parse(raw);
    // A finished script has a formatted version; that *is* the readable text.
    if (typeof j.formatted === "string" && j.formatted.trim()) return j.formatted.trim();
    const parts: string[] = [];
    const push = (v: unknown) => {
      const s = String(v ?? "").trim();
      if (s) parts.push(s);
    };
    if (Array.isArray(j.hooks) && j.hooks.length) {
      const h = j.hooks[0];
      if (typeof h === "string") push(h);
      else if (h && typeof h === "object") push(h.spoken ?? h.text ?? h.text_overlay);
    }
    push(j.title);
    push(j.why_it_works);
    push(j.body);
    push(j.voiceover_script);
    push(j.cta);
    return parts.length ? parts.join("\n\n") : raw;
  } catch {
    return raw;
  }
}

export type MinedQuestion = { question: string; times: number; latest: number };

/**
 * Questions nobody answered.
 *
 * An unmatched comment is already recorded as a `no_match` event carrying its own
 * text, so this reads what the engine wrote rather than guessing. The same question
 * arriving again and again is the clearest brief an owner can be handed — and it is
 * the one brief they cannot get by looking at the rules they already have.
 */
export async function mineUnansweredQuestions(
  env: any,
  userId: string,
  min = 2,
  days = 90,
): Promise<MinedQuestion[]> {
  try {
    const since = Date.now() - Math.max(1, Math.floor(Number(days) || 90)) * 86_400_000;
    const { results } = await env.DB.prepare(
      `SELECT detail AS question, COUNT(*) AS times, MAX(created_at) AS latest
         FROM dm_events
        WHERE user_id = ? AND kind = 'no_match'
          AND detail IS NOT NULL AND length(trim(detail)) >= 12
          AND created_at >= ?
        GROUP BY lower(trim(detail))
       HAVING COUNT(*) >= ?
        ORDER BY times DESC, latest DESC
        LIMIT 25`,
    )
      .bind(userId, since, Math.max(2, Math.floor(Number(min)) || 2))
      .all();
    return (results ?? []) as MinedQuestion[];
  } catch {
    return [];
  }
}

/**
 * Turn a mined question into an Idea in the Library.
 *
 * The id is derived from the question, so asking twice the same thing does not leave
 * two ideas behind — and a re-run updates the "asked N times" line instead.
 */
export async function mintIdeaFromQuestion(
  env: any,
  userId: string,
  q: MinedQuestion,
): Promise<string | null> {
  const question = String(q?.question ?? "").trim();
  if (!question) return null;
  const slug =
    question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || String(Date.now());
  const id = `idea_mined_${slug}`;
  const now = Date.now();
  const content = JSON.stringify({
    id,
    title: question.slice(0, 160),
    why_it_works: `Asked ${Number(q.times) || 1} time(s) in comments and never answered.`,
    tags: ["from-comments"],
    format: "",
    content_pillar: null,
    status: "draft",
  });
  try {
    await env.DB.prepare(
      `INSERT INTO library (id, type, status, title, content, created_at, updated_at, user_id)
       VALUES (?, 'idea', 'draft', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         updated_at = excluded.updated_at`,
    )
      .bind(id, question.slice(0, 160), content, now, now, userId)
      .run();
    return id;
  } catch {
    return null;
  }
}

/**
 * Does this flow continue? A condition that cannot be evaluated is treated as met —
 * a broken condition must not silently swallow the rest of someone's flow.
 */
export function conditionMet(step: FlowStep, ctx: FlowContext): boolean {
  const field = String(step.field ?? "").toLowerCase();
  const op = String(step.op ?? "is").toLowerCase();
  const want = String(step.value ?? "").toLowerCase().trim();

  const actual = (() => {
    switch (field) {
      case "keyword":
        return { value: String(ctx.keyword ?? "").toLowerCase(), list: [] as string[] };
      case "text":
        return { value: ctx.text.toLowerCase(), list: [] as string[] };
      case "count":
        return { value: String(ctx.count), list: [] as string[] };
      case "tag":
        return { value: ctx.tags.join(",").toLowerCase(), list: ctx.tags.map((t) => t.toLowerCase()) };
      case "field":
        return { value: "", list: [] as string[] };
      default:
        // "field:<key>" reads a custom field.
        if (field.startsWith("field:")) {
          const key = field.slice(6);
          return { value: String(ctx.fields[key] ?? "").toLowerCase(), list: [] as string[] };
        }
        return { value: "", list: [] as string[] };
    }
  })();

  const numeric = field === "count";

  switch (op) {
    case "is_not":
      return actual.value !== want;
    case "contains":
      return actual.value.includes(want);
    case "not_contains":
      return !actual.value.includes(want);
    case "has_tag":
      return actual.list.includes(want);
    case "not_has_tag":
      return !actual.list.includes(want);
    case "gt":
      return Number(actual.value) > Number(want);
    case "lt":
      return Number(actual.value) < Number(want);
    case "is":
    default:
      return numeric ? Number(actual.value) === Number(want) : actual.value === want;
  }
}

export type Contact = {
  id: string;
  user_id: string;
  ig_user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  comments: number;
  dms: number;
  last_seen_at: number | null;
};

export type Step = {
  kind: string;
  label: string;
  detail: string;
  ok: boolean;
};

/**
 * How a message reaches Instagram. The simulator passes nothing (so every row is
 * stored as `simulated`); the webhook passes a function backed by the connected
 * account's token. Keeping it a parameter is what makes "the simulator runs the
 * real engine" true rather than a slogan — same decision code, different wire.
 */
export type Delivery = (args: {
  channel: "comment" | "dm";
  via: "public_reply" | "private_reply" | "conversation";
  text: string;
  commentId?: string | null;
  igsid?: string | null;
}) => Promise<{
  ok: boolean;
  error?: string;
  /** Instagram's id for the message it just accepted — see `wasSentByUs`. */
  messageId?: string;
}>;

export type EngineInput = {
  /** What the person wrote. */
  text: string;
  /** A comment on a post, or a DM. */
  kind: "comment" | "dm";
  postId?: string | null;
  /**
   * The comment's own id. Meta keys the "one private reply per comment" rule by
   * it, so without it a comment can only be answered through the conversation.
   */
  commentId?: string | null;
  contact: {
    ig_user_id: string;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
  /**
   * S3 resumes a flow through this same engine rather than re-implementing its
   * rules: pass the rule's id and the step to carry on from, and the window, the
   * cap, the pause flag and the trace all behave exactly as they do for a fresh
   * trigger. Nothing is re-matched and the inbound bookkeeping is skipped, because
   * on a follow-up the person did not write anything.
   */
  automationId?: string | null;
  startAt?: number;
  /** Stage-1 simulator: record everything, send nothing to Meta. */
  simulated?: boolean;
  /** Pretend this person's last message was N days ago, to exercise the window. */
  assumeStaleDays?: number;
  /** The real sender (webhook) or nothing at all (simulator). */
  deliver?: Delivery | null;
};

export type EngineResult = {
  matched: boolean;
  automation: { id: string; name: string } | null;
  keyword: string | null;
  publicReply: string | null;
  dm: string | null;
  /** How the DM went out — a private reply is not the same permission as a DM. */
  dmVia: "private_reply" | "conversation" | null;
  /** True when the DM was impossible and a hand-written reply is now waiting. */
  handoff: boolean;
  /** S3: the owner has taken this thread over by hand, so the bot stayed silent. */
  paused: boolean;
  contactId: string | null;
  conversationId: string | null;
  withinWindow: boolean;
  windowNote: string;
  steps: Step[];
};

/* ------------------------------------------------------------------ helpers */

function keywordsOf(a: Automation): string[] {
  try {
    const list = JSON.parse(a.keywords || "[]");
    return Array.isArray(list) ? list.map((k) => String(k).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Which automation answers this message, and with which keyword.
 * Order does not depend on luck: the oldest enabled rule wins, so two overlapping
 * rules never swap places between runs.
 */
export function matchAutomation(
  automations: Automation[],
  input: { text: string; kind: "comment" | "dm"; postId?: string | null },
): { automation: Automation; keyword: string | null } | null {
  const haystack = input.text.toLowerCase().trim();

  const candidates = automations
    .filter((a) => Number(a.enabled) === 1)
    .filter((a) => (a.trigger_type || "comment") === input.kind)
    .filter((a) => {
      if (a.post_scope !== "post") return true;
      return !!a.post_id && a.post_id === (input.postId ?? null);
    })
    .sort((a, b) => Number(a.created_at) - Number(b.created_at));

  for (const automation of candidates) {
    const keywords = keywordsOf(automation);
    if (keywords.length === 0) return { automation, keyword: null };

    for (const keyword of keywords) {
      const needle = keyword.toLowerCase();
      if (automation.match_mode === "exact") {
        if (haystack === needle) return { automation, keyword };
      } else if (automation.match_mode === "any_word") {
        const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
        if (words.includes(needle)) return { automation, keyword };
      } else if (haystack.includes(needle)) {
        return { automation, keyword };
      }
    }
  }

  return null;
}

/**
 * Which rule did they mean?
 *
 * A rule can be marked `match_mode: "ai"`, which is the owner saying "I have no keyword
 * for this one — read the message and tell me whether it is asking for me". The model
 * can only ever pick from rules the owner already wrote, and the reply is always the
 * owner's own text. If it is unsure, or the call fails, this is a no-match exactly as it
 * was before: the model is never allowed to invent a reply.
 */
export async function chooseAutomationWithAi(
  env: any,
  automations: Automation[],
  input: { text: string; kind: "comment" | "dm"; postId?: string | null },
  userId: string,
): Promise<{ automation: Automation; confidence: number } | null> {
  try {
    const candidates = automations
      .filter((a) => Number(a.enabled) === 1)
      .filter((a) => (a.trigger_type || "comment") === input.kind)
      .filter((a) => a.match_mode === "ai")
      .filter(
        (a) => a.post_scope !== "post" || (!!a.post_id && a.post_id === (input.postId ?? null)),
      )
      .sort((a, b) => Number(a.created_at) - Number(b.created_at));
    if (!candidates.length) return null;

    const list = candidates
      .map(
        (a) =>
          `- id: ${a.id}\n  name: ${a.name}\n  keywords: ${
            keywordsOf(a).join(", ") || "(none)"
          }\n  goal: ${a.goal ?? "(not set)"}`,
      )
      .join("\n");

    const prompt = [
      "Someone sent this message to a small business on Instagram.",
      "",
      `THEIR MESSAGE (${input.kind}):`,
      String(input.text ?? "").slice(0, 600),
      "",
      "Below are automations the owner has already written. Choose the ONE whose intent",
      "this message matches, or none. Do not write a reply — only choose.",
      "",
      list,
      "",
      'Answer with ONLY JSON and no prose: {"id": "<one of the ids above, or null>", "confidence": <0 to 1>}',
    ].join("\n");

    const raw = await callAi(env, prompt, { maxTokens: 200, userId });
    const got = extractJson<{ id?: string | null; confidence?: number }>(raw);
    const picked = candidates.find((a) => a.id === String(got?.id ?? ""));
    if (!picked) return null;
    return {
      automation: picked,
      confidence: Math.max(0, Math.min(1, Number(got?.confidence ?? 0))),
    };
  } catch {
    return null;
  }
}

/**
 * Two drafts for the owner to send themselves.
 *
 * Meant for a thread where the automation has stopped — a handoff, or a question no rule
 * answered. It reads the thread and writes nothing: sending stays the owner's call, and
 * this exists so that call takes ten seconds instead of two minutes.
 */
export async function draftReplies(
  env: any,
  userId: string,
  conversationId: string,
): Promise<{ drafts: string[] } | { error: string }> {
  try {
    const conversation = await env.DB.prepare(
      "SELECT id FROM dm_conversations WHERE id = ? AND user_id = ?",
    )
      .bind(conversationId, userId)
      .first();
    if (!conversation) return { error: "That conversation does not exist." };

    const { results } = await env.DB.prepare(
      `SELECT direction, text, channel FROM dm_messages
        WHERE conversation_id = ? AND text IS NOT NULL AND text != ''
        ORDER BY created_at DESC LIMIT 12`,
    )
      .bind(conversationId)
      .all();
    const history = ((results ?? []) as any[]).reverse();
    if (!history.length) return { error: "There is nothing in this thread to answer yet." };

    const transcript = history
      .map((m) => `${m.direction === "out" ? "US" : "THEM"}: ${String(m.text).slice(0, 300)}`)
      .join("\n");
    const lastChannel = String(history[history.length - 1]?.channel ?? "dm");

    const prompt = [
      "You are answering for a small business on Instagram, as the owner.",
      `Write exactly 2 short reply drafts they could send as-is, as a ${lastChannel}.`,
      "Write in the same language the person wrote in. No emoji unless the thread already",
      "uses them. Keep each under 300 characters. Do not promise anything the thread has",
      "not already offered.",
      "",
      "THE THREAD (oldest first):",
      transcript,
      "",
      'Answer with ONLY a JSON array of 2 strings and no prose: ["first", "second"]',
    ].join("\n");

    const raw = await callAi(env, prompt, { maxTokens: 400, userId });
    const parsed =
      extractJson<string[]>(raw) ?? extractJson<{ drafts?: string[] }>(raw)?.drafts ?? [];
    const drafts = (Array.isArray(parsed) ? parsed : [])
      .map((d) => String(d ?? "").trim())
      .filter(Boolean)
      .slice(0, 2);
    if (!drafts.length) return { error: "The AI did not come back with anything usable." };
    return { drafts };
  } catch (err: any) {
    return { error: String(err?.message ?? "Could not write a draft.").slice(0, 200) };
  }
}

/** `{{first_name}}` and friends. An unknown variable is left visible on purpose. */
export function render(
  text: string | null | undefined,
  vars: Record<string, string | number | null | undefined>,
): string {
  if (!text) return "";
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const value = vars[key.toLowerCase()];
    return value === null || value === undefined || value === "" ? "there" : String(value);
  });
}

/** Start of the Dhaka day, as an epoch — the daily cap is a Dhaka-day cap. */
export function dhakaDayStart(at: number = Date.now()): number {
  return new Date(`${dhakaDate(at)}T00:00:00+06:00`).getTime();
}

/* ------------------------------------------------------------------ registry */

export async function listAutomations(env: any, userId: string): Promise<Automation[]> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM dm_automations WHERE user_id = ? ORDER BY created_at DESC",
    )
      .bind(userId)
      .all();
    return (results ?? []) as Automation[];
  } catch {
    return [];
  }
}

export async function getAutomation(
  env: any,
  userId: string,
  id: string,
): Promise<Automation | null> {
  try {
    const row = await env.DB.prepare(
      "SELECT * FROM dm_automations WHERE id = ? AND user_id = ?",
    )
      .bind(id, userId)
      .first();
    return (row as Automation) ?? null;
  } catch {
    return null;
  }
}

export type AutomationInput = {
  id?: string;
  name: string;
  trigger_type: "comment" | "dm";
  keywords: string[];
  match_mode: "contains" | "exact" | "any_word" | "ai";
  post_scope: "any" | "post";
  post_id?: string | null;
  public_reply?: string | null;
  dm_message?: string | null;
  dm_button_label?: string | null;
  dm_button_url?: string | null;
  counter_enabled?: boolean;
  daily_cap?: number;
  goal?: string | null;
  /** S3. Absent or empty ⇒ the three stage-1 fields above are the whole flow. */
  flow_steps?: FlowStep[];
};

export async function saveAutomation(
  env: any,
  userId: string,
  input: AutomationInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = env?.DB;
  if (!db) return { ok: false, error: "No database binding available." };

  const now = Date.now();
  const id = input.id?.trim() || crypto.randomUUID();
  const values = [
    input.name.trim().slice(0, 120),
    input.trigger_type === "dm" ? "dm" : "comment",
    JSON.stringify((input.keywords ?? []).map((k) => String(k).trim()).filter(Boolean).slice(0, 25)),
    ["contains", "exact", "any_word", "ai"].includes(input.match_mode)
      ? input.match_mode
      : "contains",
    input.post_scope === "post" ? "post" : "any",
    input.post_scope === "post" ? (input.post_id ?? null) : null,
    input.public_reply?.slice(0, 900) ?? null,
    input.dm_message?.slice(0, 900) ?? null,
    input.dm_button_label?.slice(0, 60) ?? null,
    input.dm_button_url?.slice(0, 300) ?? null,
    input.counter_enabled ? 1 : 0,
    Math.max(0, Math.min(500, Math.floor(Number(input.daily_cap ?? 0)) || 0)),
    input.goal?.slice(0, 60) ?? null,
    // S3: sanitise before storing. A step with no kind would make the engine skip
    // the whole flow, and 40 steps is already far past what a DM thread should be.
    JSON.stringify(
      (Array.isArray(input.flow_steps) ? input.flow_steps : [])
        .filter((s) => s && typeof s.kind === "string" && s.kind.trim())
        .slice(0, 40)
        .map((s) => ({
          id: String(s.id ?? crypto.randomUUID()).slice(0, 40),
          kind: String(s.kind).slice(0, 20),
          text: s.text !== undefined ? String(s.text).slice(0, 900) : undefined,
          label: s.label !== undefined ? String(s.label).slice(0, 60) : undefined,
          url: s.url !== undefined ? String(s.url).slice(0, 300) : undefined,
          options: Array.isArray(s.options)
            ? s.options.map((o) => String(o).slice(0, 40)).filter(Boolean).slice(0, 3)
            : undefined,
          amount: s.amount !== undefined ? Math.max(0, Math.floor(Number(s.amount)) || 0) : undefined,
          unit: s.unit !== undefined ? String(s.unit).slice(0, 10) : undefined,
          field: s.field !== undefined ? String(s.field).slice(0, 40) : undefined,
          op: s.op !== undefined ? String(s.op).slice(0, 20) : undefined,
          value: s.value !== undefined ? String(s.value).slice(0, 200) : undefined,
          library_type: s.library_type !== undefined
            ? String(s.library_type).slice(0, 40)
            : undefined,
          library_id: s.library_id !== undefined ? String(s.library_id).slice(0, 60) : undefined,
          library_pick: s.library_pick !== undefined
            ? String(s.library_pick).slice(0, 10)
            : undefined,
        })),
    ),
  ];

  try {
    const existing = input.id ? await getAutomation(env, userId, id) : null;
    if (existing) {
      await db
        .prepare(
          `UPDATE dm_automations SET name = ?, trigger_type = ?, keywords = ?, match_mode = ?,
             post_scope = ?, post_id = ?, public_reply = ?, dm_message = ?, dm_button_label = ?,
             dm_button_url = ?, counter_enabled = ?, daily_cap = ?, goal = ?, flow_steps = ?,
             updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(...values, now, id, userId)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO dm_automations
             (id, user_id, name, trigger_type, keywords, match_mode, post_scope, post_id,
               public_reply, dm_message, dm_button_label, dm_button_url, counter_enabled,
               daily_cap, goal, flow_steps, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(id, userId, ...values, now, now)
        .run();
    }
    return { ok: true, id };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export async function setAutomationEnabled(
  env: any,
  userId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  try {
    const res = await env.DB.prepare(
      "UPDATE dm_automations SET enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
      .bind(enabled ? 1 : 0, Date.now(), id, userId)
      .run();
    return Number(res?.meta?.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function deleteAutomation(
  env: any,
  userId: string,
  id: string,
): Promise<boolean> {
  try {
    const res = await env.DB.prepare(
      "DELETE FROM dm_automations WHERE id = ? AND user_id = ?",
    )
      .bind(id, userId)
      .run();
    return Number(res?.meta?.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ people */

/** One contact per Instagram-scoped id; a returning person is the same row. */
export async function upsertContact(
  env: any,
  userId: string,
  person: EngineInput["contact"],
): Promise<Contact | null> {
  const db = env?.DB;
  if (!db) return null;
  const now = Date.now();
  try {
    const existing = await db
      .prepare("SELECT * FROM dm_contacts WHERE user_id = ? AND ig_user_id = ?")
      .bind(userId, person.ig_user_id)
      .first();
    if (existing) {
      await db
        .prepare(
          `UPDATE dm_contacts SET username = COALESCE(?, username), first_name = COALESCE(?, first_name),
             last_name = COALESCE(?, last_name), last_seen_at = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          person.username ?? null,
          person.first_name ?? null,
          person.last_name ?? null,
          now,
          now,
          (existing as any).id,
        )
        .run();
      return { ...(existing as Contact), last_seen_at: now };
    }
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO dm_contacts
           (id, user_id, ig_user_id, username, first_name, last_name, is_follower,
            comments, dms, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
      )
      .bind(
        id,
        userId,
        person.ig_user_id,
        person.username ?? null,
        person.first_name ?? null,
        person.last_name ?? null,
        now,
        now,
        now,
      )
      .run();
    return {
      id,
      user_id: userId,
      ig_user_id: person.ig_user_id,
      username: person.username ?? null,
      first_name: person.first_name ?? null,
      last_name: person.last_name ?? null,
      comments: 0,
      dms: 0,
      last_seen_at: now,
    };
  } catch {
    return null;
  }
}

async function bumpContact(env: any, contactId: string, field: "comments" | "dms") {
  try {
    await env.DB.prepare(
      `UPDATE dm_contacts SET ${field} = ${field} + 1, last_seen_at = ? WHERE id = ?`,
    )
      .bind(Date.now(), contactId)
      .run();
  } catch {
    /* counters are a nicety, not the record */
  }
}

async function addEvent(
  env: any,
  userId: string,
  event: {
    automation_id?: string | null;
    contact_id?: string | null;
    conversation_id?: string | null;
    kind: string;
    detail?: string;
  },
) {
  try {
    await env.DB.prepare(
      `INSERT INTO dm_events (id, user_id, automation_id, contact_id, conversation_id, kind, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        event.automation_id ?? null,
        event.contact_id ?? null,
        event.conversation_id ?? null,
        event.kind,
        (event.detail ?? "").slice(0, 400),
        Date.now(),
      )
      .run();
  } catch {
    /* the trace is useful, never load-bearing */
  }
}

async function addMessage(
  env: any,
  userId: string,
  message: {
    conversation_id?: string | null;
    contact_id?: string | null;
    automation_id?: string | null;
    direction: "in" | "out";
    channel: "comment" | "dm";
    text: string;
    matched_keyword?: string | null;
    status: string;
    /**
     * Instagram's own id for a message we sent. Two things depend on it: knowing
     * whether an incoming `is_echo` is the bot talking or the owner typing — and
     * therefore whether to pause — and being able to point at the exact message
     * later. Without it every echo would look like a human.
     */
    external_id?: string | null;
  },
) {
  try {
    await env.DB.prepare(
      `INSERT INTO dm_messages
         (id, user_id, conversation_id, contact_id, automation_id, direction, channel, text, matched_keyword, status, external_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        message.conversation_id ?? null,
        message.contact_id ?? null,
        message.automation_id ?? null,
        message.direction,
        message.channel,
        message.text.slice(0, 2000),
        message.matched_keyword ?? null,
        message.status,
        message.external_id ?? null,
        Date.now(),
      )
      .run();
  } catch {
    /* see addEvent */
  }
}

/** Did we send this message? The webhook asks before it blames a human. */
export async function wasSentByUs(
  env: any,
  userId: string,
  conversationId: string | null,
  externalId: string,
  text: string,
): Promise<boolean> {
  try {
    if (externalId) {
      const row = await env.DB.prepare(
        "SELECT 1 AS hit FROM dm_messages WHERE user_id = ? AND external_id = ? LIMIT 1",
      )
        .bind(userId, externalId)
        .first();
      if (row) return true;
    }
    // The echo can arrive before the send call has written its row, so the text is a
    // second, independent check: an identical last outbound message is far likelier
    // to be our own echo than the owner typing the same sentence by hand.
    if (!conversationId || !text.trim()) return false;
    const last = await env.DB.prepare(
      "SELECT text FROM dm_messages WHERE user_id = ? AND conversation_id = ? AND direction = 'out' ORDER BY created_at DESC LIMIT 1",
    )
      .bind(userId, conversationId)
      .first();
    return !!last && String((last as any).text ?? "").trim() === text.trim();
  } catch {
    // Unsure is not a reason to silence somebody's account.
    return true;
  }
}

/* ------------------------------------------------- the one-per-comment rule */

/** Has this exact comment already had its private reply? (Meta keys it by comment.) */
export async function hasCommentReply(env: any, commentId: string): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      "SELECT comment_id FROM dm_comment_replies WHERE comment_id = ?",
    )
      .bind(commentId)
      .first();
    return !!row;
  } catch {
    // If the table is missing we must not block real replies; the engine treats a
    // lookup failure as "not answered yet" and the INSERT below is the real guard.
    return false;
  }
}

export async function recordCommentReply(
  env: any,
  userId: string,
  entry: {
    commentId: string;
    automationId?: string | null;
    contactId?: string | null;
    conversationId?: string | null;
  },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO dm_comment_replies
         (comment_id, user_id, automation_id, contact_id, conversation_id, via, replied_at)
       VALUES (?, ?, ?, ?, ?, 'private_reply', ?)`,
    )
      .bind(
        entry.commentId,
        userId,
        entry.automationId ?? null,
        entry.contactId ?? null,
        entry.conversationId ?? null,
        Date.now(),
      )
      .run();
  } catch {
    /* see above — the send already happened; this is the bookkeeping */
  }
}

/* ------------------------------------------------------------------ engine */

/**
 * The one entry point. Returns a full trace so the UI can show the decision path
 * ("keyword matched → public reply → DM → lead"), not just the outcome.
 */
export async function runEngine(
  env: any,
  userId: string,
  input: EngineInput,
): Promise<EngineResult> {
  const db = env?.DB;
  const simulated = input.simulated !== false;
  const status = simulated ? "simulated" : "sent";
  // A resumed follow-up: the engine runs, but the person wrote nothing this time.
  const resumed = !!input.automationId;
  const startAt = Math.max(0, Math.floor(Number(input.startAt ?? 0)) || 0);
  const steps: Step[] = [];
  const result: EngineResult = {
    matched: false,
    automation: null,
    keyword: null,
    publicReply: null,
    dm: null,
    dmVia: null,
    handoff: false,
    paused: false,
    contactId: null,
    conversationId: null,
    withinWindow: true,
    windowNote: "",
    steps,
  };

  if (!db) {
    steps.push({ kind: "error", label: "No database", detail: "D1 is not bound.", ok: false });
    return result;
  }

  const contact = await upsertContact(env, userId, input.contact);
  result.contactId = contact?.id ?? null;
  const who = input.contact.first_name || input.contact.username || "this person";
  steps.push({
    kind: "contact",
    label: "Contact",
    detail: contact ? `${who} (${input.contact.ig_user_id})` : "could not be stored",
    ok: !!contact,
  });

  const automations = await listAutomations(env, userId);
  // A resumed follow-up names its rule instead of being matched again — the
  // keywords were already satisfied when the flow started.
  let match = resumed
    ? (() => {
        const a = automations.find((x) => x.id === input.automationId);
        return a ? { automation: a, keyword: null } : null;
      })()
    : matchAutomation(automations, input);

  // Rules decide; the model only points. A rule marked `match_mode: "ai"` is the owner
  // saying "I have no keyword for this one — read it and tell me whether it is for me".
  // The model can only choose among rules the owner already wrote, and the reply text
  // is still theirs. An unsure answer, or a failed call, is a no-match exactly as it
  // was before — the model is never allowed to invent a reply.
  if (!resumed && !match) {
    const ai = await chooseAutomationWithAi(env, automations, input, userId);
    if (ai) {
      match = { automation: ai.automation, keyword: "ai" };
      steps.push({
        kind: "intent",
        label: "Read by the AI",
        detail: `${ai.automation.name} — confidence ${ai.confidence.toFixed(2)}`,
        ok: true,
      });
    }
  }

  if (!match) {
    steps.push({
      kind: "no_match",
      label: "No automation matched",
      detail: automations.length
        ? `${automations.length} rule(s) checked, none matched “${input.text.slice(0, 60)}”.`
        : "There are no automations yet.",
      ok: false,
    });
    await addEvent(env, userId, {
      contact_id: contact?.id ?? null,
      kind: "no_match",
      detail: input.text.slice(0, 200),
    });
    await addMessage(env, userId, {
      contact_id: contact?.id ?? null,
      direction: "in",
      channel: input.kind,
      text: input.text,
      status: simulated ? "simulated" : "sent",
    });
    if (contact) await bumpContact(env, contact.id, input.kind === "comment" ? "comments" : "dms");
    return result;
  }

  const { automation, keyword } = match;
  result.matched = true;
  result.automation = { id: automation.id, name: automation.name };
  result.keyword = keyword;
  steps.push({
    kind: "matched",
    label: "Matched",
    // `keyword === "ai"` is not a keyword at all — saying «"ai" (ai)» would read like a
    // bug rather than the routing decision it actually was.
    detail:
      keyword === "ai"
        ? `The AI chose “${automation.name}” for this message`
        : keyword
          ? `“${keyword}” (${automation.match_mode}) in “${automation.name}”`
          : `“${automation.name}” answers everything`,
    ok: true,
  });

  // Conversation + the 7-day messaging window.
  const now = Date.now();
  let conversationId: string | null = null;
  let previousInbound: number | null = null;
  // S3: a thread the owner has taken over by hand. The bot says nothing on it —
  // not "the window is closed", not a follow-up — until the owner presses Resume.
  let botPaused = false;
  let pausedReason: string | null = null;
  try {
    const existing = await db
      .prepare(
        "SELECT id, last_inbound_at, bot_paused, paused_reason FROM dm_conversations WHERE user_id = ? AND contact_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(userId, contact?.id ?? "")
      .first();
    if (existing) {
      conversationId = (existing as any).id;
      previousInbound = (existing as any).last_inbound_at ?? null;
      botPaused = Number((existing as any).bot_paused ?? 0) === 1;
      pausedReason = (existing as any).paused_reason ?? null;
    } else {
      conversationId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO dm_conversations
             (id, user_id, contact_id, automation_id, status, source, last_inbound_at, last_message_at, unread, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?, ?, 0, ?, ?)`,
        )
        .bind(
          conversationId,
          userId,
          contact?.id ?? null,
          automation.id,
          simulated ? "simulated" : input.kind,
          now,
          now,
          now,
          now,
        )
        .run();
    }
  } catch {
    conversationId = null;
  }
  result.conversationId = conversationId;

  // They wrote again — so the ladder booked by the previous trigger is over. A fresh
  // trigger restarts the flow instead of continuing yesterday's wait.
  if (!resumed && conversationId) {
    await cancelPendingRun(env, userId, conversationId, "the person wrote again");
  }

  // ---------------------------------------------------------------- bot paused
  // The owner already answered this person by hand. Two things must not happen: the
  // bot must not talk over them, and a waiting follow-up must not fire. Both are
  // settled here — before any window arithmetic — because a pause outranks every
  // other rule in this file.
  if (botPaused) {
    result.paused = true;
    result.windowNote = "Bot paused on this thread — the owner is answering by hand.";
    steps.push({
      kind: "paused",
      label: "Bot paused",
      detail: pausedReason
        ? `Automation is off for this thread: ${pausedReason}`
        : "Automation is off because the owner has replied to this person by hand.",
      ok: true,
    });
    await addMessage(env, userId, {
      conversation_id: conversationId,
      contact_id: contact?.id ?? null,
      automation_id: automation.id,
      direction: "in",
      channel: input.kind,
      text: input.text,
      matched_keyword: keyword,
      status: simulated ? "simulated" : "sent",
    });
    if (contact) await bumpContact(env, contact.id, input.kind === "comment" ? "comments" : "dms");
    // A paused thread must not have a follow-up land on it either.
    await cancelPendingRun(env, userId, conversationId, "the owner took this thread over");
    await addEvent(env, userId, {
      automation_id: automation.id,
      contact_id: contact?.id ?? null,
      conversation_id: conversationId,
      kind: "bot_paused",
      detail: input.text.slice(0, 200),
    });
    if (conversationId) {
      try {
        await db
          .prepare(
            "UPDATE dm_conversations SET last_inbound_at = ?, last_message_at = ?, unread = 1, updated_at = ? WHERE id = ? AND user_id = ?",
          )
          .bind(now, now, now, conversationId, userId)
          .run();
      } catch {
        /* the trace above is the important part */
      }
    }
    return result;
  }

  // The conversational clock: 24 hours from their last message. The comment's own
  // clock (once per comment, 7 days) is evaluated separately below, because the message
  // goes out under a *different permission* depending on what triggered it.
  const effectiveLastInbound =
    input.assumeStaleDays !== undefined && input.assumeStaleDays !== null
      ? now - input.assumeStaleDays * 86_400_000
      : previousInbound;

  const withinWindow =
    effectiveLastInbound === null || now - effectiveLastInbound <= DM_WINDOW_MS;
  result.withinWindow = withinWindow;
  result.windowNote =
    effectiveLastInbound === null
      ? "First contact — the conversation is open."
      : withinWindow
        ? `Conversation open (they last wrote ${Math.round((now - effectiveLastInbound) / 3_600_000)}h ago; the window is 24h).`
        : `Conversation closed (they last wrote ${Math.round((now - effectiveLastInbound) / 86_400_000)} days ago) — an automated DM is not allowed. A private reply to a fresh comment still would be.`;

  steps.push({
    kind: "window",
    label: "Messaging window",
    detail: result.windowNote,
    ok: withinWindow,
  });

  // The inbound message itself. A resumed follow-up has none — nobody wrote.
  if (!resumed) {
    await addMessage(env, userId, {
      conversation_id: conversationId,
      contact_id: contact?.id ?? null,
      automation_id: automation.id,
      direction: "in",
      channel: input.kind,
      text: input.text,
      matched_keyword: keyword,
      status: simulated ? "simulated" : "sent",
    });
    if (contact) await bumpContact(env, contact.id, input.kind === "comment" ? "comments" : "dms");
  }

  // How many times has this person triggered this automation? ({{count}})
  let count = 1;
  try {
    const row = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM dm_events WHERE user_id = ? AND automation_id = ? AND contact_id = ? AND kind = 'matched'",
      )
      .bind(userId, automation.id, contact?.id ?? "")
      .first();
    count = Number((row as any)?.n ?? 0) + 1;
  } catch {
    /* first-timer */
  }

  const vars = {
    first_name: input.contact.first_name ?? null,
    last_name: input.contact.last_name ?? null,
    username: input.contact.username ?? null,
    keyword: keyword ?? null,
    count,
  };

  // Public reply — comments only, and capped by the same daily counter as the DM.
  if (input.kind === "comment" && automation.public_reply) {
    const text = render(automation.public_reply, vars);
    let replyStatus = status;
    let replyError: string | null = null;
    let replyExternalId: string | null = null;
    if (input.deliver) {
      const sent = await input.deliver({
        channel: "comment",
        via: "public_reply",
        text,
        commentId: input.commentId ?? null,
      });
      replyStatus = sent.ok ? "sent" : "failed";
      replyError = sent.ok ? null : (sent.error ?? "Instagram refused the reply");
      replyExternalId = sent.messageId ?? null;
    }
    await addMessage(env, userId, {
      conversation_id: conversationId,
      contact_id: contact?.id ?? null,
      automation_id: automation.id,
      direction: "out",
      channel: "comment",
      text,
      matched_keyword: keyword,
      status: replyStatus,
      external_id: replyExternalId,
    });
    result.publicReply = text;
    steps.push({
      kind: "public_reply",
      label: replyError ? "Public reply failed" : "Public reply",
      detail: replyError ? `${text} — Instagram said: ${replyError}` : text,
      ok: !replyError,
    });
    await addEvent(env, userId, {
      automation_id: automation.id,
      contact_id: contact?.id ?? null,
      conversation_id: conversationId,
      kind: replyError ? "reply_failed" : "reply_sent",
      detail: (replyError ?? text).slice(0, 200),
    });
  }

  // Private DM — window + cap apply. S3 rules carry a `flow_steps` sequence; a rule
  // written before S3 has none, and then the stage-1 fields below are the flow.
  const flowSteps = flowStepsOf(automation);
  if (automation.dm_message || flowSteps.length) {
    const cap = Number(automation.daily_cap ?? 0);
    let sentToday = 0;
    if (cap > 0) {
      try {
        const row = await db
          .prepare(
            "SELECT COUNT(*) AS n FROM dm_messages WHERE user_id = ? AND automation_id = ? AND channel = 'dm' AND direction = 'out' AND created_at >= ?",
          )
          .bind(userId, automation.id, dhakaDayStart())
          .first();
        sentToday = Number((row as any)?.n ?? 0);
      } catch {
        sentToday = 0;
      }
    }

    // Which permission are we sending under? Meta has three separate clocks and
    // using the wrong one means a rejected message, so the trace says which.
    const commentId = input.commentId ? String(input.commentId) : null;
    const commentAgeDays = input.assumeStaleDays ?? 0;
    let via: "private_reply" | "conversation" | null = null;
    let blocked = "";

    if (input.kind === "comment") {
      if (!commentId) {
        blocked = "No comment id was recorded, so a private reply cannot be addressed.";
      } else if (commentAgeDays * 86_400_000 > COMMENT_REPLY_WINDOW_MS) {
        blocked = `That comment is ${commentAgeDays} days old — Meta only allows a private reply within 7 days of the comment.`;
      } else if (await hasCommentReply(env, commentId)) {
        blocked =
          "This comment was already answered privately — Meta allows one private reply per comment.";
      } else {
        via = "private_reply";
      }
    }

    // Falling back to the open conversation is legitimate — but only while it is
    // open (24h). A human could still reply for 7 days; automation may not.
    if (!via && withinWindow && previousInbound !== null) {
      via = "conversation";
      blocked = "";
    } else if (!via && !blocked) {
      blocked = "The 24-hour conversation window has closed.";
    }

    if (via && cap > 0 && sentToday >= cap) {
      blocked = `Daily cap reached (${sentToday}/${cap} sent today).`;
      via = null;
    }

    if (via) {
      steps.push({
        kind: "dm_permission",
        label: via === "private_reply" ? "Private reply allowed" : "Conversation open",
        detail:
          via === "private_reply"
            ? "One private reply per comment, and this comment has not had one."
            : "They wrote to you inside the last 24 hours, so a DM is allowed.",
        ok: true,
      });

      // ------------------------------------------------------------- the flow
      // Turn the sequence into the bubbles that will actually be sent. Consecutive
      // send-steps share one bubble (two "message" steps are one paragraph, not two
      // notifications), and every control step closes the current bubble — which is
      // what a `delay` needs, because the next bubble belongs to a later run.
      const ctx: FlowContext = { keyword, count, text: input.text, tags: [], fields: {} };
      if (contact?.id) {
        ctx.tags = await tagsOfContact(env, userId, contact.id);
        ctx.fields = await fieldsOfContact(env, userId, contact.id);
      }

      const bubbles: string[] = [];
      let buffered: string[] = [];
      const flush = () => {
        const joined = buffered.join("\n").trim();
        if (joined) bubbles.push(joined);
        buffered = [];
      };

      /** Where a paused flow will be picked up again, if it reached a wait. */
      let resumeAt: number | null = null;
      let resumeIndex = 0;
      let halted: string | null = null;

      if (flowSteps.length) {
        for (let i = startAt; i < flowSteps.length; i++) {
          const s = flowSteps[i];

          if (s.kind === "message") {
            if (s.text) buffered.push(render(s.text, vars));
            continue;
          }
          if (s.kind === "button") {
            // Real Instagram buttons need a message template, which needs App
            // Review. Until then a button is a labelled link, exactly as stage 1
            // rendered it — honestly, rather than pretending it is tappable.
            buffered.push(`👉 ${s.label ?? "Open"}${s.url ? `: ${s.url}` : ""}`);
            continue;
          }
          if (s.kind === "quick_reply") {
            const options = (s.options ?? []).map((o) => String(o).trim()).filter(Boolean);
            if (options.length) buffered.push(options.map((o) => `▫️ ${o}`).join("\n"));
            continue;
          }
          if (s.kind === "library") {
            // The Library is where finished work lives, so a flow can hand over the
            // real thing instead of a link to it. When nothing is there the trace says
            // so: inventing a script is the one thing this must never do.
            const item = await pickLibraryItem(env, userId, s);
            if (item && String(item.content ?? "").trim()) {
              buffered.push(render(libraryText(item.content), vars));
              steps.push({
                kind: "library",
                label: "From the Library",
                detail: `${item.title ?? item.type ?? "item"}${item.type ? ` (${item.type})` : ""}`,
                ok: true,
              });
            } else {
              steps.push({
                kind: "library",
                label: "Nothing in the Library",
                detail: `No ${s.library_type ?? s.library_id ?? "matching"} item yet — nothing was sent.`,
                ok: false,
              });
            }
            continue;
          }
          if (s.kind === "delay") {
            flush();
            const wait = delayMs(s);
            if (wait > 0) {
              resumeAt = now + wait;
              resumeIndex = i + 1;
              break;
            }
            continue;
          }
          if (s.kind === "condition") {
            flush();
            const met = conditionMet(s, ctx);
            steps.push({
              kind: "condition",
              label: met ? "Condition met" : "Condition not met",
              detail: `${stepLabel(s)} → ${met ? "carry on" : "stop here"}`,
              ok: met,
            });
            if (!met) {
              halted = stepLabel(s);
              break;
            }
            continue;
          }
          if (s.kind === "tag") {
            flush();
            const name = String(s.label ?? s.text ?? s.value ?? "").trim();
            if (name && contact?.id) {
              await attachTag(env, userId, contact.id, name);
              ctx.tags.push(name.toLowerCase());
            }
            if (name) {
              steps.push({ kind: "tag", label: "Tag added", detail: name, ok: true });
            }
            continue;
          }
          if (s.kind === "field") {
            flush();
            const key = String(s.field ?? s.label ?? "").trim();
            const value = render(String(s.value ?? ""), vars);
            if (key && contact?.id) {
              await setContactField(env, userId, contact.id, key, value);
              ctx.fields[key] = value.toLowerCase();
            }
            if (key) {
              steps.push({
                kind: "field",
                label: "Field set",
                detail: `${key} = ${value}`,
                ok: true,
              });
            }
            continue;
          }
        }
        flush();
      } else if (automation.dm_message) {
        // A stage-1 rule: one message, one optional button line. Untouched.
        let text = render(automation.dm_message, vars);
        if (automation.dm_button_label) {
          text += `\n\n👉 ${automation.dm_button_label}${
            automation.dm_button_url ? `: ${automation.dm_button_url}` : ""
          }`;
        }
        bubbles.push(text);
      }

      // Every send funnels through here, so the permission, the stored message, the
      // trace and the event cannot disagree with one another. The first send of a
      // comment-triggered flow may be a private reply (one per comment); after that
      // — and in every resumed run — the send rides the conversation the private
      // reply just opened.
      let privateReplyLeft = via === "private_reply" && !!commentId;
      let firstVia: "private_reply" | "conversation" | null = null;

      const sendBubble = async (text: string): Promise<boolean> => {
        const useVia: "private_reply" | "conversation" = privateReplyLeft
          ? "private_reply"
          : "conversation";
        // Spent the moment it is attempted: Meta counts the attempt against the
        // comment, so a second one is refused no matter how the first ended.
        if (useVia === "private_reply") privateReplyLeft = false;

        const attempt = async (
          how: "private_reply" | "conversation",
        ): Promise<{ ok: boolean; error?: string; messageId?: string }> => {
          if (!input.deliver) {
            return simulated
              ? { ok: true }
              : { ok: false, error: "No delivery channel is attached." };
          }
          return input.deliver({
            channel: "dm",
            via: how,
            text,
            commentId,
            igsid: input.contact.ig_user_id,
          });
        };

        let used = useVia;
        let sent = await attempt(useVia);

        // A refused private reply must not cost the whole answer: while the thread
        // is still open, the same text goes out as an ordinary DM.
        if (!sent.ok && useVia === "private_reply" && withinWindow && previousInbound !== null) {
          used = "conversation";
          sent = await attempt("conversation");
        }

        const dmError = sent.ok ? null : (sent.error ?? "Instagram refused the message");

        await addMessage(env, userId, {
          conversation_id: conversationId,
          contact_id: contact?.id ?? null,
          automation_id: automation.id,
          direction: "out",
          channel: "dm",
          text,
          matched_keyword: keyword,
          status: sent.ok ? status : "failed",
          external_id: sent.messageId ?? null,
        });

        if (useVia === "private_reply" && commentId) {
          await recordCommentReply(env, userId, {
            commentId,
            automationId: automation.id,
            contactId: contact?.id ?? null,
            conversationId,
          });
        }

        steps.push({
          kind: "dm_sent",
          label: dmError
            ? used === "private_reply"
              ? "Private reply failed"
              : "DM failed"
            : used === "private_reply"
              ? "Private reply sent"
              : "DM sent",
          detail: dmError ? `${text} — Instagram said: ${dmError}` : text,
          ok: !dmError,
        });
        await addEvent(env, userId, {
          automation_id: automation.id,
          contact_id: contact?.id ?? null,
          conversation_id: conversationId,
          kind: dmError ? "dm_failed" : "dm_sent",
          detail: `${used}: ${(dmError ?? text).slice(0, 160)}`,
        });

        if (sent.ok && !firstVia) firstVia = used;
        return sent.ok;
      };

      for (const bubble of bubbles) {
        await sendBubble(bubble);
      }

      if (bubbles.length) {
        result.dm = bubbles.join("\n\n");
        result.dmVia = firstVia;
      } else if (resumeAt === null) {
        steps.push({
          kind: "dm_skipped",
          label: "Nothing to send",
          detail: halted ? `The flow stopped at “${halted}”.` : "This flow has no send steps.",
          ok: false,
        });
      }

      // A flow that reached a wait parks its position in a ROW; the cron resumes it.
      // Workerd has no long-lived process, so an in-memory timer would simply vanish.
      if (resumeAt !== null && conversationId) {
        await scheduleRun(env, userId, {
          automationId: automation.id,
          conversationId,
          contactId: contact?.id ?? null,
          igUserId: input.contact.ig_user_id,
          stepIndex: resumeIndex,
          runAt: resumeAt,
        });
        const mins = Math.max(1, Math.round((resumeAt - now) / 60_000));
        steps.push({
          kind: "delay",
          label: `Waiting ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`}`,
          detail:
            "The wait is a row, not a timer — the cron resumes this flow from here. A follow-up only goes out while the 24-hour window is still open, and never once you have taken the thread over.",
          ok: true,
        });
      }

      // A follow-up is not a new arrival, so it must not book the same lead twice.
      if (!resumed && automation.goal && contact?.id) {
        try {
          await db
            .prepare(
              `INSERT INTO dm_leads (id, user_id, contact_id, automation_id, goal, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              userId,
              contact.id,
              automation.id,
              automation.goal,
              now,
              now,
            )
            .run();
          steps.push({
            kind: "lead",
            label: "Lead captured",
            detail: `Goal: ${automation.goal}`,
            ok: true,
          });
        } catch {
          /* a lead row is a bonus */
        }
      }
    } else {
      // Nothing automated can be sent — so do the one thing that still works and
      // that every other tool leaves to you: hand it to a human, with a deadline.
      result.handoff = true;
      // The Inbox shows this conversation as waiting on a human — and the
      // Analytics "handed to you" number is this status, not a guess.
      if (conversationId) {
        try {
          await db
            .prepare(
              "UPDATE dm_conversations SET status = 'handoff', updated_at = ? WHERE id = ? AND user_id = ?",
            )
            .bind(now, conversationId, userId)
            .run();
        } catch {
          /* the task below is the important part */
        }
      }
      steps.push({ kind: "dm_skipped", label: "No DM sent", detail: blocked, ok: false });
      await addEvent(env, userId, {
        automation_id: automation.id,
        contact_id: contact?.id ?? null,
        conversation_id: conversationId,
        kind: cap > 0 && sentToday >= cap ? "cap_reached" : "window_expired",
        detail: blocked,
      });

      const task = await createTask(env, userId, {
        text: `Reply to ${who} by hand — ${automation.name} could not DM them (${blocked})`,
        source: "dm",
        ref_key: `dmhandoff:${conversationId ?? contact?.id ?? automation.id}`,
      });
      steps.push({
        kind: "handoff",
        label: task.created ? "Hand-off task created" : "Hand-off task already waiting",
        detail:
          "It is in your Dashboard task queue. Inside 7 days of their message Meta lets a human reply — automation never may.",
        ok: true,
      });
    }
  }

  // Bookkeeping. An inbound message restarts the clock; a follow-up must NOT, or
  // every wait would silently push the 24-hour window further out and the flow
  // would talk to someone who never answered for as long as it liked.
  if (conversationId) {
    try {
      await db
        .prepare(
          `UPDATE dm_conversations
             SET last_inbound_at = COALESCE(?, last_inbound_at),
                 last_outbound_at = COALESCE(?, last_outbound_at),
                 last_message_at = ?, status = CASE WHEN ? = 1 THEN 'open' ELSE status END,
                 updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(
          resumed ? null : now,
          result.dm ? now : null,
          now,
          result.dm ? 1 : 0,
          now,
          conversationId,
          userId,
        )
        .run();
    } catch {
      /* ignore */
    }
  }

  await addEvent(env, userId, {
    automation_id: automation.id,
    contact_id: contact?.id ?? null,
    conversation_id: conversationId,
    kind: resumed ? "flow_resumed" : simulated ? "simulated" : "matched",
    detail: resumed
      ? `step ${startAt}: ${(result.dm ?? "nothing sent").slice(0, 120)}`
      : `${input.kind}: ${input.text.slice(0, 120)}`,
  });

  return result;
}

/* -------------------------------------------------------------- flow state (S3) */

/** The tags on a contact, lowercase — the shape a condition compares against. */
export async function tagsOfContact(
  env: any,
  userId: string,
  contactId: string,
): Promise<string[]> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT t.name FROM dm_contact_tags ct
         JOIN dm_tags t ON t.id = ct.tag_id
        WHERE ct.contact_id = ? AND t.user_id = ?`,
    )
      .bind(contactId, userId)
      .all();
    return ((results ?? []) as { name: string }[])
      .map((r) => String(r?.name ?? "").toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Custom fields on a contact, values lowercase — see `conditionMet`. */
export async function fieldsOfContact(
  env: any,
  userId: string,
  contactId: string,
): Promise<Record<string, string>> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT key, value FROM dm_contact_fields WHERE user_id = ? AND contact_id = ?",
    )
      .bind(userId, contactId)
      .all();
    const out: Record<string, string> = {};
    for (const row of (results ?? []) as { key: string; value: string }[]) {
      out[String(row.key)] = String(row.value ?? "").toLowerCase();
    }
    return out;
  } catch {
    return {};
  }
}

/** Create the tag if it is new, attach it if it is not. Idempotent by design. */
export async function attachTag(
  env: any,
  userId: string,
  contactId: string,
  name: string,
): Promise<string | null> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  const db = env?.DB;
  if (!db) return null;
  const now = Date.now();
  try {
    const existing = await db
      .prepare("SELECT id FROM dm_tags WHERE user_id = ? AND lower(name) = lower(?) LIMIT 1")
      .bind(userId, clean)
      .first();
    const tagId = existing?.id ? String(existing.id) : crypto.randomUUID();
    if (!existing?.id) {
      await db
        .prepare("INSERT INTO dm_tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?)")
        .bind(tagId, userId, clean, now)
        .run();
    }
    await db
      .prepare("INSERT OR IGNORE INTO dm_contact_tags (contact_id, tag_id) VALUES (?, ?)")
      .bind(contactId, tagId)
      .run();
    return tagId;
  } catch {
    return null;
  }
}

/** Take one tag off one contact. The tag itself stays — other people may carry it. */
export async function detachTag(
  env: any,
  userId: string,
  contactId: string,
  name: string,
): Promise<boolean> {
  const clean = name.trim();
  if (!clean) return false;
  try {
    const res = await env.DB.prepare(
      `DELETE FROM dm_contact_tags
        WHERE contact_id = ?
          AND tag_id IN (SELECT id FROM dm_tags WHERE user_id = ? AND lower(name) = lower(?))`,
    )
      .bind(contactId, userId, clean)
      .run();
    return Number(res?.meta?.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Delete a tag for good — from the tag list, and from everyone who carried it.
 * Scoped to the user who owns it, so one person's tag list can never empty another's.
 */
export async function deleteTag(env: any, userId: string, tagId: string): Promise<boolean> {
  if (!tagId) return false;
  try {
    const owned = await env.DB.prepare("SELECT id FROM dm_tags WHERE id = ? AND user_id = ?")
      .bind(tagId, userId)
      .first();
    if (!owned?.id) return false;
    await env.DB.prepare("DELETE FROM dm_contact_tags WHERE tag_id = ?").bind(tagId).run();
    const res = await env.DB.prepare("DELETE FROM dm_tags WHERE id = ? AND user_id = ?")
      .bind(tagId, userId)
      .run();
    return Number(res?.meta?.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function setContactField(
  env: any,
  userId: string,
  contactId: string,
  key: string,
  value: string,
): Promise<boolean> {
  const clean = key.trim().slice(0, 40);
  if (!clean) return false;
  try {
    await env.DB.prepare(
      `INSERT INTO dm_contact_fields (contact_id, user_id, key, value, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (contact_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind(contactId, userId, clean, value.slice(0, 200), Date.now())
      .run();
    return true;
  } catch {
    return false;
  }
}

export async function listTags(env: any, userId: string) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT t.id, t.name, t.created_at,
              (SELECT COUNT(*) FROM dm_contact_tags ct WHERE ct.tag_id = t.id) AS contacts
         FROM dm_tags t WHERE t.user_id = ? ORDER BY t.created_at ASC`,
    )
      .bind(userId)
      .all();
    return results ?? [];
  } catch {
    return [];
  }
}

/** Park where a waiting flow should carry on. One live wait per conversation. */
export async function scheduleRun(
  env: any,
  userId: string,
  input: {
    automationId: string;
    conversationId: string;
    contactId: string | null;
    igUserId: string;
    stepIndex: number;
    runAt: number;
  },
): Promise<boolean> {
  const db = env?.DB;
  if (!db) return false;
  const now = Date.now();
  try {
    // Replace, never stack: two live waits on one thread is two follow-ups.
    await db
      .prepare(
        "DELETE FROM dm_flow_runs WHERE user_id = ? AND conversation_id = ? AND status = 'pending'",
      )
      .bind(userId, input.conversationId)
      .run();
    await db
      .prepare(
        `INSERT INTO dm_flow_runs
           (id, user_id, automation_id, conversation_id, contact_id, ig_user_id,
            step_index, status, run_at, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        input.automationId,
        input.conversationId,
        input.contactId,
        input.igUserId,
        Math.max(0, Math.floor(input.stepIndex)),
        input.runAt,
        now,
        now,
      )
      .run();
    return true;
  } catch {
    return false;
  }
}

export async function cancelPendingRun(
  env: any,
  userId: string,
  conversationId: string | null,
  reason: string,
): Promise<number> {
  if (!conversationId) return 0;
  try {
    const res = await env.DB.prepare(
      "UPDATE dm_flow_runs SET status = 'cancelled', note = ?, updated_at = ? WHERE user_id = ? AND conversation_id = ? AND status = 'pending'",
    )
      .bind(reason.slice(0, 300), Date.now(), userId, conversationId)
      .run();
    return Number(res?.meta?.changes ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Stop the bot on one thread — "human handoff". Called when the owner answers by
 * hand and from the Inbox button, so a manual reply and an automatic one produce
 * exactly the same state.
 */
export async function pauseConversation(
  env: any,
  userId: string,
  conversationId: string,
  reason: string,
): Promise<boolean> {
  try {
    const now = Date.now();
    const res = await env.DB.prepare(
      "UPDATE dm_conversations SET bot_paused = 1, paused_at = ?, paused_reason = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
      .bind(now, reason.slice(0, 200), now, conversationId, userId)
      .run();
    await cancelPendingRun(env, userId, conversationId, reason);
    return Number(res?.meta?.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Hand the thread back to the bot. */
export async function resumeConversation(
  env: any,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const now = Date.now();
    const res = await env.DB.prepare(
      "UPDATE dm_conversations SET bot_paused = 0, paused_at = NULL, paused_reason = NULL, updated_at = ? WHERE id = ? AND user_id = ?",
    )
      .bind(now, conversationId, userId)
      .run();
    return Number(res?.meta?.changes ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Pause by person rather than by thread — that is the only handle an Instagram echo
 * gives us: it says who the message was sent to, not which conversation row it is.
 */
export async function pauseThreadForContact(
  env: any,
  userId: string,
  igUserId: string,
  reason: string,
): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      `SELECT c.id FROM dm_conversations c
         JOIN dm_contacts ct ON ct.id = c.contact_id
        WHERE c.user_id = ? AND ct.ig_user_id = ?
        ORDER BY c.last_message_at DESC LIMIT 1`,
    )
      .bind(userId, igUserId)
      .first();
    if (!row?.id) return false;
    return pauseConversation(env, userId, String(row.id), reason);
  } catch {
    return false;
  }
}

/** The newest thread with one person — the echo handler's only way in. */
export async function conversationIdForContact(
  env: any,
  userId: string,
  igUserId: string,
): Promise<string | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT c.id FROM dm_conversations c
         JOIN dm_contacts ct ON ct.id = c.contact_id
        WHERE c.user_id = ? AND ct.ig_user_id = ?
        ORDER BY c.last_message_at DESC LIMIT 1`,
    )
      .bind(userId, igUserId)
      .first();
    return row?.id ? String(row.id) : null;
  } catch {
    return null;
  }
}

export type RunDeliveryFactory = (userId: string) => Promise<Delivery | null>;

/**
 * The follow-up ladder's engine room (S3c).
 *
 * A `delay` step cannot be a timer — Workerd may evict the isolate at any moment —
 * so the wait is a row and this is what wakes it. Every guard the live engine has is
 * re-applied by simply running the real `runEngine` from the stored step: the 24-hour
 * window, the daily cap, the pause flag and the trace are the same code, not a copy.
 */
export async function drainDueRuns(
  env: any,
  resolveDelivery: RunDeliveryFactory,
  opts: { limit?: number; simulated?: boolean } = {},
): Promise<{ due: number; resumed: number; cancelled: number; failed: number; details: string[] }> {
  const summary = { due: 0, resumed: 0, cancelled: 0, failed: 0, details: [] as string[] };
  const db = env?.DB;
  if (!db) return summary;

  const simulated = opts.simulated === true;
  const limit = opts.limit ?? 20;
  const now = Date.now();
  let runs: any[] = [];
  try {
    const { results } = await db
      .prepare(
        `SELECT r.*, a.name AS automation_name, a.enabled AS automation_enabled,
                c.bot_paused AS conv_bot_paused, c.last_inbound_at AS conv_last_inbound,
                ct.ig_user_id AS contact_ig, ct.username AS contact_username,
                ct.first_name AS contact_first, ct.last_name AS contact_last
           FROM dm_flow_runs r
           LEFT JOIN dm_automations a ON a.id = r.automation_id
           LEFT JOIN dm_conversations c ON c.id = r.conversation_id
           LEFT JOIN dm_contacts ct ON ct.id = r.contact_id
          WHERE r.status = 'pending' AND r.run_at <= ?
          ORDER BY r.run_at ASC
          LIMIT ?`,
      )
      .bind(now, Math.max(1, Math.min(100, limit)))
      .all();
    runs = (results ?? []) as any[];
  } catch {
    return summary;
  }
  summary.due = runs.length;

  const finish = async (id: string, status: string, note: string) => {
    try {
      await db
        .prepare("UPDATE dm_flow_runs SET status = ?, note = ?, updated_at = ? WHERE id = ?")
        .bind(status, note.slice(0, 300), Date.now(), id)
        .run();
    } catch {
      /* the note is a courtesy; the status change is what matters */
    }
  };

  for (const run of runs) {
    // Claim it first: two overlapping cron fires must not resume the same wait, and
    // a later `delay` step — which deletes PENDING rows for this conversation — must
    // not be able to cancel the run that is executing right now.
    let claimed = false;
    try {
      const res = await db
        .prepare(
          "UPDATE dm_flow_runs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'pending'",
        )
        .bind(Date.now(), run.id)
        .run();
      claimed = Number(res?.meta?.changes ?? 0) > 0;
    } catch {
      claimed = false;
    }
    if (!claimed) continue;

    const stop = async (why: string) => {
      await finish(String(run.id), "cancelled", why);
      summary.cancelled++;
      summary.details.push(`${run.automation_name ?? run.automation_id}: cancelled — ${why}`);
    };

    if (!run.automation_enabled) {
      await stop("the rule is switched off");
      continue;
    }
    if (Number(run.conv_bot_paused ?? 0) === 1) {
      await stop("you took the thread over");
      continue;
    }
    if (!run.contact_ig) {
      await stop("the contact is gone");
      continue;
    }
    // Meta's own clock, re-checked at the moment of sending rather than when the
    // wait was booked: a 23-hour follow-up is one hour away from being illegal.
    const lastInbound = run.conv_last_inbound ? Number(run.conv_last_inbound) : null;
    if (lastInbound && now - lastInbound > DM_WINDOW_MS) {
      await stop("the 24-hour window closed before this follow-up was due");
      continue;
    }

    // A dry run proves the ladder without an account — and without the risk of a
    // real person receiving a test follow-up.
    const deliver = simulated ? null : await resolveDelivery(String(run.user_id));
    if (!simulated && !deliver) {
      await finish(String(run.id), "failed", "no connected Instagram account to send through");
      summary.failed++;
      summary.details.push(`${run.automation_name ?? run.automation_id}: failed — no account`);
      continue;
    }

    try {
      const outcome = await runEngine(env, String(run.user_id), {
        text: "",
        kind: "dm",
        commentId: null,
        automationId: String(run.automation_id),
        startAt: Number(run.step_index ?? 0),
        simulated,
        deliver,
        contact: {
          ig_user_id: String(run.contact_ig),
          username: run.contact_username ?? null,
          first_name: run.contact_first ?? null,
          last_name: run.contact_last ?? null,
        },
      });

      if (outcome.dm) {
        await finish(String(run.id), "done", `sent: ${String(outcome.dm).slice(0, 120)}`);
        summary.resumed++;
        summary.details.push(
          `${run.automation_name ?? run.automation_id}: follow-up sent to @${run.contact_username ?? run.contact_ig}`,
        );
      } else {
        const why =
          outcome.paused
            ? "you took the thread over"
            : (outcome.steps.find((s) => s.kind === "dm_skipped")?.detail ??
              "nothing could be sent");
        await stop(why);
      }
    } catch (err: any) {
      await finish(String(run.id), "failed", String(err?.message ?? err));
      summary.failed++;
    }
  }

  return summary;
}

export async function listPendingRuns(env: any, userId: string, limit = 20) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.automation_id, r.conversation_id, r.step_index, r.status, r.run_at, r.note,
              a.name AS automation_name
         FROM dm_flow_runs r
         LEFT JOIN dm_automations a ON a.id = r.automation_id
        WHERE r.user_id = ? AND r.status IN ('pending', 'running')
        ORDER BY r.run_at ASC LIMIT ?`,
    )
      .bind(userId, limit)
      .all();
    return results ?? [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ reading */

export async function listConversations(env: any, userId: string, limit = 40) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.status, c.source, c.last_message_at, c.last_inbound_at, c.unread,
              c.bot_paused, c.paused_at, c.paused_reason,
              ct.username, ct.first_name, ct.ig_user_id,
              (SELECT text FROM dm_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_text
         FROM dm_conversations c
         LEFT JOIN dm_contacts ct ON ct.id = c.contact_id
        WHERE c.user_id = ?
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT ?`,
    )
      .bind(userId, limit)
      .all();
    return (results ?? []) as any[];
  } catch {
    return [];
  }
}

export async function listMessages(env: any, userId: string, conversationId: string, limit = 60) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT direction, channel, text, matched_keyword, status, created_at
         FROM dm_messages WHERE user_id = ? AND conversation_id = ?
        ORDER BY created_at ASC LIMIT ?`,
    )
      .bind(userId, conversationId, limit)
      .all();
    return (results ?? []) as any[];
  } catch {
    return [];
  }
}

export async function listContacts(env: any, userId: string, limit = 100) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, username, first_name, last_name, ig_user_id, comments, dms, last_seen_at,
              (SELECT COUNT(*) FROM dm_leads l WHERE l.contact_id = dm_contacts.id) AS leads
         FROM dm_contacts WHERE user_id = ? ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT ?`,
    )
      .bind(userId, limit)
      .all();
    const contacts = (results ?? []) as any[];
    if (!contacts.length) return contacts;

    // Tags and custom fields are what a flow writes, so this list has to be able to
    // show them — otherwise `plan=pro` is a promise with nowhere to look.
    //
    // Two plain queries rather than one JSON aggregate on purpose: a `json_group_array`
    // that quietly came back empty on an older SQLite would look exactly like "this
    // person has no tags". If the enrichment fails, the contacts still show.
    let tagRows: any[] = [];
    let fieldRows: any[] = [];
    try {
      const [tagRes, fieldRes] = await env.DB.batch([
        env.DB.prepare(
          `SELECT ct.contact_id, t.name FROM dm_contact_tags ct
             JOIN dm_tags t ON t.id = ct.tag_id
             JOIN dm_contacts c ON c.id = ct.contact_id
            WHERE c.user_id = ?`,
        ).bind(userId),
        env.DB.prepare(
          `SELECT f.contact_id, f.key, f.value FROM dm_contact_fields f
             JOIN dm_contacts c ON c.id = f.contact_id
            WHERE c.user_id = ?`,
        ).bind(userId),
      ]);
      tagRows = (tagRes?.results ?? []) as any[];
      fieldRows = (fieldRes?.results ?? []) as any[];
    } catch {
      /* contacts still render; only the chips are missing */
    }

    const tagsBy = new Map<string, string[]>();
    for (const row of tagRows) {
      const id = String(row.contact_id);
      tagsBy.set(id, [...(tagsBy.get(id) ?? []), String(row.name)]);
    }
    const fieldsBy = new Map<string, Record<string, string>>();
    for (const row of fieldRows) {
      const id = String(row.contact_id);
      fieldsBy.set(id, {
        ...(fieldsBy.get(id) ?? {}),
        [String(row.key)]: String(row.value ?? ""),
      });
    }

    return contacts.map((c) => ({
      ...c,
      tags: tagsBy.get(String(c.id)) ?? [],
      fields: fieldsBy.get(String(c.id)) ?? {},
    }));
  } catch {
    return [];
  }
}

/** Per-automation numbers, plus a 14-day trace. Only counts what was stored. */
export async function dmAnalytics(env: any, userId: string) {
  const empty = {
    contacts: 0,
    conversations: 0,
    comments: 0,
    dms: 0,
    leads: 0,
    handoffs: 0,
    windowSkips: 0,
    capSkips: 0,
    perAutomation: [] as any[],
    daily: [] as Array<{ date: string; comments: number; dms: number }>,
  };
  try {
    const one = async (sql: string, ...args: unknown[]) => {
      const row = await env.DB.prepare(sql)
        .bind(...args)
        .first();
      return Number((row as any)?.n ?? 0);
    };

    empty.contacts = await one("SELECT COUNT(*) AS n FROM dm_contacts WHERE user_id = ?", userId);
    empty.conversations = await one(
      "SELECT COUNT(*) AS n FROM dm_conversations WHERE user_id = ?",
      userId,
    );
    empty.comments = await one(
      "SELECT COUNT(*) AS n FROM dm_messages WHERE user_id = ? AND channel = 'comment' AND direction = 'out'",
      userId,
    );
    empty.dms = await one(
      "SELECT COUNT(*) AS n FROM dm_messages WHERE user_id = ? AND channel = 'dm' AND direction = 'out'",
      userId,
    );
    empty.leads = await one("SELECT COUNT(*) AS n FROM dm_leads WHERE user_id = ?", userId);
    empty.handoffs = await one(
      "SELECT COUNT(*) AS n FROM dm_conversations WHERE user_id = ? AND status = 'handoff'",
      userId,
    );
    empty.windowSkips = await one(
      "SELECT COUNT(*) AS n FROM dm_events WHERE user_id = ? AND kind = 'window_expired'",
      userId,
    );
    empty.capSkips = await one(
      "SELECT COUNT(*) AS n FROM dm_events WHERE user_id = ? AND kind = 'cap_reached'",
      userId,
    );

    const { results } = await env.DB.prepare(
      `SELECT a.id, a.name, a.enabled,
              (SELECT COUNT(*) FROM dm_events e WHERE e.automation_id = a.id AND e.kind IN ('matched','simulated')) AS triggers,
              (SELECT COUNT(*) FROM dm_messages m WHERE m.automation_id = a.id AND m.channel = 'dm' AND m.direction = 'out') AS dms,
              (SELECT COUNT(*) FROM dm_leads l WHERE l.automation_id = a.id) AS leads
         FROM dm_automations a WHERE a.user_id = ? ORDER BY a.created_at DESC`,
    )
      .bind(userId)
      .all();
    empty.perAutomation = (results ?? []) as any[];

    const daily: Array<{ date: string; comments: number; dms: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const at = Date.now() - i * 86_400_000;
      const key = dhakaDate(at);
      const start = dhakaDayStart(at);
      const end = start + 86_400_000;
      const comments = await one(
        "SELECT COUNT(*) AS n FROM dm_messages WHERE user_id = ? AND channel = 'comment' AND direction = 'out' AND created_at >= ? AND created_at < ?",
        userId,
        start,
        end,
      );
      const dms = await one(
        "SELECT COUNT(*) AS n FROM dm_messages WHERE user_id = ? AND channel = 'dm' AND direction = 'out' AND created_at >= ? AND created_at < ?",
        userId,
        start,
        end,
      );
      daily.push({ date: key, comments, dms });
    }
    empty.daily = daily;

    return empty;
  } catch {
    return empty;
  }
}
