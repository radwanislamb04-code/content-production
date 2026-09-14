/**
 * Shared reading of a daily brief.
 *
 * Both the Daily Brief page and the Brief History page render the same AI-written
 * text, so the splitter and the formatter live here instead of being copied.
 */

import { Card } from "./ui";

export type Brief = {
  date: string;
  generated_at: number;
  markdown: string;
  context?: {
    trends?: { title: string; metric: string }[];
    youtube?: { title: string; metric: string }[];
    viral?: any[];
    picks?: any[];
  };
};

export const BRIEF_HEADINGS = [
  "TODAY'S PICKS",
  "TRENDING NOW",
  "COMPETITOR WATCH",
  "HOOK IDEAS",
  "ACTION ITEMS",
];

/** Split the AI's plain-text brief into its named sections. */
export function parseBrief(markdown: string) {
  const sections: { title: string; items: string[] }[] = [];
  const intro: string[] = [];
  let current: { title: string; items: string[] } | null = null;

  for (const raw of String(markdown ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bare = line
      .replace(/[*#:]+$/g, "")
      .trim()
      .toUpperCase();
    const hit = BRIEF_HEADINGS.find((h) => bare === h || bare === `${h}:`);
    if (hit) {
      current = { title: hit, items: [] };
      sections.push(current);
      continue;
    }
    const clean = line.replace(/^[-•*]\s*/, "").trim();
    if (current) current.items.push(clean);
    else if (clean) intro.push(clean);
  }
  return { intro, sections };
}

export function clock(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
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
  return candidate.replace(/^[-•*]\s*/, "").slice(0, max);
}

/** The brief body: intro paragraph + one card per named section. */
export function BriefBody({ brief }: { brief: Brief }) {
  const parsed = parseBrief(brief.markdown);
  return (
    <>
      {parsed.intro.length ? <Card className="p-4 text-sm">{parsed.intro.join(" ")}</Card> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {parsed.sections.map((s) => (
          <Card key={s.title} className="p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted">{s.title}</div>
            {s.items.length === 0 ? (
              <p className="text-sm text-muted">No data yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {s.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-muted">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
