/**
 * What the Dashboard's Pipeline card and Continue Working list are allowed to say.
 *
 * ## Why this exists
 *
 * Both were decoration. The Pipeline card was a literal constant in the component —
 * `{ label: "Storyboard", status: "pending" }` and friends — so it showed the same five
 * words whether the owner had produced nothing or a hundred things, and it never changed
 * while you watched it. "Continue Working" read the `idea_%` workspace rows, which only
 * the video analyser ever wrote, so the normal path (pick an idea in the Ideator) left it
 * permanently saying "Nothing in progress".
 *
 * A status card is only worth having if it cannot lie. So the wording lives here, driven
 * by counts and by the `source_id` links between rows, and the route that supplies those
 * facts is a plain query — no component decides what state a stage is in.
 *
 * The chain that is actually tracked: script → storyboard → video prompt. Each of those
 * is expected to move forward, so "waiting" means "this row has no child yet". The
 * Ideator and the Planner are leaves: ideas are not all meant to become scripts, so they
 * report a count and nothing more.
 */

export type StageId = "discover" | "script" | "storyboard" | "video_prompt" | "planner";
export type StageState = "ready" | "pending" | "empty";

export type RawCount = { count: number; newest: number | null };

export type PipelineFacts = {
  ideas: RawCount;
  scripts: RawCount;
  storyboards: RawCount;
  videoPrompts: RawCount;
  plans: RawCount;
  /** Scripts no storyboard points at, and storyboards no video prompt points at. */
  scriptsWaiting: number;
  storyboardsWaiting: number;
  /** Newest row of each kind waiting for its next step — the "continue" candidates. */
  nextScript: { id: string; title: string } | null;
  nextStoryboard: { id: string; title: string } | null;
  /** Ideas the owner picked in the Ideator, newest first. */
  selectedIdeas: string[];
};

export type Stage = {
  id: StageId;
  label: string;
  count: number;
  newest: number | null;
  /** Rows of this stage whose next step has not happened yet. */
  waiting: number;
  state: StageState;
};

export type ContinueItem = {
  kind: "idea" | "script" | "storyboard";
  title: string;
  /** The section the work belongs to next. */
  next: StageId;
  nextLabel: string;
  reason: string;
};

/**
 * `ready` needs both output and nothing left hanging; `pending` means the stage has rows
 * waiting for the next step; `empty` means nothing has been produced at all.
 */
export function stageState(count: number, waiting: number): StageState {
  if (count <= 0) return "empty";
  return waiting > 0 ? "pending" : "ready";
}

const STAGES: { id: StageId; label: string; nextLabel: string }[] = [
  { id: "discover", label: "Discover", nextLabel: "Script" },
  { id: "script", label: "Script+Hook", nextLabel: "Storyboard" },
  { id: "storyboard", label: "Storyboard", nextLabel: "Video prompt" },
  { id: "video_prompt", label: "Video Prompt", nextLabel: "—" },
  { id: "planner", label: "Planner", nextLabel: "—" },
];

export function buildPipelineStatus(facts: PipelineFacts): {
  stages: Stage[];
  continueWork: ContinueItem[];
} {
  const counts: Record<StageId, RawCount> = {
    discover: facts.ideas,
    script: facts.scripts,
    storyboard: facts.storyboards,
    video_prompt: facts.videoPrompts,
    planner: facts.plans,
  };
  const waiting: Record<StageId, number> = {
    discover: 0, // not every idea is meant to become a script — see the note above
    script: facts.scriptsWaiting,
    storyboard: facts.storyboardsWaiting,
    video_prompt: 0,
    planner: 0,
  };

  const stages = STAGES.map(({ id, label }) => {
    const c = counts[id] ?? { count: 0, newest: null };
    return {
      id,
      label,
      count: c.count,
      newest: c.newest,
      waiting: waiting[id] ?? 0,
      state: stageState(c.count, waiting[id] ?? 0),
    };
  });

  const continueWork: ContinueItem[] = [];
  if (facts.nextScript) {
    continueWork.push({
      kind: "script",
      title: facts.nextScript.title,
      next: "storyboard",
      nextLabel: "Storyboard",
      reason: "Script written, no storyboard yet",
    });
  }
  if (facts.nextStoryboard) {
    continueWork.push({
      kind: "storyboard",
      title: facts.nextStoryboard.title,
      next: "video_prompt",
      nextLabel: "Video prompt",
      reason: "Storyboard shot, no video prompt yet",
    });
  }
  for (const idea of facts.selectedIdeas.slice(0, 2)) {
    continueWork.push({
      kind: "idea",
      title: idea,
      next: "script",
      nextLabel: "Script",
      reason: "You picked this in the Ideator",
    });
  }

  return { stages, continueWork: continueWork.slice(0, 3) };
}

/** What a stage's rows are called, in both numbers — "1 script" is as likely as "18 scripts". */
export type StageNoun = Record<StageId, { one: string; many: string }>;

/** One short line for a stage, e.g. "18 scripts · 12 awaiting a storyboard". */
export function stageSummary(stage: Stage, noun: StageNoun): string {
  const words = noun[stage.id] ?? { one: "item", many: "items" };
  if (stage.count <= 0) return `No ${words.many} yet`;
  const base = `${stage.count} ${stage.count === 1 ? words.one : words.many}`;
  if (stage.waiting > 0) {
    const next = STAGES.find((s) => s.id === stage.id)?.nextLabel ?? "next step";
    return `${base} · ${stage.waiting} awaiting a ${next.toLowerCase()}`;
  }
  return base;
}
