import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { logActivityFor } from "../../lib/activity";
import { getEnv } from "../../lib/settings";
import { currentUser, effectiveUser, isOwner } from "../../lib/users";

/**
 * /api/users — who may use this Content OS.
 *
 * GET  → the users list (backs the profile menu's "Switch to" and the users panel)
 * POST → add a user by email
 *
 * Adding someone takes TWO steps and only one of them can happen here: this row
 * gives them a workspace, while Cloudflare Access — the door in front of the whole
 * domain — has to allow their email before they can even reach the login page. So
 * the response carries the exact email to paste, and the UI shows it as a copy card
 * rather than pretending the job is done.
 */

const createSchema = z.object({
  email: z.string().trim().email("That does not look like an email address.").max(200),
  name: z.string().trim().max(80).optional(),
});

export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        // Owner-only. This listed every user's email, name and role to anyone who could
        // reach the route — the POST below was already gated, the read was not.
        //
        // `effectiveUser`, not `currentUser`: the latter ignores a switched profile, so
        // the first version of this gate inspected the owner's row even when the caller
        // had switched to a member profile. Verified by calling it with a member profile
        // and watching it answer 200 with the full list.
        const me = await effectiveUser(request, context);
        if (!me || !isOwner(me)) {
          return Response.json(
            { ok: false, error: "Only the owner can list users" },
            { status: 403 },
          );
        }
        if (!env?.DB) return Response.json({ ok: true, users: [], me: null });

        const { results } = await env.DB.prepare(
          "SELECT id, email, name, role, status, created_at, onboarded_at FROM users ORDER BY created_at ASC",
        ).all();

        // Content counts make the list useful at a glance without opening each
        // profile; they are only ever the caller's own when asked for.
        const users = await Promise.all(
          ((results ?? []) as any[]).map(async (u) => {
            let items = 0;
            try {
              const row = await env.DB.prepare(
                "SELECT COUNT(*) AS n FROM library WHERE user_id = ?",
              )
                .bind(u.id)
                .first();
              items = row?.n ?? 0;
            } catch {
              /* the count is decoration, never a reason to fail */
            }
            return {
              id: u.id,
              email: u.email,
              name: u.name,
              role: u.role,
              status: u.status,
              createdAt: u.created_at,
              onboardedAt: u.onboarded_at,
              items,
            };
          }),
        );

        return Response.json({
          ok: true,
          me: me ? { id: me.id, email: me.email, role: me.role } : null,
          canSwitch: true,
          users,
        });
      },

      POST: async ({ request, context }) => {
        const env = getEnv(request, context);
        const me = await currentUser(request, context);
        if (!env?.DB) {
          return Response.json(
            { ok: false, error: "No database binding available." },
            { status: 500 },
          );
        }
        if (!me || !isOwner(me)) {
          return Response.json(
            { ok: false, error: "Only the owner can add users." },
            { status: 403 },
          );
        }

        const body = await request.json().catch(() => null);
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
            { status: 400 },
          );
        }

        const email = parsed.data.email.toLowerCase();
        const existing = await env.DB.prepare(
          "SELECT id FROM users WHERE lower(email) = ?",
        )
          .bind(email)
          .first();
        if (existing) {
          return Response.json(
            { ok: false, error: `${email} is already a user.` },
            { status: 409 },
          );
        }

        const id = `usr_${crypto.randomUUID().slice(0, 8)}`;
        await env.DB.prepare(
          "INSERT INTO users (id, email, name, role, status, created_at) VALUES (?, ?, ?, 'member', 'invited', ?)",
        )
          .bind(id, email, parsed.data.name ?? null, Date.now())
          .run();

        await logActivityFor(
          request,
          context,
          "users",
          "added",
          `${email} — workspace created; still needs their email in the Cloudflare Access policy`,
        );

        return Response.json(
          {
            ok: true,
            user: { id, email, name: parsed.data.name ?? null, role: "member", status: "invited" },
            // The guided half of the flow (the owner chose "খ+"):
            next: {
              step: "Allow this email in Cloudflare Access",
              email,
              url: "https://one.dash.cloudflare.com/?to=/:account/access/apps",
              detail:
                "Access → Applications → “Content OS” → edit the policy → add this email. Without it they cannot reach the login page at all.",
            },
          },
          { status: 201 },
        );
      },
    },
  },
});
