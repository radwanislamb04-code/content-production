import { useCallback, useEffect, useState } from "react";
import { getAppearance } from "./appearance";

/**
 * "Is the sidebar showing?" — one answer for the whole shell.
 *
 * The sidebar, the header and the page container all have to agree, or collapsing
 * leaves a 200px hole in the layout. They cannot share React state (the header is
 * a sibling of the sidebar, not a child), so the answer lives in localStorage and
 * a window event keeps every listener in sync — including a second browser tab.
 *
 * `getAppearance().sidebarDefault` (Settings → Appearance) is the first-paint
 * default; once you press the toggle yourself, that choice wins from then on.
 */

const KEY = "aios.sidebar.pinned";
export const SIDEBAR_EVENT = "aios:sidebar";

export function readSidebarOpen(): boolean {
  if (typeof window === "undefined") {
    return getAppearance().sidebarDefault !== "collapsed";
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === "open") return true;
    if (raw === "closed") return false;
  } catch {
    /* storage unavailable — fall through to the appearance default */
  }
  return getAppearance().sidebarDefault !== "collapsed";
}

export function writeSidebarOpen(open: boolean): void {
  try {
    window.localStorage.setItem(KEY, open ? "open" : "closed");
  } catch {
    /* storage unavailable — the event below still updates this tab */
  }
}

/** Change the sidebar from anywhere (the header, the palette, a keyboard shortcut). */
export function toggleSidebar(next?: boolean): void {
  const value = next ?? !readSidebarOpen();
  writeSidebarOpen(value);
  try {
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  } catch {
    /* no window — nothing to notify */
  }
}

export function useSidebarOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(readSidebarOpen());
    const sync = () => setOpen(readSidebarOpen());
    window.addEventListener(SIDEBAR_EVENT, sync);
    // Another tab may have changed it too.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SIDEBAR_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: boolean) => toggleSidebar(next), []);
  return [open, update];
}
