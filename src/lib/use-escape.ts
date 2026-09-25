import { useEffect } from "react";

/**
 * Close a hand-rolled dialog on Escape.
 *
 * The shared `Modal` has always done this; the dialogs written by hand (the Library
 * detail, the Resources add-site sheet) did not, so on a desktop the only way out was
 * the backdrop, and on a phone — where there is no Escape key — the backdrop was the
 * only way at all. Wiring the same hook keeps the two paths honest.
 */
export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}
