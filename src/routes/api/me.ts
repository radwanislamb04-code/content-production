import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "../../lib/settings";
import {
  OWNER_ID,
  UNINVITED_ID,
  currentUser,
  emailFromAssertion,
} from "../../lib/users";

/**
 * GET /api/me — who the Worker thinks is asking.
 *
 * Backs the profile menu (name, initials, whether a switch is allowed) and is the
 * quickest way to see what identity a request actually carries — Cloudflare Access
 * is the only thing that can set `Cf-Access-Authenticated-User-Email`, so this is
 * the honest answer to "which user am I right now?".
 *
 * `headers.masked` lists only whether each identity header was present, never its
 * value, so nothing sensitive leaks. `receivedUserHeader` reports the presence of
 * an identity header on this request.
 */

export const Route = createFileRoute("/api/me")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const env = getEnv(request, context);
        const rawEmail = request.headers.get("cf-access-authenticated-user-email");
        const assertionEmail = emailFromAssertion(request);
        const jwt = request.headers.get("cf-access-jwt-assertion");
        const user = await currentUser(request, context);

        return Response.json({
          ok: true,
          // The identity the app will scope every query by.
          userId:
            user?.id ??
            (rawEmail || assertionEmail ? UNINVITED_ID : OWNER_ID),
          user: user
            ? {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                status: user.status,
              }
            : null,
          invited: Boolean(user),
          // Diagnostics: did an identity header survive to the Worker?
          identityHeaderPresent: Boolean(rawEmail),
          // Access strips a client-supplied email header on service-token calls,
          // but the signed assertion still arrives — this is what it carries.
          assertionEmail,
          accessJwtPresent: Boolean(jwt),
          source: rawEmail
            ? "access-email-header"
            : assertionEmail
              ? "access-jwt-assertion"
              : "no-identity (service token or local dev → owner)",
          usersInTable: env?.DB
            ? ((
                await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()
              )?.n ?? null)
            : null,
        });
      },
    },
  },
});
