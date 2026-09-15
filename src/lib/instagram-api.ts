/**
 * Content OS — the Instagram Graph calls that actually send something (M2).
 *
 * The engine decides *whether* a message may be sent; this file is only the wire.
 * Three endpoints, one per permission:
 *
 *   public reply   POST /{ig-comment-id}/replies?message=…      always allowed
 *   private reply  POST /{ig-user-id}/messages                  one per comment
 *                  { recipient: { comment_id } }
 *   direct message POST /{ig-user-id}/messages                  inside 24h
 *                  { recipient: { id: <IGSID> } }
 *
 * These calls cannot be exercised without a real connected account, so every one of
 * them reports the API's own error text — the UI shows that instead of a generic
 * failure, and nothing here pretends a send succeeded.
 */

// Defined here rather than imported from ./channels: channels imports these send
// helpers, and a module cycle that only works by luck is worse than twelve
// duplicated characters.
const GRAPH = "https://graph.instagram.com";

const API_VERSION = "v21.0";

export type SendResult = { ok: boolean; messageId?: string; error?: string };

async function post(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<SendResult> {
  try {
    const res = await fetch(`${GRAPH}/${API_VERSION}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.error) {
      const message =
        json?.error?.message ?? json?.error_message ?? `Instagram returned HTTP ${res.status}`;
      return { ok: false, error: String(message).slice(0, 300) };
    }
    return { ok: true, messageId: json?.id ? String(json.id) : undefined };
  } catch (err: any) {
    return { ok: false, error: `Instagram request failed: ${err?.message ?? String(err)}` };
  }
}

/** The reply everyone can see, attached to the comment (comment-scoped endpoint). */
export async function publicReply(
  token: string,
  _igUserId: string,
  commentId: string,
  message: string,
): Promise<SendResult> {
  return post(`/${commentId}/replies`, token, { message });
}

/**
 * The DM that a comment unlocks. Meta keys it to the comment id, which is why it
 * works for somebody who has not opened a conversation.
 */
export async function privateReply(
  token: string,
  igUserId: string,
  commentId: string,
  message: string,
): Promise<SendResult> {
  return post(`/${igUserId}/messages`, token, {
    recipient: { comment_id: commentId },
    message: { text: message },
  });
}

/** A normal DM — only inside the 24-hour conversation window. */
export async function sendDm(
  token: string,
  igUserId: string,
  igsid: string,
  message: string,
): Promise<SendResult> {
  return post(`/${igUserId}/messages`, token, {
    recipient: { id: igsid },
    message: { text: message },
  });
}

/** Which users have the webhook fields switched on. Self-healing reads this. */
export async function subscribedApps(
  token: string,
  igUserId: string,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(
      `${GRAPH}/${API_VERSION}/${igUserId}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
    );
    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.error) {
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: json?.data ?? null };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/** Subscribe this account to comments + messages. Idempotent on Meta's side. */
export async function subscribeFields(
  token: string,
  igUserId: string,
  fields: string[],
): Promise<{ ok: boolean; error?: string }> {
  const result = await post(`/${igUserId}/subscribed_apps`, token, {
    subscribed_fields: fields.join(","),
  });
  return { ok: result.ok, error: result.error };
}
