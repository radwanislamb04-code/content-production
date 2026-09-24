/**
 * Reading a Daily Brief, without a React dependency — so the splitter can be tested
 * against a real brief instead of against a component.
 *
 * ## Why this exists
 *
 * The brief is written by an AI in plain text, and the page splits it into named
 * sections. The splitter matched only a *bare* heading — `TODAY'S PICKS` alone on a
 * line — but the writer sometimes answers with a bullet list, heading included:
 *
 *     - TODAY'S PICKS
 *     - Google Trends Bangladesh: weather is #1 at 20K …
 *
 * Every line then looked like content, no section was ever opened, and the whole brief
 * collapsed into one paragraph of prose. The page still looked "fine" (the words were
 * all there), which is why it survived: nothing errored, the sections simply stopped
 * existing — and so did everything the UI hangs off a section, like a per-item action.
 *
 * So headings are recognised with their markdown decoration stripped, whether the
 * writer used bullets, bold or a colon.
 */

export const BRIEF_HEADINGS = [
  "TODAY'S PICKS",
  "TRENDING NOW",
  "COMPETITOR WATCH",
  "HOOK IDEAS",
  "ACTION ITEMS",
];

/**
 * A line reduced to what it says: leading bullet/quote markers, bold/italic/code
 * markers, and a trailing colon or dash all removed. Only the *shape* is normalised —
 * interior punctuation (an apostrophe, a hyphen inside a word) is left alone.
 */
export function bareHeading(line: string): string {
  return String(line ?? "")
    .replace(/^[\s>*•·\-–—]+/, "")
    .replace(/[*_`#]/g, "")
    .replace(/[:\s\-–—]+$/, "")
    .trim()
    .toUpperCase();
}

/** The item text: markdown bullets and stray emphasis stripped, nothing else changed. */
export function cleanItem(line: string): string {
  return String(line ?? "")
    .replace(/^[\s>*•·\-–—]+/, "")
    .replace(/\*\*/g, "")
    .replace(/^_+|_+$/g, "")
    .trim();
}

export type ParsedBrief = {
  intro: string[];
  sections: { title: string; items: string[] }[];
};

/** Split the AI's plain-text brief into its named sections. */
export function parseBrief(markdown: string): ParsedBrief {
  const sections: { title: string; items: string[] }[] = [];
  const intro: string[] = [];
  let current: { title: string; items: string[] } | null = null;

  for (const raw of String(markdown ?? "").split("\n")) {
    if (!raw.trim()) continue;
    const bare = bareHeading(raw);
    const hit = BRIEF_HEADINGS.find((h) => bare === h);
    if (hit) {
      current = { title: hit, items: [] };
      sections.push(current);
      continue;
    }
    const clean = cleanItem(raw);
    if (!clean) continue;
    if (current) current.items.push(clean);
    else intro.push(clean);
  }

  return { intro, sections };
}

/** One readable line describing a brief, for the history list. */
export function briefPreview(markdown: string, max = 110): string {
  const { intro, sections } = parseBrief(markdown);
  const candidate =
    intro[0] ??
    sections.flatMap((s) => s.items)[0] ??
    String(markdown ?? "")
      .replace(/\s+/g, " ")
      .trim();
  return candidate.length > max ? `${candidate.slice(0, max - 1)}…` : candidate;
}
