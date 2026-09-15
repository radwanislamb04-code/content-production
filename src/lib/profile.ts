/**
 * Which profile the UI is currently looking at.
 *
 * Switching is a client-side choice sent as `x-profile-id` on every API call; the
 * server honours it only for a user it knows (see `currentUserId` in lib/users.ts).
 * Living in localStorage means the choice survives a reload, and staying out of the
 * URL means a switched view can never be mistaken for the real identity.
 *
 * Guarded for SSR: this module is imported by the api client, which also runs
 * during server rendering where `localStorage` does not exist.
 */

const KEY = "aios.profile";

export function activeProfile(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function setActiveProfile(id: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (!id) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* private mode — the switch simply will not persist */
  }
}

/** Header to attach to every API request ({}, or the chosen profile). */
export function profileHeader(): Record<string, string> {
  const id = activeProfile();
  return id ? { "x-profile-id": id } : {};
}

/**
 * The browser is showing one profile while the signed-in identity is another.
 * The shell shows a banner in this case so nobody edits the wrong workspace.
 */
export function isViewingAnother(identityId: string | null): boolean {
  const active = activeProfile();
  return Boolean(active && identityId && active !== identityId);
}
