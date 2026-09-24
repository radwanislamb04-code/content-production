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

import { OWNER_ID } from "./owner";
import { readCreatorProfile, type CreatorProfile } from "./settings";

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

/* -------------------------------------------------------------------------- */
/* Whose account is this skill for?                                           */
/* -------------------------------------------------------------------------- */

/**
 * The niche `viral-hook-script-writer.md` was written for.
 *
 * It is not a generic scriptwriting guide: its title says so ("AI Updates & Tools
 * Niche"), every hook formula in it is an AI-tools formula, and it names the four
 * AI-niche creators it was built from. Handing it to a fitness account does not
 * just look odd — it actively tells the model to write an AI-tools script.
 */
export const HOOK_SKILL_NICHE = "AI updates & tools";

export type AccountSkillKey = "hook_script" | "storyboard" | "video_prompt";

/**
 * A skill file plus the account it may be used for.
 *
 * `niche: null` means the file carries technique only (shot lists, camera moves,
 * JSON shapes) with no niche or creator names in it — those stay available to
 * every account, because dropping them would cost structure and buy nothing.
 */
export type AccountSkill = {
  key: AccountSkillKey;
  niche: string | null;
  text: string;
};

export const ACCOUNT_SKILLS: Record<AccountSkillKey, AccountSkill> = {
  hook_script: {
    key: "hook_script",
    niche: HOOK_SKILL_NICHE,
    text: VIRAL_HOOK_SCRIPT_WRITER_SKILL,
  },
  storyboard: {
    key: "storyboard",
    niche: null,
    text: PRODUCTION_READY_STORYBOARD_PROMPTS_SKILL,
  },
  video_prompt: {
    key: "video_prompt",
    niche: null,
    text: SCRIPT_AWARE_VIDEO_GENERATION_PROMPTS_SKILL,
  },
};

/** Loose, punctuation-insensitive compare: "AI Updates & Tools" == "ai updates and tools". */
function normaliseNiche(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Do these two describe the same lane?
 *
 * Deliberately forgiving, because the cost is asymmetric: a false negative silently
 * takes the owner's playbook away from their own scripts, while a false positive only
 * hands an AI-tools playbook to an account that is already in the AI-tools lane.
 * So: equal after normalising, one containing the other ("AI tools" ⊂ "AI tools for
 * creators"), or every word of the narrower side present in the wider one ("AI tools
 * & updates" ≡ "AI updates and tools"). A single shared word is not enough — otherwise
 * "AI" would match every niche containing it.
 */
export function nicheMatches(a: string, b: string): boolean {
  const x = normaliseNiche(a);
  const y = normaliseNiche(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;

  const xWords = new Set(x.split(" "));
  const yWords = new Set(y.split(" "));
  const [small, large] = xWords.size <= yWords.size ? [xWords, yWords] : [yWords, xWords];
  if (small.size < 2) return false;
  return [...small].every((word) => large.has(word));
}

export type SkillDecision = {
  /** The markdown to send, or null when the account must not receive it. */
  text: string | null;
  applies: boolean;
  /** Short machine-readable why: "applies" | "not-the-owner" | "different-niche". */
  reason: "applies" | "not-the-owner" | "different-niche";
  niche: string | null;
  accountNiche: string;
};

/**
 * May this account be given this skill?
 *
 * Two gates, both deliberate:
 *   1. **The owner's own research** — these files were built by analysing the
 *      owner's competitors. A second account gets its own playbook, not someone
 *      else's, so anything niche-bound stops at the owner.
 *   2. **The niche must still match** — if the owner moves the account to a
 *      different lane, the AI-tools playbook is stale and stops applying too.
 *
 * Technique-only files (`niche: null`) pass both gates for everyone.
 */
export async function skillForAccount(
  env: any,
  userId: string,
  key: AccountSkillKey,
  profile?: CreatorProfile,
): Promise<SkillDecision> {
  const skill = ACCOUNT_SKILLS[key];
  const who = profile ?? (await readCreatorProfile(env, userId));
  const accountNiche = who.niche;

  if (!skill.niche) {
    return { text: skill.text, applies: true, reason: "applies", niche: null, accountNiche };
  }
  if (userId !== OWNER_ID) {
    return { text: null, applies: false, reason: "not-the-owner", niche: skill.niche, accountNiche };
  }
  if (!nicheMatches(accountNiche, skill.niche)) {
    return { text: null, applies: false, reason: "different-niche", niche: skill.niche, accountNiche };
  }
  return { text: skill.text, applies: true, reason: "applies", niche: skill.niche, accountNiche };
}

/**
 * What the model is told instead when the niche-bound script skill does not apply.
 *
 * It is not a watered-down copy of the skill: it is the shape of a short-form
 * script and nothing else, so the account's own niche and language (which the
 * route writes into the prompt from the Creator profile) do the writing.
 */
export const GENERIC_SCRIPT_SYSTEM_PROMPT = [
  "You write short-form vertical video scripts (Instagram Reels / YouTube Shorts) for one creator.",
  "You are told who that creator is, in the user message — their brand, handle, niche and on-camera language.",
  "Write every script for THAT creator: their niche, their language, their audience. Never assume a niche.",
  "",
  "Structure every script the same way:",
  "1. A first line that earns the next second — lead with the visible result, the number or the before/after, never with a tool name or a bare announcement.",
  "2. Offer exactly 3 hook options, each in a different style (e.g. result-first, question, challenge).",
  "3. Body beats with timestamps, each with spoken line, visual and on-screen text.",
  "4. One re-hook roughly two thirds of the way through.",
  "5. Exactly one call to action, asking for one specific thing.",
  "Keep the spoken lines in the creator's on-camera language; keep technical terms in English when that is what the language line says.",
].join("\n");
