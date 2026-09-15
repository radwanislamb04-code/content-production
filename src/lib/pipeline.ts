import { OWNER_ID } from "./users";
import { lastActivityError, logActivity } from "./activity";
import { callAi } from "./ai";
import {
  readApifyToken,
  readJsonSetting,
  readSetting,
  SETTINGS_KEYS,
} from "./settings";
import { sendTelegramLong } from "./telegram";
import { getWorkspace, putWorkspace } from "./workspace";
import { fetchGoogleTrends, fetchYouTubeTrends } from "../routes/api/trends";
import { fetchInstagramPosts } from "../routes/api/scrape-competitor";

/**
 * Content OS — the one pipeline.
 *
 * The same runner is invoked two ways:
 *   • on demand  — AutoPilot's buttons (`POST /api/run-pipeline`)
 *   • on schedule — the Cloudflare cron (08:00 and 20:00 Asia/Dhaka)
 *
 * Every step logs to `activity`, so AutoPilot's log panel, the TopNav bell and
 * the Performance page all read real history instead of inventing it.
 */

export type StepId = "trends" | "scrape" | "brief" | "send";

export const PIPELINE_STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: "trends", label: "Trends", hint: "Google Trends (BD) + YouTube trending" },
  { id: "scrape", label: "Competitor scrape", hint: "Apify → post_performance" },
  { id: "brief", label: "Compose brief", hint: "AI → workspace brief_YYYY-MM-DD" },
  { id: "send", label: "Send to Telegram", hint: "Deliver the brief" },
];

export type StepResult = {
  step: StepId;
  ok: boolean;
  detail: string;
  items?: number;
  ms: number;
};

export type PipelineReport = {
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  steps: StepResult[];
  briefKey?: string;
  telegramSent?: number;
  /** Why the activity writes failed, if they did — otherwise null. */
  logError?: string | null;
};

const DHAMA_OFFSET_MS = 6 * 60 * 60 * 1000; // Asia/Dhaka is UTC+6, no DST

/** The calendar date (YYYY-MM-DD) it is right now in Dhaka, where the user is. */
export function dhakaDateKey(at = Date.now()): string {
  return new Date(at + DHAMA_OFFSET_MS).toISOString().slice(0, 10);
}

const ERROR_ROW = /error|not configured|missing/i;

/** Run the requested steps (all of them by default) in order. */
export async function runPipeline(
  env: any,
  requested?: string[] | null,
  userId: string = OWNER_ID,
): Promise<PipelineReport> {
  const startedAt = Date.now();
  let wanted = (requested && requested.length
    ? requested
    : PIPELINE_STEPS.map((s) => s.id)
  ).filter((id, i, arr) => arr.indexOf(id) === i) as StepId[];

  // The Sources screen switches must mean something: a source the owner turned
  // off is not fetched by the scheduled run either. Only the three wired
  // sources map to a step (youtube + serpapi → trends, ig-competitors → scrape).
  try {
    const disabled = await readJsonSetting<string[]>(env, "sources:disabled", [], userId);
    if (disabled.includes("youtube") && disabled.includes("serpapi")) {
      wanted = wanted.filter((s) => s !== "trends");
    }
    if (disabled.includes("ig-competitors")) {
      wanted = wanted.filter((s) => s !== "scrape");
    }
  } catch {
    /* never block a run because a settings read failed */
  }

  const steps: StepResult[] = [];
  let briefKey: string | undefined;
  let telegramSent: number | undefined;

  for (const id of wanted) {
    const t0 = Date.now();
    try {
      if (id === "trends") {
        const r = await stepTrends(env, userId);
        steps.push({ step: id, ok: true, detail: r.detail, items: r.items, ms: Date.now() - t0 });
        await logActivity(env, "trends", "fetch_ok", r.detail);
      } else if (id === "scrape") {
        const r = await stepScrape(env, userId);
        steps.push({ step: id, ok: true, detail: r.detail, items: r.items, ms: Date.now() - t0 });
        await logActivity(env, "scrape-competitor", "scrape_ok", r.detail);
      } else if (id === "brief") {
        const r = await stepBrief(env, userId);
        briefKey = r.key;
        steps.push({ step: id, ok: true, detail: r.detail, ms: Date.now() - t0 });
        await logActivity(env, "brief", "generated", r.detail);
      } else if (id === "send") {
        const r = await stepSend(env, userId);
        telegramSent = r.sent;
        steps.push({ step: id, ok: true, detail: r.detail, items: r.sent, ms: Date.now() - t0 });
        await logActivity(env, "telegram-sync", "sent", r.detail);
      }
    } catch (err: any) {
      const detail = err?.message ?? String(err);
      steps.push({ step: id, ok: false, detail, ms: Date.now() - t0 });
      await logActivity(env, id, "step_failed", detail);
    }
  }

  const ok = steps.every((s) => s.ok);
  const finishedAt = Date.now();
  const summary = steps.map((s) => `${s.step}:${s.ok ? "ok" : "failed"}`).join(" ");
  await logActivity(
    env,
    "pipeline",
    ok ? "pipeline_ok" : "pipeline_failed",
    `${summary} (${Math.round((finishedAt - startedAt) / 1000)}s)`,
  );

  return {
    ok,
    startedAt,
    finishedAt,
    steps,
    briefKey,
    telegramSent,
    logError: lastActivityError(),
  };
}

// ---------------------------------------------------------------- steps

/** Fetch trends and remember them so the brief step does not refetch. */
async function stepTrends(
  env: any,
  userId: string = OWNER_ID,
): Promise<{ detail: string; items: number }> {
  const [serp, yt] = await Promise.all([
    readSetting(env, SETTINGS_KEYS.serpapi, undefined, userId),
    readSetting(env, SETTINGS_KEYS.youtube, undefined, userId),
  ]);

  const [google, youtube] = await Promise.all([
    fetchGoogleTrends(serp, "BD"),
    fetchYouTubeTrends(yt),
  ]);

  const cleanGoogle = google.filter((t) => !ERROR_ROW.test(t.title));
  const cleanYoutube = youtube.filter((t) => !ERROR_ROW.test(t.title));

  if (cleanGoogle.length === 0 && cleanYoutube.length === 0) {
    throw new Error(
      google[0]?.title || youtube[0]?.title || "No trend data returned",
    );
  }

  await putWorkspace(env, userId, "last_trends", {
    at: Date.now(),
    google: cleanGoogle,
    youtube: cleanYoutube,
  });

  return {
    detail: `${cleanGoogle.length} Google (BD) + ${cleanYoutube.length} YouTube trends`,
    items: cleanGoogle.length + cleanYoutube.length,
  };
}

/** Scrape each competitor (max 3) plus the user's own account into D1. */
async function stepScrape(
  env: any,
  userId: string = OWNER_ID,
): Promise<{ detail: string; items: number }> {
  const token = await readApifyToken(env, "Instagram competitor");
  if (!token) {
    throw new Error("Apify token not configured — add it in Settings → Apify slots");
  }

  const own = normalizeHandle(await readSetting(env, SETTINGS_KEYS.instagramHandle));
  const competitors = (
    await readJsonSetting<string[]>(env, SETTINGS_KEYS.instagramCompetitors, [], userId)
  )
    .map(normalizeHandle)
    .filter(Boolean)
    .slice(0, 3);

  const targets = [...competitors, own].filter(Boolean);
  if (targets.length === 0) {
    throw new Error(
      "No Instagram handle or competitors saved — add them in Settings → Instagram",
    );
  }

  const db = env?.DB;
  if (!db) throw new Error("D1 is not bound — cannot store scraped posts");

  let stored = 0;
  const notes: string[] = [];

  for (const handle of targets) {
    const posts = await fetchInstagramPosts(token, handle);
    const real = posts.filter(
      (p) => p.url && !/apify|not configured|error/i.test(p.caption),
    );
    if (real.length === 0) {
      notes.push(`${handle}: 0${posts[0]?.caption ? ` (${posts[0].caption.slice(0, 50)})` : ""}`);
      continue;
    }
    try {
      await db
        .prepare("DELETE FROM post_performance WHERE handle = ? AND user_id = ?")
        .bind(handle, userId)
        .run();
    } catch {
      /* table may be empty — nothing to clear */
    }
    const isOwn = own && handle === own ? 1 : 0;
    for (const p of real) {
      try {
        await db
          .prepare(
            "INSERT INTO post_performance (id, handle, is_own_account, caption, likes, comments, url, posted_at, scraped_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            crypto.randomUUID(),
            handle,
            isOwn,
            p.caption ?? "",
            Number(p.likes) || 0,
            Number(p.comments) || 0,
            p.url ?? "",
            p.timestamp || null,
            Date.now(),
          
                OWNER_ID)
          .run();
        stored++;
      } catch {
        /* skip a bad row rather than lose the whole run */
      }
    }
    notes.push(`${handle}: ${real.length}`);
  }

  return { detail: `${stored} posts stored — ${notes.join(" · ")}`, items: stored };
}

/** Compose the brief with the AI and store it as workspace `brief_YYYY-MM-DD`. */
async function stepBrief(
  env: any,
  userId: string = OWNER_ID,
): Promise<{ key: string; detail: string }> {
  const dateKey = dhakaDateKey();
  const key = `brief_${dateKey}`;

  const trends =
    (await getWorkspace<any>(env, userId, "last_trends")) ?? {
      google: [],
      youtube: [],
    };

  let viral: any[] = [];
  let picks: any[] = [];
  let tasks: any[] = [];
  const db = env?.DB;

  if (db) {
    try {
      const { results } = await db
        .prepare(
          "SELECT handle, caption, likes, comments, url FROM post_performance WHERE is_own_account = 0 AND user_id = ? ORDER BY likes DESC LIMIT 5",
        )
          .bind(userId)
        .all();
      viral = results ?? [];
    } catch {
      /* table empty or missing */
    }
    try {
      const { results } = await db
        .prepare(
          "SELECT id, type, title, quality_score FROM library WHERE (status IS NULL OR status != 'archived') AND user_id = ? ORDER BY COALESCE(quality_score, 0) DESC, rowid DESC LIMIT 5",
        )
          .bind(userId)
        .all();
      picks = results ?? [];
    } catch {
      /* table empty or missing */
    }
    try {
      const { results } = await db
        .prepare(
          "SELECT id, text, time FROM telegram_tasks WHERE COALESCE(done, 0) = 0 AND user_id = ? ORDER BY created_at DESC LIMIT 5",
        )
          .bind(userId)
        .all();
      tasks = results ?? [];
    } catch {
      /* table empty or missing */
    }
  }

  const markdown = await callAi(env, buildBriefPrompt({ dateKey, trends, viral, picks, tasks }), {
    maxTokens: 1600,
  });
  if (!markdown || markdown.length < 40) {
    throw new Error("The AI returned an empty brief");
  }

  const saved = await putWorkspace(env, userId, key, {
    date: dateKey,
    generated_at: Date.now(),
    markdown,
    context: {
      trends: (trends.google ?? []).slice(0, 5),
      youtube: (trends.youtube ?? []).slice(0, 5),
      viral,
      picks,
      tasks,
    },
  });
  if (!saved) throw new Error("Could not save the brief to the workspace table");

  return { key, detail: `${key} · ${markdown.length} chars` };
}

/** Deliver today's brief to Telegram. */
async function stepSend(
  env: any,
  userId: string = OWNER_ID,
): Promise<{ detail: string; sent: number }> {
  const dateKey = dhakaDateKey();
  const brief = await getWorkspace<any>(env, userId, `brief_${dateKey}`);
  const text: string | undefined = brief?.markdown;
  if (!text) throw new Error(`No brief stored for ${dateKey} — run the "brief" step first`);

  const r = await sendTelegramLong(
    env,
    `Content OS — brief for ${dateKey}\n\n${text}`,
    {},
    userId,
  );
  if (!r.ok) throw new Error(r.error ?? "Telegram send failed");
  return { detail: `brief for ${dateKey} sent in ${r.sent} message(s)`, sent: r.sent ?? 0 };
}

// ---------------------------------------------------------------- helpers

function normalizeHandle(handle?: string | null): string {
  return String(handle ?? "").trim().replace(/^@+/, "");
}

function buildBriefPrompt(d: {
  dateKey: string;
  trends: any;
  viral: any[];
  picks: any[];
  tasks: any[];
}): string {
  const list = (rows: string[]) => (rows.length ? rows.join("\n") : "(none)");
  return `You are the daily brief writer for a solo short-form video creator (Instagram Reels / YouTube Shorts, brand "JepyLabs", handle @enzorico.ai).

Write the brief for ${d.dateKey} in plain text (no tables, no markup other than "-" bullets) with EXACTLY these section headings, in this order:

TODAY'S PICKS
TRENDING NOW
COMPETITOR WATCH
HOOK IDEAS
ACTION ITEMS

Rules:
- Use ONLY the data below. Never invent numbers, names or links.
- If a section has no data, write exactly: No data yet.
- At most 5 bullets per section, each under 140 characters.
- Keep it tight and skimmable; it is read on a phone.

DATA
Google Trends (Bangladesh): ${list(
    (d.trends.google ?? [])
      .slice(0, 5)
      .map((t: any) => `${t.title} (${t.metric || "n/a"})`),
  )}
YouTube trending: ${list(
    (d.trends.youtube ?? [])
      .slice(0, 5)
      .map((t: any) => `${t.title} (${t.metric || "n/a"})`),
  )}
Competitor posts by likes: ${list(
    d.viral.map(
      (p: any) =>
        `${p.handle} — ${p.likes} likes, ${p.comments} comments: ${String(p.caption ?? "").slice(0, 90)}`,
    ),
  )}
My content in the library: ${list(
    d.picks.map(
      (p: any) =>
        `${p.type}: ${String(p.title ?? "").slice(0, 80)}${
          p.quality_score != null ? ` (score ${p.quality_score})` : ""
        }`,
    ),
  )}
Open tasks: ${list(d.tasks.map((t: any) => String(t.text ?? "").slice(0, 90)))}`;
}
