import { currentUserId } from "../../lib/users";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  SETTINGS_KEYS,
  getEnv,
  getKv,
  mask,
  maskApifySlots,
  readJsonSetting,
  readPillars,
  readPostingTimes,
  readSetting,
  writeSetting,
  writeSettings,
  type ApifySlot,
} from "../../lib/settings";

/**
 * GET  /api/settings — every dashboard-managed setting, secrets masked to the
 *                      last 4 characters (values are never sent back).
 * POST /api/settings — partial update, one group at a time. Anything the user
 *                      saves here takes effect immediately: no redeploy, no
 *                      `wrangler secret put`.
 *
 * Groups: ai · data · apify · telegram · instagram
 * Image generation keeps its own route (/api/settings-imagegen).
 *
 * The whole app sits behind Cloudflare Access, so this endpoint is only
 * reachable by the owner (browser session) or the agent service token.
 */

/* ------------------------------------------------------------------ schema */

const dataKeys = [
  "youtube",
  "serpapi",
  "redditId",
  "redditSecret",
  "producthunt",
] as const;
type DataKey = (typeof dataKeys)[number];

const DATA_KEY_TO_SETTING: Record<DataKey, string> = {
  youtube: SETTINGS_KEYS.youtube,
  serpapi: SETTINGS_KEYS.serpapi,
  redditId: SETTINGS_KEYS.redditId,
  redditSecret: SETTINGS_KEYS.redditSecret,
  producthunt: SETTINGS_KEYS.producthunt,
};

const postSchema = z.object({
  ai: z
    .object({
      baseUrl: z.string().trim().max(500).optional(),
      apiKey: z.string().trim().max(4000).optional(),
      clearApiKey: z.boolean().optional(),
    })
    .optional(),
  data: z
    .object({
      youtube: z.string().trim().max(4000).optional(),
      serpapi: z.string().trim().max(4000).optional(),
      redditId: z.string().trim().max(500).optional(),
      redditSecret: z.string().trim().max(4000).optional(),
      producthunt: z.string().trim().max(4000).optional(),
      clear: z.array(z.enum(dataKeys)).max(dataKeys.length).optional(),
    })
    .optional(),
  apify: z
    .object({
      slots: z
        .array(
          z.object({
            id: z.number(),
            label: z.string().trim().max(120),
            job: z.string().trim().max(120),
            // Omitted / empty means "keep whatever token is already stored".
            token: z.string().trim().max(4000).optional(),
            cap: z.number().min(0).max(1_000_000),
          }),
        )
        .max(25),
    })
    .optional(),
  telegram: z
    .object({
      botToken: z.string().trim().max(1000).optional(),
      chatId: z.string().trim().max(200).optional(),
      clearBotToken: z.boolean().optional(),
    })
    .optional(),
   instagram: z
     .object({
       handle: z.string().trim().max(200).optional(),
       competitors: z.array(z.string().trim().max(200)).max(50).optional(),
     })
     .optional(),
   content: z
     .object({
       /** Content pillars the planner rotates through. */
       pillars: z.array(z.string().trim().max(80)).max(12).optional(),
       /** Posting cadence in Asia/Dhaka, "HH:MM". */
       postingTimes: z
         .object({
           reel: z.string().trim().max(5).optional(),
           story: z.string().trim().max(5).optional(),
           carousel: z.string().trim().max(5).optional(),
         })
         .optional(),
     })
     .optional(),
 });

/* ------------------------------------------------------------------ helpers */

/**
 * Merge incoming Apify slots with what is stored: an incoming slot without a
 * token keeps the previously stored token for the same slot id, so the UI can
 * save labels/jobs/caps without ever receiving or resending the secret.
 */
function mergeApifySlots(
  incoming: Array<{ id: number; label: string; job: string; token?: string; cap: number }>,
  stored: ApifySlot[],
): ApifySlot[] {
  return incoming.map((slot) => {
    const previous = stored.find((s) => s.id === slot.id);
    const token = slot.token && slot.token.trim() !== "" ? slot.token.trim() : (previous?.token ?? "");
    return { id: slot.id, label: slot.label, job: slot.job, cap: slot.cap, token };
  });
}

/** The full masked snapshot returned by both GET and POST. */
async function snapshot(env: any, userId: string) {
  const [
    aiBaseUrl,
    aiKey,
    youtube,
    serpapi,
    redditId,
    redditSecret,
    producthunt,
    slots,
    botToken,
    chatId,
    igHandle,
    igCompetitors,
    pillars,
    postingTimes,
  ] = await Promise.all([
    readSetting(env, SETTINGS_KEYS.aiBaseUrl, undefined, userId),
    readSetting(env, SETTINGS_KEYS.aiKey, undefined, userId),
    readSetting(env, SETTINGS_KEYS.youtube, undefined, userId),
    readSetting(env, SETTINGS_KEYS.serpapi, undefined, userId),
    readSetting(env, SETTINGS_KEYS.redditId, undefined, userId),
    readSetting(env, SETTINGS_KEYS.redditSecret, undefined, userId),
    readSetting(env, SETTINGS_KEYS.producthunt, undefined, userId),
    readJsonSetting<ApifySlot[]>(env, SETTINGS_KEYS.apifySlots, [], userId),
    readSetting(env, SETTINGS_KEYS.telegramBotToken, undefined, userId),
    readSetting(env, SETTINGS_KEYS.telegramChatId, undefined, userId),
    readSetting(env, SETTINGS_KEYS.instagramHandle, undefined, userId),
    readJsonSetting<string[]>(env, SETTINGS_KEYS.instagramCompetitors, [], userId),
    readPillars(env, userId),
    readPostingTimes(env, userId),
  ]);

  return {
    ai: {
      baseUrl: aiBaseUrl,
      apiKey: mask(aiKey),
      // Distinguishes "not set here" from "set" for the UI banner.
      ready: !!aiBaseUrl && !!aiKey,
    },
    data: {
      youtube: mask(youtube),
      serpapi: mask(serpapi),
      redditId: mask(redditId),
      redditSecret: mask(redditSecret),
      producthunt: mask(producthunt),
    },
    apify: { slots: maskApifySlots(slots) },
    telegram: {
      botToken: mask(botToken),
      chatId: chatId ?? null,
      ready: !!botToken && !!chatId,
    },
    instagram: {
      handle: igHandle ?? null,
      competitors: igCompetitors,
    },
    content: {
      pillars,
      postingTimes,
    },
  };
}

/* -------------------------------------------------------------------- route */

export const Route = createFileRoute("/api/settings")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const uid = await currentUserId(request, context);
        if (!getKv(env)) {
          return Response.json(
            { ok: false, error: "KV namespace is not bound." },
            { status: 500 },
          );
        }
        return Response.json({ ok: true, ...(await snapshot(env, uid)) });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const uid = await currentUserId(request, context);
        if (!getKv(env)) {
          return Response.json(
            { ok: false, error: "KV namespace is not bound." },
            { status: 500 },
          );
        }

        let body: z.infer<typeof postSchema>;
        try {
          body = postSchema.parse(await request.json());
        } catch {
          return Response.json(
            { ok: false, error: "Invalid body." },
            { status: 400 },
          );
        }

        try {
          /* --- AI Brain --- */
          if (body.ai) {
            const entries: Record<string, string | null | undefined> = {};
            if (body.ai.baseUrl !== undefined) {
              entries[SETTINGS_KEYS.aiBaseUrl] =
                body.ai.baseUrl === "" ? null : body.ai.baseUrl;
            }
            if (body.ai.clearApiKey === true) {
              entries[SETTINGS_KEYS.aiKey] = null;
            } else if (body.ai.apiKey !== undefined && body.ai.apiKey !== "") {
              entries[SETTINGS_KEYS.aiKey] = body.ai.apiKey;
            }
            await writeSettings(env, entries, uid);
          }

          /* --- Data sources --- */
          if (body.data) {
            const entries: Record<string, string | null | undefined> = {};
            for (const key of dataKeys) {
              const value = body.data[key];
              if (typeof value === "string" && value !== "") {
                entries[DATA_KEY_TO_SETTING[key]] = value;
              }
            }
            for (const key of body.data.clear ?? []) {
              entries[DATA_KEY_TO_SETTING[key]] = null;
            }
            await writeSettings(env, entries, uid);
          }

          /* --- Apify slots --- */
          if (body.apify) {
            const stored = await readJsonSetting<ApifySlot[]>(
              env,
              SETTINGS_KEYS.apifySlots,
              [],
              uid,
            );
            const merged = mergeApifySlots(body.apify.slots, stored);
            await writeSetting(
              env,
              SETTINGS_KEYS.apifySlots,
              JSON.stringify(merged),
             uid);
          }

          /* --- Telegram --- */
          if (body.telegram) {
            const entries: Record<string, string | null | undefined> = {};
            if (body.telegram.clearBotToken === true) {
              entries[SETTINGS_KEYS.telegramBotToken] = null;
            } else if (
              body.telegram.botToken !== undefined &&
              body.telegram.botToken !== ""
            ) {
              entries[SETTINGS_KEYS.telegramBotToken] = body.telegram.botToken;
            }
            if (body.telegram.chatId !== undefined) {
              entries[SETTINGS_KEYS.telegramChatId] =
                body.telegram.chatId === "" ? null : body.telegram.chatId;
            }
            await writeSettings(env, entries, uid);
          }

          /* --- Instagram --- */
          if (body.instagram) {
            if (body.instagram.handle !== undefined) {
              await writeSetting(
                env,
                SETTINGS_KEYS.instagramHandle,
                body.instagram.handle,
               uid);
            }
            if (body.instagram.competitors !== undefined) {
              const cleaned = body.instagram.competitors
                .filter((h) => h.trim() !== "")
                .map((h) => (h.startsWith("@") ? h : `@${h}`));
              await writeSetting(
                env,
                SETTINGS_KEYS.instagramCompetitors,
                JSON.stringify(cleaned),
               uid);
            }
          }

          /* --- Content strategy (pillars + posting times) --- */
          if (body.content) {
            if (body.content.pillars !== undefined) {
              const cleaned = body.content.pillars
                .map((p) => p.trim())
                .filter(Boolean);
              await writeSetting(
                env,
                SETTINGS_KEYS.contentPillars,
                JSON.stringify(cleaned),
               uid);
            }
            if (body.content.postingTimes !== undefined) {
              const t = body.content.postingTimes;
              const valid = (v?: string) =>
                typeof v === "string" && /^\d{2}:\d{2}$/.test(v.trim())
                  ? v.trim()
                  : undefined;
              const merged = {
                ...(await readPostingTimes(env, uid)),
                ...Object.fromEntries(
                  Object.entries({ reel: valid(t.reel), story: valid(t.story), carousel: valid(t.carousel) }).filter(
                    ([, v]) => v !== undefined,
                  ),
                ),
              };
              await writeSetting(
                env,
                SETTINGS_KEYS.contentPostingTimes,
                JSON.stringify(merged),
               uid);
            }
          }
        } catch (err: any) {
          return Response.json(
            { ok: false, error: `Save failed: ${err?.message ?? String(err)}` },
            { status: 500 },
          );
        }

        return Response.json({ ok: true, ...(await snapshot(env, uid)) });
      },
    },
  },
});
