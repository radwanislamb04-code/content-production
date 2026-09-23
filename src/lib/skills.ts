/**
 * Content OS — the script & storyboard skills, read from the files the owner edits.
 *
 * The three skills live as markdown in `.claude/skills/` and are pulled in at build time
 * with Vite's `?raw`, so **editing the markdown changes what the models are told**. Before
 * this, the same text was pasted into four route files, and it had already drifted: the
 * storyboard copy was missing `## OUTPUT FORMAT`, the video copy `## Output structure (per
 * shot)`. Nothing failed — the copies just quietly stopped matching the source.
 *
 * Those two omissions are deliberate and preserved. Both routes append their own
 * JSON-only output override, and the markdown's prose output format fights with it. The
 * strip matches on the exact heading, so if the owner renames or reorders a section and
 * the heading disappears, the section is KEPT rather than silently dropped.
 */
import storyboardMarkdown from "../../.claude/skills/production-ready-storyboard-prompts.md?raw";
import videoPromptMarkdown from "../../.claude/skills/script-aware-video-generation-prompts.md?raw";
import viralHookMarkdown from "../../.claude/skills/viral-hook-script-writer.md?raw";

/** Drop `heading` and its body, up to (not including) the next `## ` heading. */
function dropSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return markdown;
  const next = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  const end = next < 0 ? lines.length : next;
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

/**
 * Hook & script writing — the whole file, unmodified.
 *
 * Used by both `hook-script-writer` (idea → script) and `video-analyzer` (a competitor's
 * transcript → a stronger version of it). Same skill, two entry points — which is exactly
 * why it must not be stored twice.
 */
export const VIRAL_HOOK_SCRIPT_WRITER_SKILL = viralHookMarkdown.trim();

/** Storyboard shot lists — markdown minus its prose OUTPUT FORMAT section. */
export const PRODUCTION_READY_STORYBOARD_PROMPTS_SKILL = dropSection(
  storyboardMarkdown,
  "## OUTPUT FORMAT",
).trim();

/** Shot-by-shot video prompts — markdown minus its Output structure section. */
export const SCRIPT_AWARE_VIDEO_GENERATION_PROMPTS_SKILL = dropSection(
  videoPromptMarkdown,
  "## Output structure (per shot)",
).trim();
