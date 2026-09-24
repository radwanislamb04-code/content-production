/**
 * Copying text, with a fallback for the case the async Clipboard API refuses.
 *
 * `navigator.clipboard.writeText` rejects with `NotAllowedError` whenever the document is
 * not focused — which is exactly what happens when the click comes from somewhere other
 * than the user's own pointer, and it is why a copy button can answer "Could not copy" on
 * a text the user can see. The legacy `execCommand("copy")` path still works in that
 * situation, so it is tried second rather than not at all.
 *
 * Returns whether the text made it to the clipboard, so callers can tell the truth in a
 * toast instead of assuming success.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand?.("copy") ?? false;
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
