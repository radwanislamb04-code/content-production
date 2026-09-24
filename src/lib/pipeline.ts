import { OWNER_ID } from "./users";
import { lastActivityError, logActivity } from "./activity";
import { callAi } from "./ai";
import {
  creatorProfileLine,
  readApifyToken,
  readCreatorProfile,
  readJsonSetting,
  readSetting,
  SETTINGS_KEYS,
  type CreatorProfile,
} from "./settings";
import { sendTelegramLong } from "./telegram";
import { getWorkspace, putWorkspace } from "./workspace";
import { fetchGoogleTrends, fetchYouTubeTrends } from "../routes/api/trends";
import { fetchInstagramPosts } from "../routes/api/scrape-competitor";
import { storePosts } from "./post-performance";

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
  // Both of these belong to the signed-in user. `competitors` two lines below was already
  // read per-user, so reading the token and the handle as the OWNER meant a second user's
  // scrape spent the owner's Apify quota and treated the owner's account as its own.
  const token = await readApifyToken(env, "Instagram competitor", userId);
  if (!token) {
    throw new Error("Apify token not configured — add it in Settings → Apify slots");
  }

  const own = normalizeHandle(
    await readSetting(env, SETTINGS_KEYS.instagramHandle, undefined, userId),
  );
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
    // This used to DELETE every row for the handle and insert the newest ten, so the
    // brief could never see anything older than the last scrape — the "7-day window"
    // had nothing to look at. Now each post is matched by URL: seen before → updated,
    // new → inserted. History accumulates, duplicates cannot.
    //
    // `userId`, not the OWNER_ID constant it used to bind: the scrape resolves a token
    // per user, so attributing every row to the owner was simply wrong for anyone else.
    // storePosts also drops scraper error text, which used to be stored as a "post".
    stored += await storePosts(env, userId, handle, real, own === handle);
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
      // Ordered in JS, not by one ORDER BY, because the brief asks two questions:
      // "what are they posting now" (the last few days, newest first) and "what works"
      // (all-time top). Ranking by likes answered only the second — which is why the
      // brief kept leading with an old 151K-like post and never mentioned this week.
      const { results } = await db
        .prepare(
          `SELECT handle, caption, likes, comments, url, posted_at FROM post_performance
            WHERE is_own_account = 0 AND user_id = ?
            ORDER BY likes DESC LIMIT 60`,
        )
          .bind(userId)
        .all();
      viral = rankCompetitorPosts((results ?? []) as any[]);
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

  // Who this brief is for, read per user — the prompt used to name the owner's
  // brand and handle for everyone.
  const profile = await readCreatorProfile(env, userId);

  const markdown = await callAi(
    env,
    buildBriefPrompt({ dateKey, trends, viral, picks, tasks, profile }),
    {
      maxTokens: 1600,
      userId,
    },
  );
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

/** How far back "recent" reaches when ranking competitor posts. */
export const COMPETITOR_RECENT_DAYS = 7;

/** "3 days ago" — the brief is read on a phone; the age is the point, the timestamp is not. */
export function postAge(postedAt: unknown, now: number = Date.now()): string {
  const t = Date.parse(String(postedAt ?? ""));
  if (!Number.isFinite(t)) return "";
  const days = Math.round((now - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
}

/**
 * Order competitor posts for the brief: the last few days, newest first, then the best of
 * everything older.
 *
 * Deliberately NOT ranked by likes across the board. A post from yesterday has not had time
 * to collect the likes a three-week-old post has, so likes-ranking guarantees the fresh ones
 * lose — the exact failure this replaces.
 */
export function rankCompetitorPosts(rows: any[], now: number = Date.now()): any[] {
  const cutoff = now - COMPETITOR_RECENT_DAYS * 86_400_000;
  const dated = rows.map((r) => ({ ...r, _t: Date.parse(String(r.posted_at ?? "")) }));
  const isRecent = (r: any) => Number.isFinite(r._t) && r._t >= cutoff;

  const recent = dated
    .filter(isRecent)
    .sort((a, b) => b._t - a._t)
    .slice(0, 5);
  const fresh = new Set(recent.map((r) => String(r.url ?? "")));
  const best = dated
    .filter((r) => !fresh.has(String(r.url ?? "")))
    .sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0))
    .slice(0, 3);

  return [...recent, ...best];
}

/** The two competitor groups, labelled so the writer cannot mix them up. */
function competitorBlock(rows: any[], now: number = Date.now()): string {
  if (!rows.length) return "(none)";
  const cutoff = now - COMPETITOR_RECENT_DAYS * 86_400_000;
  const line = (p: any) =>
    `${p.handle} (${postAge(p.posted_at, now) || "date unknown"}) — ${p.likes} likes, ` +
    `${p.comments} comments: ${String(p.caption ?? "").slice(0, 400)}`;
  const fresh = rows.filter((p) => {
    const t = Date.parse(String(p.posted_at ?? ""));
    return Number.isFinite(t) && t >= cutoff;
  });
  const older = rows.filter((p) => !fresh.includes(p));

  return [
    `Posted in the last ${COMPETITOR_RECENT_DAYS} days (newest first — this is what they are doing NOW; read the captions for hook and structure):`,
    fresh.length ? fresh.map(line).join("\n") : "(nothing in the last few days)",
    "Their best-performing older posts (context only — not the current direction):",
    older.length ? older.map(line).join("\n") : "(none)",
  ].join("\n");
}

function buildBriefPrompt(d: {
  dateKey: string;
  trends: any;
  viral: any[];
  picks: any[];
  tasks: any[];
  profile: CreatorProfile;
}): string {
  const list = (rows: string[]) => (rows.length ? rows.join("\n") : "(none)");
  return `You are the daily brief writer for a solo short-form video creator (Instagram Reels / YouTube Shorts, ${creatorProfileLine(d.profile)}).

Write the brief for ${d.dateKey} in plain text (no tables, no markup other than "-" bullets) with EXACTLY these section headings, in this order:

TODAY'S PICKS
TRENDING NOW
COMPETITOR WATCH
HOOK IDEAS
ACTION ITEMS

Rules:
- Use ONLY the data below. Never invent numbers, names or links.
- If a section has no data, write exactly: No data yet.
 - At most 5 bullets per section, each under 140 characters (COMPETITOR WATCH may use up to
   5 for the recent posts plus 2 for the older best-performers).
 - COMPETITOR WATCH: lead with what they posted in the last few days, newest first, and say
   how old each post is. What they are doing NOW is the point; an old high-view post is
   context, and belongs below. Read those captions as a writer, not a statistician — say
   what they did with the hook and the structure, so it can be copied.
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
 Competitor posts (captions are the evidence for how they write — the hook is in the
 first line, the style in the body, so they are quoted at length on purpose):
 ${competitorBlock(d.viral)}
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
