/**
 * Appearance preferences.
 *
 * Stored in the `workspace` table under `appearance` so they follow the account
 * across devices, with a localStorage mirror so the theme paints correctly on
 * the very first frame (no dark flash before the request lands).
 *
 * Every option here is actually read somewhere — a control that does nothing is
 * worse than no control, so nothing is offered unless it visibly applies:
 *   theme            → `.dark` on <html>; both palettes live in styles.css
 *   sidebarDefault   → Sidebar's initial open/closed groups
 *   thumbnailFormat  → Thumbnail Studio's starting format
 *   timeDisplay      → the clock() formatter used by Daily Brief / Brief History
 *   reduceMotion     → [data-reduce-motion] rules in styles.css
 */

export type ThemeMode = "dark" | "light" | "system";
export type SidebarDefault = "expanded" | "collapsed";
export type ThumbnailFormat = "yt" | "reels";
export type TimeDisplay = "dhaka" | "local";

export type Appearance = {
  theme: ThemeMode;
  sidebarDefault: SidebarDefault;
  thumbnailFormat: ThumbnailFormat;
  timeDisplay: TimeDisplay;
  reduceMotion: boolean;
};

export const APPEARANCE_DEFAULTS: Appearance = {
  theme: "dark",
  sidebarDefault: "expanded",
  thumbnailFormat: "yt",
  timeDisplay: "dhaka",
  reduceMotion: false,
};

const LS_KEY = "aios.appearance";

let current: Appearance = { ...APPEARANCE_DEFAULTS };
let listening = false;

function coerce(raw: any): Appearance {
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(String(v)) ? (String(v) as T) : fallback;
  return {
    theme: pick(raw?.theme, ["dark", "light", "system"] as const, "dark"),
    sidebarDefault: pick(
      raw?.sidebarDefault,
      ["expanded", "collapsed"] as const,
      "expanded",
    ),
    thumbnailFormat: pick(
      raw?.thumbnailFormat,
      ["yt", "reels"] as const,
      "yt",
    ),
    timeDisplay: pick(raw?.timeDisplay, ["dhaka", "local"] as const, "dhaka"),
    reduceMotion: raw?.reduceMotion === true,
  };
}

export function getAppearance(): Appearance {
  return current;
}

/** Timezone for displayed clocks — `undefined` means the browser's own. */
export function currentTimeZone(): string | undefined {
  return current.timeDisplay === "dhaka" ? "Asia/Dhaka" : undefined;
}

function isDark(theme: ThemeMode): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Paint the preferences onto the document. Safe to call in SSR (no-op there). */
export function applyAppearance(next: Appearance): void {
  current = next;
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = isDark(next.theme);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.reduceMotion = String(next.reduceMotion);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* storage disabled — the server copy still applies next load */
  }
}

/** Apply the mirror immediately, before any network request. */
export function hydrateAppearance(): Appearance {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) current = coerce(JSON.parse(raw));
    } catch {
      /* keep defaults */
    }
  }
  applyAppearance(current);
  if (!listening && typeof window !== "undefined") {
    listening = true;
    // "System" must react when the OS flips.
    try {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
          if (current.theme === "system") applyAppearance(current);
        });
    } catch {
      /* older browsers — the setting simply needs a reload */
    }
  }
  return current;
}

export async function loadAppearance(): Promise<Appearance> {
  try {
    const res = await fetch("/api/appearance");
    const json = await res.json();
    if (json?.ok && json.appearance) {
      applyAppearance(coerce(json.appearance));
      return current;
    }
  } catch {
    /* offline — the localStorage mirror is already applied */
  }
  return current;
}

export async function saveAppearance(
  patch: Partial<Appearance>,
): Promise<{ ok: boolean; appearance: Appearance; error?: string }> {
  const optimistic = coerce({ ...current, ...patch });
  applyAppearance(optimistic);
  try {
    const res = await fetch("/api/appearance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (json?.ok && json.appearance) {
      applyAppearance(coerce(json.appearance));
      return { ok: true, appearance: current };
    }
    return {
      ok: false,
      appearance: current,
      error: json?.error ?? "Could not save appearance",
    };
  } catch (err: any) {
    return {
      ok: false,
      appearance: current,
      error: err?.message ?? "Could not save appearance",
    };
  }
}
