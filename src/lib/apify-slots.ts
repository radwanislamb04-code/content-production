/**
 * Choosing between Apify slots — and what to do when one runs out.
 *
 * ## Why this exists
 *
 * `readApifyToken` returns the first slot whose `job` matches, or the first slot at all.
 * It never looks at how much of a slot's allowance is left, and nothing anywhere tried a
 * second slot. So when the owner's first slot spent its $10, every scrape — cron included —
 * kept calling Apify with that same dead token, got `402 Payment Required`, stored zero
 * posts and reported success. A second slot with $4.49 sitting in it was never touched.
 *
 * This module is the missing half: an ordered candidate list, and the rule for when a
 * failure means "try the next token" rather than "give up".
 */
import { type ApifySlot } from "./settings";

export type SlotCandidate = {
  token: string;
  label: string;
  job: string;
};

/**
 * Every usable slot, best first: the ones meant for this job, then the rest.
 *
 * A slot is never dropped for having a different `job` — with a single-job config (or a
 * slot whose job was typed differently) dropping it would leave nowhere to fall back to,
 * which is exactly the situation this fixes.
 */
export function orderSlots(slots: ApifySlot[] | undefined | null, job: string): SlotCandidate[] {
  const usable = (Array.isArray(slots) ? slots : []).filter(
    (s) => typeof s?.token === "string" && s.token.trim(),
  );
  const ranked = [
    ...usable.filter((s) => s.job === job),
    ...usable.filter((s) => s.job !== job),
  ];
  return ranked.map((s) => ({
    token: s.token.trim(),
    label: s.label?.trim() || `slot ${s.id}`,
    job: s.job ?? "",
  }));
}

/**
 * Does this failure mean the token is out of allowance (or not allowed), rather than the
 * request being wrong?
 *
 * 402 is Apify's "no remaining monthly usage" answer, 403 its "this token may not do
 * that". Both are worth another slot; a 400 (bad input) or a 500 (their problem) is not
 * a reason to spend a second token.
 */
export function isAllowanceFailure(status: number | null | undefined): boolean {
  return status === 402 || status === 403;
}

/**
 * The step's own summary line and verdict, from what the handles produced.
 *
 * Split out so the "a run that brought back nothing must not look healthy" rule can be
 * tested without scraping anything: a step is only ok when no handle failed. Zero posts
 * with no error is a real answer (a quiet account) and stays ok.
 */
export function scrapeStepOutcome(
  notes: string[],
  failures: string[],
  slotsUsed: Iterable<string>,
): { detail: string; ok: boolean } {
  const used = [...slotsUsed];
  const slotNote = used.length ? ` via ${used.join(", ")}` : "";
  return {
    detail: `${notes.join(" · ")}${failures.length ? ` · FAILED: ${failures.join(" · ")}` : ""}${slotNote}`,
    ok: failures.length === 0,
  };
}
