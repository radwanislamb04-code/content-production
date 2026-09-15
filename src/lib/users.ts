/**
 * Who is asking.
 *
 * Cloudflare Access authenticates every visitor to this Worker and injects
 * `Cf-Access-Authenticated-User-Email`, so there are no passwords or sessions to
 * build: the email in that header is already verified by Access. It is matched
 * against the `users` table, and an email that is not in there gets a 403 — it
 * must NEVER fall back to the owner, or an uninvited visitor would read the
 * owner's content.
 *
 * One deliberate exception: a request with **no** email header at all is a
 * service-token call (the owner's own scripts and the agent's verifications) or a
 * local dev request, and acts as the owner. Access fronts the whole domain, so a
 * browser visitor can never reach this state.
 */

import { getEnv } from "./settings";

/** Fixed so it can be grepped; created by migrations/009_multi_user.sql. */
export const OWNER_ID = "usr_radwanislamb04";

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "member";
  status: string;
};

const SELECT_USER = "id, email, name, role, status FROM users";

async function loadById(env: any, id: string): Promise<AppUser | null> {
  try {
    const row = await env.DB.prepare(`SELECT ${SELECT_USER} WHERE id = ?`)
      .bind(id)
      .first();
    return (row as AppUser) ?? null;
  } catch {
    return null;
  }
}

/**
 * The user behind this request, or null when the email is not invited (or there
 * is no database at all).
 */
export async function currentUser(
  request: Request,
  context: any,
): Promise<AppUser | null> {
  const env = getEnv(request, context);
  if (!env?.DB) return null;

  const email = (
    request.headers.get("cf-access-authenticated-user-email") ?? ""
  )
    .trim()
    .toLowerCase();

  if (!email) return loadById(env, OWNER_ID);

  try {
    const row = await env.DB.prepare(
      `SELECT ${SELECT_USER} WHERE lower(email) = ?`,
    )
      .bind(email)
      .first();
    return (row as AppUser) ?? null;
  } catch {
    return null;
  }
}

/**
 * The user id to scope a query by — the common case, so routes can stay short.
 * Falls back to the owner id only when there is no identity at all (see above).
 */
export async function currentUserId(
  request: Request,
  context: any,
): Promise<string> {
  const user = await currentUser(request, context);
  return user?.id ?? OWNER_ID;
}

/**
 * Use in a route when the caller must be a known user:
 *   const user = await requireUser(request, context);
 *   if (user instanceof Response) return user;
 */
export async function requireUser(
  request: Request,
  context: any,
): Promise<AppUser | Response> {
  const user = await currentUser(request, context);
  if (user) return user;
  const email = (
    request.headers.get("cf-access-authenticated-user-email") ?? ""
  ).trim();
  return Response.json(
    {
      ok: false,
      error: email
        ? `${email} has not been invited to this workspace.`
        : "Could not identify the signed-in user.",
      invited: false,
    },
    { status: 403 },
  );
}

export function isOwner(user: AppUser): boolean {
  return user.role === "owner";
}
