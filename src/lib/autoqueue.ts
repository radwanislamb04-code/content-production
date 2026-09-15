/**
 * Content OS — auto-queue.
 *
 * ⑤ of the master plan: the queue should not depend on remembering to add tasks.
 * Two real sources feed it, and nothing here invents work that is not in the data:
 *
 *   calendar  — today's entries from `calendar_YYYY-MM` (the planner's output)
 *               become “Post REEL: <topic> · 21:00”.
 *   library   — scripts still in `draft` become “Approve script: <title>”, so a
 *               finished script surfaces once instead of being forgotten.
 *
 * Every auto row carries a `ref_key`, and `telegram_tasks` has a UNIQUE index on
 * (user_id, ref_key), so running the queue twice — the cron does it at 08:00 and
 * 20:00, and the AutoPilot button can do it on demand — is always a no-op the
 * second time. That is the whole reason the key exists.
 */

import { getWorkspace } from "./workspace";
import { createTask, dhakaTime, type TaskInput } from "./telegram-hook";
import { dhakaDateKey } from "./pipeline";

export type QueueCandidate = TaskInput & {
  ref_key: string;
  /** True when a row with this ref_key already exists. */
  queued: boolean;
};

export type QueueResult = {
  date_key: string;
  created: number;
  skipped: number;
  tasks: Array<{ text: string; time: string; due_date: string | null; source: string }>;
  errors: string[];
};

/** What today's queue would contain, and which parts are already in it. */
export async function pendingWork(
  env: any,
  userId: string,
  dateKey: string = dhakaDateKey(),
): Promise<QueueCandidate[]> {
  const candidates: QueueCandidate[] = [];
  const month = dateKey.slice(0, 7);

  // --- today's calendar entries ------------------------------------------
  const calendar = await getWorkspace<any>(env, userId, `calendar_${month}`);
  const entries: any[] = Array.isArray(calendar?.entries) ? calendar.entries : [];
  entries.forEach((entry, index) => {
    if (!entry || entry.date !== dateKey) return;
    const type = String(entry.type ?? "Post").trim();
    const topic = String(entry.topic ?? "").trim();
    if (!topic) return;
    const time = /^\d{2}:\d{2}$/.test(String(entry.time ?? "")) ? String(entry.time) : undefined;
    candidates.push({
      text: `Post ${type.toUpperCase()}: ${topic}`.slice(0, 300),
      time,
      due_date: dateKey,
      source: "calendar",
      ref_key: `cal:${dateKey}:${index}`,
      queued: false,
    });
  });

  // --- scripts waiting for approval --------------------------------------
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, title FROM library
        WHERE user_id = ? AND type = 'script' AND COALESCE(status, 'draft') = 'draft'
        ORDER BY created_at DESC LIMIT 5`,
    )
      .bind(userId)
      .all();
    for (const row of (results ?? []) as Array<{ id: string; title: string }>) {
      // Library titles often already start with "Script: " — repeating it read as
      // "Approve script: Script: …" on every row.
      const title = String(row.title ?? "").replace(/^\s*(script|video script)\s*[:\-–]\s*/i, "");
      candidates.push({
        text: `Approve script: ${title}`.slice(0, 300),
        due_date: dateKey,
        source: "library",
        ref_key: `script:${row.id}`,
        queued: false,
      });
    }
  } catch {
    /* table or column missing — no candidates rather than an exception */
  }

  // --- mark what is already queued ---------------------------------------
  if (candidates.length) {
    const keys = candidates.map((c) => c.ref_key);
    const placeholders = keys.map(() => "?").join(", ");
    try {
      const { results } = await env.DB.prepare(
        `SELECT ref_key FROM telegram_tasks WHERE user_id = ? AND ref_key IN (${placeholders})`,
      )
        .bind(userId, ...keys)
        .all();
      const have = new Set((results ?? []).map((r: any) => String(r.ref_key)));
      for (const c of candidates) c.queued = have.has(c.ref_key);
    } catch {
      /* if the lookup fails, treat everything as not yet queued */
    }
  }

  return candidates;
}

/** Queue everything that is not queued yet. Safe to call as often as you like. */
export async function queuePendingWork(
  env: any,
  userId: string,
  dateKey: string = dhakaDateKey(),
): Promise<QueueResult> {
  const result: QueueResult = {
    date_key: dateKey,
    created: 0,
    skipped: 0,
    tasks: [],
    errors: [],
  };

  const candidates = await pendingWork(env, userId, dateKey);
  for (const candidate of candidates) {
    if (candidate.queued) {
      result.skipped++;
      continue;
    }
    const written = await createTask(env, userId, {
      text: candidate.text,
      time: candidate.time,
      due_date: candidate.due_date,
      source: candidate.source,
      ref_key: candidate.ref_key,
    });
    if (!written.created) {
      if (written.error) result.errors.push(`${candidate.text}: ${written.error}`);
      else result.skipped++;
      continue;
    }
    result.created++;
    result.tasks.push({
      text: candidate.text,
      time: candidate.time ?? dhakaTime(),
      due_date: candidate.due_date ?? null,
      source: String(candidate.source ?? "calendar"),
    });
  }

  return result;
}
