/**
 * Shared reading of a daily brief.
 *
 * Both the Daily Brief page and the Brief History page render the same AI-written
 * text, so the splitter and the formatter live here instead of being copied.
 */

import { currentTimeZone } from "@/lib/appearance";
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

// The splitter moved to `src/lib/brief-parse.ts` so it can be tested without React,
// and so the heading rules live in one place. Imported for local use *and* re-exported,
// because every other caller already imports from this module.
import { BRIEF_HEADINGS, briefPreview, parseBrief } from "@/lib/brief-parse";
export { BRIEF_HEADINGS, briefPreview, parseBrief };

export function clock(ts: number): string {
  const timeZone = currentTimeZone();
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return "—";
  }
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
            <div className="mb-2 text-xs uppercase tracking-wide text-mute">{s.title}</div>
            {s.items.length === 0 ? (
              <p className="text-sm text-mute">No data yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {s.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-mute">•</span>
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
