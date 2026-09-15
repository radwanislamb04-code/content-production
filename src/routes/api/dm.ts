import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getEnv } from "../../lib/settings";
import { currentUserId } from "../../lib/users";
import { logActivity } from "../../lib/activity";
import {
  deleteAutomation,
  dmAnalytics,
  getAutomation,
  listAutomations,
  listContacts,
  listConversations,
  listMessages,
  runEngine,
  saveAutomation,
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
  match_mode: z.enum(["contains", "exact", "any_word"]).default("contains"),
  post_scope: z.enum(["any", "post"]).default("any"),
  post_id: z.string().trim().max(120).nullish(),
  public_reply: z.string().trim().max(900).nullish(),
  dm_message: z.string().trim().max(900).nullish(),
  dm_button_label: z.string().trim().max(60).nullish(),
  dm_button_url: z.string().trim().max(300).nullish(),
  counter_enabled: z.boolean().optional(),
  daily_cap: z.number().int().min(0).max(500).optional(),
  goal: z.string().trim().max(60).nullish(),
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
        return Response.json(
          { ok: false, error: "Unknown action. Use automations, inbox, conversation, contacts or analytics." },
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

        return Response.json(
          { ok: false, error: "Unknown action. Use save, toggle, delete or simulate." },
          { status: 400 },
        );
      },
    },
  },
});
