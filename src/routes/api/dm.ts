import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";
import { logActivity } from "../../lib/activity";
import {
  attachTag,
  cancelPendingRun,
  deleteAutomation,
  deleteTag,
  detachTag,
  dmAttribution,
  draftReplies,
  dmAnalytics,
  drainDueRuns,
  getAutomation,
  listAutomations,
  listContacts,
  listConversations,
  listMessages,
  listPendingRuns,
  listPostRefs,
  listTags,
  mineUnansweredQuestions,
  mintIdeaFromQuestion,
  setPostRef,
  testComments,
  pauseConversation,
  resumeConversation,
  runEngine,
  saveAutomation,
  setContactField,
  setAutomationEnabled,
} from "../../lib/dm";

/**
 * /api/dm — the DM Manager (stage 1).
 *
 * One route with an explicit `action`, because everything here is one feature seen
 * from five angles (automations, inbox, contacts, analytics, simulate) and five
 * tiny route files would spread one authorisation rule across five places.
 *
 * Stage 1 never talks to Meta: `simulate` runs the SAME `runEngine` the webhook
 * will run in stage 2, and writes the same rows, flagged `simulated`. So the
 * Inbox, the contacts and the analytics are real records of real decisions — they
 * just were triggered by you instead of by Instagram.
 */

const automationSchema = z.object({
  id: z.string().trim().max(120).optional(),
  name: z.string().trim().min(1, "Give the automation a name.").max(120),
  trigger_type: z.enum(["comment", "dm"]),
  keywords: z.array(z.string().trim().min(1)).max(25).default([]),
  // "ai" means the rule has no keyword of its own: the model reads the message and
  // points at one of the owner's rules. It never writes the reply.
  match_mode: z.enum(["contains", "exact", "any_word", "ai"]).default("contains"),
  // "next" means "the next post I publish, whichever it turns out to be": the first post
  // the rule sees becomes its post.
  post_scope: z.enum(["any", "post", "next"]).default("any"),
  post_id: z.string().trim().max(120).nullish(),
  public_reply: z.string().trim().max(900).nullish(),
  dm_message: z.string().trim().max(900).nullish(),
  dm_button_label: z.string().trim().max(60).nullish(),
  dm_button_url: z.string().trim().max(300).nullish(),
  counter_enabled: z.boolean().optional(),
  daily_cap: z.number().int().min(0).max(500).optional(),
  goal: z.string().trim().max(60).nullish(),
  /** Free text for what a keyword cannot hold — e.g. what to say when it lands live. */
  note: z.string().trim().max(300).nullish(),
  /**
   * S3. Deliberately permissive: `saveAutomation` is what sanitises and caps the
   * sequence, so a half-built step from the UI is dropped quietly instead of
   * making the whole rule unsavable.
   */
  flow_steps: z
    .array(
      z.object({
        id: z.string().max(40).optional(),
        kind: z.string().trim().min(1).max(20),
        text: z.string().max(900).optional(),
        label: z.string().max(60).optional(),
        url: z.string().max(300).optional(),
        options: z.array(z.string().max(40)).max(3).optional(),
        amount: z.number().int().min(0).max(43200).optional(),
        unit: z.string().max(10).optional(),
        field: z.string().max(40).optional(),
        op: z.string().max(20).optional(),
        value: z.string().max(200).optional(),
        // A `library` step. Zod drops keys it does not know, so a field missing here
        // is a field the engine never sees — this file and `saveAutomation` have to
        // agree or the step silently loses its target.
        library_type: z.string().max(40).optional(),
        library_id: z.string().max(60).optional(),
        library_pick: z.string().max(10).optional(),
      }),
    )
    .max(40)
    .optional(),
});

const simulateSchema = z.object({
  automation_id: z.string().trim().max(120).optional(),
  text: z.string().trim().min(1, "Write the comment to test.").max(600),
  kind: z.enum(["comment", "dm"]).default("comment"),
  username: z.string().trim().max(60).optional(),
  first_name: z.string().trim().max(60).optional(),
  post_id: z.string().trim().max(120).optional(),
  /** Lets the same simulated person be reused, so the windows can be tested. */
  ig_user_id: z.string().trim().max(60).optional(),
  /**
   * The comment id. Meta allows ONE private reply per comment, so the simulator
   * derives a stable id from the text when none is given — run the same
   * simulation twice and the second run proves the rule holds.
   */
  comment_id: z.string().trim().max(120).optional(),
  assume_stale_days: z.number().int().min(0).max(60).optional(),
});

export const Route = createFileRoute("/api/dm")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const userId = await currentUserId(request, context);
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "automations";

        if (action === "automations") {
          return Response.json({ ok: true, automations: await listAutomations(env, userId) });
        }
        if (action === "inbox") {
          return Response.json({ ok: true, conversations: await listConversations(env, userId) });
        }
        if (action === "conversation") {
          const id = url.searchParams.get("id") ?? "";
          if (!id) return Response.json({ ok: false, error: "Pass ?id=" }, { status: 400 });
          return Response.json({
            ok: true,
            messages: await listMessages(env, userId, id),
          });
        }
        if (action === "contacts") {
          return Response.json({ ok: true, contacts: await listContacts(env, userId) });
        }
        if (action === "analytics") {
          return Response.json({ ok: true, ...(await dmAnalytics(env, userId)) });
        }
        if (action === "tags") {
          return Response.json({ ok: true, tags: await listTags(env, userId) });
        }
        if (action === "runs") {
          return Response.json({ ok: true, runs: await listPendingRuns(env, userId) });
        }
        /** Which post, and which rule, brought the leads. A read, so it lives here. */
        if (action === "attribution") {
          return Response.json({ ok: true, ...(await dmAttribution(env, userId)) });
        }
        if (action === "post-refs") {
          return Response.json({ ok: true, refs: await listPostRefs(env, userId) });
        }
        return Response.json(
          {
            ok: false,
            error:
              "Unknown action. Use automations, inbox, conversation, contacts, analytics, tags, runs or attribution.",
          },
          { status: 400 },
        );
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const userId = await currentUserId(request, context);
        const body = (await request.json().catch(() => ({}))) as any;
        const action = String(body?.action ?? "");

        if (action === "save") {
          const parsed = automationSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid automation." },
              { status: 400 },
            );
          }
          const saved = await saveAutomation(env, userId, parsed.data);
          if (!saved.ok) {
            return Response.json({ ok: false, error: saved.error }, { status: 500 });
          }
          const automation = await getAutomation(env, userId, saved.id!);
          await logActivity(
            env,
            "dm",
            parsed.data.id ? "automation_updated" : "automation_created",
            automation?.name ?? saved.id!,
            userId,
          );
          return Response.json({ ok: true, automation });
        }

        if (action === "toggle") {
          const id = String(body?.id ?? "");
          if (!id) return Response.json({ ok: false, error: "Pass id." }, { status: 400 });
          const ok = await setAutomationEnabled(env, userId, id, !!body?.enabled);
          await logActivity(
            env,
            "dm",
            body?.enabled ? "automation_on" : "automation_off",
            id,
            userId,
          );
          return Response.json({ ok, automations: await listAutomations(env, userId) });
        }

        if (action === "delete") {
          const id = String(body?.id ?? "");
          if (!id) return Response.json({ ok: false, error: "Pass id." }, { status: 400 });
          const ok = await deleteAutomation(env, userId, id);
          await logActivity(env, "dm", "automation_deleted", id, userId);
          return Response.json({ ok, automations: await listAutomations(env, userId) });
        }

        if (action === "simulate") {
          const parsed = simulateSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
              { status: 400 },
            );
          }
          const data = parsed.data;
          const seeded = data.ig_user_id ?? null;
          const derivedCommentId =
            data.comment_id ??
            `simc_${(data.username ?? "tester").toLowerCase().replace(/[^a-z0-9_.]/g, "")}_${data.text
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .slice(0, 40)}`;
          const result = await runEngine(env, userId, {
            text: data.text,
            kind: data.kind,
            postId: data.post_id ?? null,
            commentId: data.kind === "comment" ? derivedCommentId : null,
            simulated: true,
            assumeStaleDays: data.assume_stale_days,
            contact: {
              ig_user_id:
                seeded ??
                `sim_${(data.username ?? "tester").toLowerCase().replace(/[^a-z0-9_.]/g, "")}`,
              username: data.username ?? "simulated_tester",
              first_name: data.first_name ?? "Tester",
            },
          });
          await logActivity(
            env,
            "dm",
            result.matched ? "simulated_match" : "simulated_no_match",
            `${data.text.slice(0, 60)}${result.keyword ? ` (${result.keyword})` : ""}`,
            userId,
          );
          return Response.json({ ok: true, result });
        }

        /* ------------------------------------------- S3: handoff, tags, fields */

        if (action === "pause" || action === "resume") {
          const conversationId = String(body?.conversation_id ?? "");
          if (!conversationId) {
            return Response.json({ ok: false, error: "Pass conversation_id." }, { status: 400 });
          }
          const paused = action === "pause";
          const ok = paused
            ? await pauseConversation(
                env,
                userId,
                conversationId,
                String(body?.reason ?? "You took the thread over by hand"),
              )
            : await resumeConversation(env, userId, conversationId);
          await logActivity(
            env,
            "dm",
            paused ? "bot_paused" : "bot_resumed",
            conversationId,
            userId,
          );
          return Response.json({
            ok,
            conversations: await listConversations(env, userId),
          });
        }

        if (action === "cancel-run") {
          const conversationId = String(body?.conversation_id ?? "");
          if (!conversationId) {
            return Response.json({ ok: false, error: "Pass conversation_id." }, { status: 400 });
          }
          const cancelled = await cancelPendingRun(
            env,
            userId,
            conversationId,
            String(body?.reason ?? "cancelled from the Inbox"),
          );
          return Response.json({ ok: true, cancelled, runs: await listPendingRuns(env, userId) });
        }

        if (action === "tag") {
          const contactId = String(body?.contact_id ?? "");
          const name = String(body?.name ?? "").trim();
          if (!contactId || !name) {
            return Response.json(
              { ok: false, error: "Pass contact_id and name." },
              { status: 400 },
            );
          }
          const tagId = await attachTag(env, userId, contactId, name);
          await logActivity(env, "dm", "tag_added", name, userId);
          return Response.json({ ok: !!tagId, tags: await listTags(env, userId) });
        }

        if (action === "untag") {
          const contactId = String(body?.contact_id ?? "");
          const name = String(body?.name ?? "").trim();
          if (!contactId || !name) {
            return Response.json(
              { ok: false, error: "Pass contact_id and name." },
              { status: 400 },
            );
          }
          const ok = await detachTag(env, userId, contactId, name);
          await logActivity(env, "dm", "tag_removed", name, userId);
          return Response.json({ ok, tags: await listTags(env, userId) });
        }

        /** Removing a tag is a delete, not a rename: it disappears from everyone. */
        if (action === "delete-tag") {
          const tagId = String(body?.tag_id ?? "");
          if (!tagId) {
            return Response.json({ ok: false, error: "Pass tag_id." }, { status: 400 });
          }
          const ok = await deleteTag(env, userId, tagId);
          await logActivity(env, "dm", "tag_deleted", tagId, userId);
          return Response.json({ ok, tags: await listTags(env, userId) });
        }

        /**
         * The questions nobody answered — and, with `create: true`, the Ideas they
         * become. Dry by default, because writing to someone's Library is not
         * something a look-around should do.
         */
        if (action === "mine-ideas") {
          const min = Number(body?.min ?? 2) || 2;
          const questions = await mineUnansweredQuestions(env, userId, min);
          if (body?.create !== true) {
            return Response.json({ ok: true, questions, created: [] });
          }
          const created: string[] = [];
          for (const q of questions) {
            const ideaId = await mintIdeaFromQuestion(env, userId, q);
            if (ideaId) created.push(ideaId);
          }
          await logActivity(
            env,
            "dm",
            "ideas_mined",
            `${created.length} idea(s) from repeated questions`,
            userId,
          );
          return Response.json({ ok: true, questions, created });
        }

        /**
         * Two drafts for the owner to send. Nothing is sent by this — a draft is a
         * suggestion, and the honest failure is an error message, not invented text.
         */
        /**
         * Try comments against the rules WITHOUT running the engine: nothing stored,
         * nothing sent. `lines` may be a string (split on newlines) or an array.
         */
        if (action === "test") {
          const raw = Array.isArray(body?.lines)
            ? (body.lines as unknown[]).map((l) => String(l))
            : String(body?.lines ?? "").split("\n");
          const automations = await listAutomations(env, userId);
          return Response.json({ ok: true, results: testComments(automations, raw) });
        }

        /** Label a media id once, so attribution can say what the post was. */
        if (action === "post-ref") {
          const postId = String(body?.post_id ?? "").trim();
          if (!postId) {
            return Response.json({ ok: false, error: "Pass post_id." }, { status: 400 });
          }
          const ok = await setPostRef(env, userId, postId, {
            url: body?.url ?? null,
            label: body?.label ?? null,
          });
          await logActivity(env, "dm", "post_ref_saved", postId, userId);
          return Response.json({ ok, refs: await listPostRefs(env, userId) });
        }

        if (action === "drafts") {
          const conversationId = String(body?.conversation_id ?? "");
          if (!conversationId) {
            return Response.json({ ok: false, error: "Pass conversation_id." }, { status: 400 });
          }
          const out = await draftReplies(env, userId, conversationId);
          if ("error" in out) return Response.json({ ok: false, error: out.error });
          await logActivity(env, "dm", "drafts_written", `${out.drafts.length} draft(s)`, userId);
          return Response.json({ ok: true, drafts: out.drafts });
        }



        if (action === "field") {
          const contactId = String(body?.contact_id ?? "");
          const key = String(body?.key ?? "").trim();
          if (!contactId || !key) {
            return Response.json({ ok: false, error: "Pass contact_id and key." }, { status: 400 });
          }
          const ok = await setContactField(env, userId, contactId, key, String(body?.value ?? ""));
          return Response.json({ ok });
        }

        /**
         * Run the follow-ups that are due right now. The cron does this on its own
         * schedule; the button exists so the ladder can be proved without waiting
         * four hours, and it defaults to a dry run so a test can never land in a
         * real person's inbox.
         */
        if (action === "drain") {
          const live = body?.live === true;
          const report = await drainDueRuns(env, () => Promise.resolve(null), {
            simulated: !live,
            limit: 25,
          });
          await logActivity(
            env,
            "dm",
            live ? "followups_drained" : "followups_drained_dry",
            `${report.due} due · ${report.resumed} sent · ${report.cancelled} cancelled · ${report.failed} failed`,
            userId,
          );
          return Response.json({ ok: true, ...report, simulated: !live });
        }

        return Response.json(
          {
            ok: false,
            error:
              "Unknown action. Use save, toggle, delete, simulate, pause, resume, tag, untag, delete-tag, field, drain, cancel-run, mine-ideas, drafts or attribution.",
          },
          { status: 400 },
        );
      },
    },
  },
});
