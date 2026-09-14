/**
 * One-shot hand-off from Templates to Video Analyzer.
 *
 * "Use Template →" navigates to another route, so the chosen template travels in
 * a module variable rather than the URL: the analyzer claims it once on mount and
 * it is then cleared, so it can never leak into a later visit.
 */

let pending: string | null = null;

export function setPendingTemplate(text: string): void {
  pending = text;
}

/** Returns the pending template text once, then forgets it. */
export function takePendingTemplate(): string | null {
  const value = pending;
  pending = null;
  return value;
}
