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
  created_at: number;
  updated_at: number;
};

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
  /** Stage-1 simulator: record everything, send nothing to Meta. */
  simulated?: boolean;
  /** Pretend this person's last message was N days ago, to exercise the window. */
  assumeStaleDays?: number;
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
  match_mode: "contains" | "exact" | "any_word";
  post_scope: "any" | "post";
  post_id?: string | null;
  public_reply?: string | null;
  dm_message?: string | null;
  dm_button_label?: string | null;
  dm_button_url?: string | null;
  counter_enabled?: boolean;
  daily_cap?: number;
  goal?: string | null;
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
    ["contains", "exact", "any_word"].includes(input.match_mode) ? input.match_mode : "contains",
    input.post_scope === "post" ? "post" : "any",
    input.post_scope === "post" ? (input.post_id ?? null) : null,
    input.public_reply?.slice(0, 900) ?? null,
    input.dm_message?.slice(0, 900) ?? null,
    input.dm_button_label?.slice(0, 60) ?? null,
    input.dm_button_url?.slice(0, 300) ?? null,
    input.counter_enabled ? 1 : 0,
    Math.max(0, Math.min(500, Math.floor(Number(input.daily_cap ?? 0)) || 0)),
    input.goal?.slice(0, 60) ?? null,
  ];

  try {
    const existing = input.id ? await getAutomation(env, userId, id) : null;
    if (existing) {
      await db
        .prepare(
          `UPDATE dm_automations SET name = ?, trigger_type = ?, keywords = ?, match_mode = ?,
             post_scope = ?, post_id = ?, public_reply = ?, dm_message = ?, dm_button_label = ?,
             dm_button_url = ?, counter_enabled = ?, daily_cap = ?, goal = ?, updated_at = ?
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
              daily_cap, goal, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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
  },
) {
  try {
    await env.DB.prepare(
      `INSERT INTO dm_messages
         (id, user_id, conversation_id, contact_id, automation_id, direction, channel, text, matched_keyword, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        Date.now(),
      )
      .run();
  } catch {
    /* see addEvent */
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
  const steps: Step[] = [];
  const result: EngineResult = {
    matched: false,
    automation: null,
    keyword: null,
    publicReply: null,
    dm: null,
    dmVia: null,
    handoff: false,
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
  const match = matchAutomation(automations, input);

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
    detail: keyword
      ? `“${keyword}” (${automation.match_mode}) in “${automation.name}”`
      : `“${automation.name}” answers everything`,
    ok: true,
  });

  // Conversation + the 7-day messaging window.
  const now = Date.now();
  let conversationId: string | null = null;
  let previousInbound: number | null = null;
  try {
    const existing = await db
      .prepare(
        "SELECT id, last_inbound_at FROM dm_conversations WHERE user_id = ? AND contact_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(userId, contact?.id ?? "")
      .first();
    if (existing) {
      conversationId = (existing as any).id;
      previousInbound = (existing as any).last_inbound_at ?? null;
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

  // The inbound message itself.
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
    await addMessage(env, userId, {
      conversation_id: conversationId,
      contact_id: contact?.id ?? null,
      automation_id: automation.id,
      direction: "out",
      channel: "comment",
      text,
      matched_keyword: keyword,
      status,
    });
    result.publicReply = text;
    steps.push({ kind: "public_reply", label: "Public reply", detail: text, ok: true });
    await addEvent(env, userId, {
      automation_id: automation.id,
      contact_id: contact?.id ?? null,
      conversation_id: conversationId,
      kind: "reply_sent",
      detail: text.slice(0, 200),
    });
  }

  // Private DM — window + cap apply.
  if (automation.dm_message) {
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

      let text = render(automation.dm_message, vars);
      if (automation.dm_button_label) {
        text += `\n\n👉 ${automation.dm_button_label}${
          automation.dm_button_url ? `: ${automation.dm_button_url}` : ""
        }`;
      }
      await addMessage(env, userId, {
        conversation_id: conversationId,
        contact_id: contact?.id ?? null,
        automation_id: automation.id,
        direction: "out",
        channel: "dm",
        text,
        matched_keyword: keyword,
        status,
      });
      if (via === "private_reply" && commentId) {
        await recordCommentReply(env, userId, {
          commentId,
          automationId: automation.id,
          contactId: contact?.id ?? null,
          conversationId,
        });
      }
      result.dm = text;
      result.dmVia = via;
      steps.push({
        kind: "dm_sent",
        label: via === "private_reply" ? "Private reply sent" : "DM sent",
        detail: text,
        ok: true,
      });
      await addEvent(env, userId, {
        automation_id: automation.id,
        contact_id: contact?.id ?? null,
        conversation_id: conversationId,
        kind: "dm_sent",
        detail: `${via}: ${text.slice(0, 160)}`,
      });

      if (automation.goal && contact?.id) {
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

  // Bookkeeping: this is an inbound message, so the window starts again now.
  if (conversationId) {
    try {
      await db
        .prepare(
          `UPDATE dm_conversations SET last_inbound_at = ?, last_outbound_at = COALESCE(?, last_outbound_at),
             last_message_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        )
        .bind(now, result.dm ? now : null, now, now, conversationId, userId)
        .run();
    } catch {
      /* ignore */
    }
  }

  await addEvent(env, userId, {
    automation_id: automation.id,
    contact_id: contact?.id ?? null,
    conversation_id: conversationId,
    kind: simulated ? "simulated" : "matched",
    detail: `${input.kind}: ${input.text.slice(0, 120)}`,
  });

  return result;
}

/* ------------------------------------------------------------------ reading */

export async function listConversations(env: any, userId: string, limit = 40) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.status, c.source, c.last_message_at, c.last_inbound_at, c.unread,
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
    return (results ?? []) as any[];
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
