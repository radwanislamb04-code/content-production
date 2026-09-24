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

import { OWNER_ID } from "./owner";

export { OWNER_ID };

/**
 * A real id that belongs to no row: what an uninvited (but Access-authenticated)
 * email is scoped to. Chosen over throwing so that a route's read path simply
 * returns empty instead of the whole workspace.
 */
export const UNINVITED_ID = "usr_uninvited";

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "member";
  status: string;
};

const SELECT_USER = "id, email, name, role, status FROM users";

/**
 * The email inside Access's `Cf-Access-Jwt-Assertion`.
 *
 * Access always forwards its signed assertion, but it strips a client-supplied
 * `Cf-Access-Authenticated-User-Email` on service-token requests — so reading the
 * assertion is what makes identity survive either way. Only the payload is read
 * here (no signature check); the assertion is trustworthy because the domain is
 * served exclusively through Access. Verifying the signature against the team's
 * JWKS is the hardened upgrade, noted in the handoff.
 */
function emailFromAssertion(request: Request): string | null {
  const jwt = request.headers.get("cf-access-jwt-assertion");
  if (!jwt) return null;
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/")),
    ) as Record<string, unknown>;
    const email = typeof json?.email === "string" ? json.email : null;
    return email ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

export { emailFromAssertion };

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

  const email =
    (request.headers.get("cf-access-authenticated-user-email") ?? "")
      .trim()
      .toLowerCase() || emailFromAssertion(request);

  // No identity at all = a service-token or local-dev call: the owner's own
  // scripts and the agent's verifications rely on this.
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
  // A switched profile wins over the signed-in identity, but only if it exists.
  const switched = await requestedProfileId(request, context);
  if (switched) return switched;

  const email =
    (request.headers.get("cf-access-authenticated-user-email") ?? "").trim() ||
    emailFromAssertion(request) ||
    "";
  const user = await currentUser(request, context);
  if (user) return user.id;

  // Fail closed. An email that is NOT in `users` must never fall back to the
  // owner — it gets a sentinel id that matches no row, so every query returns
  // nothing and every write is attributed to nobody. (Only a request with no
  // email at all — a service token or local dev — acts as the owner, which is
  // the case our own scripts and verifications rely on.)
  if (email) return UNINVITED_ID;
  return OWNER_ID;
}

/**
 * The user row this request is actually acting as: the switched profile when one is set,
 * otherwise the signed-in identity.
 *
 * Use this for any "may I?" check. `currentUser` alone answers a different question — it
 * ignores `x-profile-id`, so a caller who switched to a member profile still comes back as
 * the owner. That is exactly how the first version of the `/api/users` gate let a member
 * through: the row it inspected was the owner's.
 */
export async function effectiveUser(
  request: Request,
  context: any,
): Promise<AppUser | null> {
  const switched = await requestedProfileId(request, context);
  if (switched) {
    const env = getEnv(request, context);
    return loadById(env, switched);
  }
  return currentUser(request, context);
}

/**
 * The profile a request asks to act as, if that profile exists.
 *
 * Switching is a deliberate choice by the owner: everyone signed in may look at any
 * profile (a personal machine). The header is only ever a *request* — the target must
 * exist in `users`, so a made-up id resolves to nothing and the caller's own identity
 * is used instead.
 */
export async function requestedProfileId(
  request: Request,
  context: any,
): Promise<string | null> {
  const wanted = (request.headers.get("x-profile-id") ?? "").trim();
  if (!wanted) return null;
  const env = getEnv(request, context);
  const row = await loadById(env, wanted);
  return row ? row.id : null;
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
