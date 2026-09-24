/**
 * Unit checks for the rule that decides what the Dashboard may say.
 *
 * The card it drives used to be a hardcoded array, so the point of these checks is that
 * the new wording is derived: a stage's state comes from its own row count and from how
 * many of its rows are still waiting for the next step, and "Continue Working" comes from
 * real rows, in a defined order.
 *
 * Run from the repo root:  node tools/unit-pipeline-status.mjs
 */
import { rolldown } from "rolldown";

let pass = 0;
const fails = [];
const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
  } else {
    fails.push(`${name}${extra ? ` — ${extra}` : ""}`);
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const build = await rolldown({ input: "src/lib/pipeline-status.ts" });
const { output } = await build.generate({ format: "cjs" });
const mod = { exports: {} };
new Function("module", "exports", "require", output[0].code)(mod, mod.exports, () => {
  throw new Error("unexpected require");
});
const ps = mod.exports;

const facts = (over = {}) => ({
  ideas: { count: 0, newest: null },
  scripts: { count: 0, newest: null },
  storyboards: { count: 0, newest: null },
  videoPrompts: { count: 0, newest: null },
  plans: { count: 0, newest: null },
  scriptsWaiting: 0,
  storyboardsWaiting: 0,
  nextScript: null,
  nextStoryboard: null,
  selectedIdeas: [],
  ...over,
});

/* ------------------------------------------------------------ the state rule */
check("nothing produced → every stage empty",
  ps.buildPipelineStatus(facts()).stages.every((s) => s.state === "empty"));
check("an empty stage reports zero", ps.buildPipelineStatus(facts()).stages[0].count === 0);
check("state: rows but nothing waiting → ready", ps.stageState(3, 0) === "ready");
check("state: rows with work waiting → pending", ps.stageState(3, 2) === "pending");
check("state: no rows → empty even if something claims to wait", ps.stageState(0, 5) === "empty");

const busy = ps.buildPipelineStatus(facts({
  ideas: { count: 97, newest: 1 },
  scripts: { count: 18, newest: 2 },
  storyboards: { count: 10, newest: 3 },
  videoPrompts: { count: 7, newest: 4 },
  plans: { count: 2, newest: 5 },
  scriptsWaiting: 12,
  storyboardsWaiting: 4,
}));
const stage = (id) => busy.stages.find((s) => s.id === id);
check("five stages, in chain order",
  busy.stages.map((s) => s.id).join(",") === "discover,script,storyboard,video_prompt,planner",
  busy.stages.map((s) => s.id).join(","));
check("Discover reports its count", stage("discover").count === 97);
check("Discover is ready — not every idea becomes a script", stage("discover").state === "ready",
  stage("discover").state);
check("Script is pending while rows wait", stage("script").state === "pending", stage("script").state);
check("…and says how many wait", stage("script").waiting === 12, String(stage("script").waiting));
check("Video Prompt has nothing waiting", stage("video_prompt").waiting === 0);
check("Video Prompt is ready", stage("video_prompt").state === "ready");
check("Planner carries its own count", stage("planner").count === 2);

/* ------------------------------------------------------------ the wording */
const noun = {
  discover: { one: "idea", many: "ideas" },
  script: { one: "script", many: "scripts" },
  storyboard: { one: "storyboard", many: "storyboards" },
  video_prompt: { one: "prompt", many: "prompts" },
  planner: { one: "month planned", many: "months planned" },
};
check("summary names the count and what it waits for",
  ps.stageSummary(stage("script"), noun) === "18 scripts · 12 awaiting a storyboard",
  ps.stageSummary(stage("script"), noun));
check("a ready stage does not mention waiting",
  ps.stageSummary(stage("video_prompt"), noun) === "7 prompts",
  ps.stageSummary(stage("video_prompt"), noun));
check("an empty stage says so in words, not '0 scripts'",
  ps.stageSummary({ id: "storyboard", count: 0, waiting: 0, state: "empty", newest: null }, noun)
    === "No storyboards yet",
  ps.stageSummary({ id: "storyboard", count: 0, waiting: 0, state: "empty", newest: null }, noun));
check("no summary ever starts with a bare zero",
  !Object.entries(noun).some(([id]) =>
    ps.stageSummary({ id, count: 0, waiting: 0, state: "empty", newest: null }, noun).startsWith("0 ")));
check("one row reads singular",
  ps.stageSummary({ id: "planner", count: 1, waiting: 0, state: "ready", newest: null }, noun)
    === "1 month planned",
  ps.stageSummary({ id: "planner", count: 1, waiting: 0, state: "ready", newest: null }, noun));
check("one script reads singular too",
  ps.stageSummary({ id: "script", count: 1, waiting: 0, state: "ready", newest: null }, noun)
    === "1 script",
  ps.stageSummary({ id: "script", count: 1, waiting: 0, state: "ready", newest: null }, noun));
check("two scripts read plural",
  ps.stageSummary({ id: "script", count: 2, waiting: 0, state: "ready", newest: null }, noun)
    === "2 scripts");

/* ------------------------------------------------------- continue working */
const none = ps.buildPipelineStatus(facts({ scripts: { count: 4, newest: 9 } }));
check("nothing waiting → the list is empty (the card says so honestly)",
  none.continueWork.length === 0, JSON.stringify(none.continueWork));

const one = ps.buildPipelineStatus(facts({
  scripts: { count: 4, newest: 9 },
  nextScript: { id: "s1", title: "Script: three AI editors" },
}));
check("a script with no storyboard is offered", one.continueWork.length === 1);
check("…with the step it needs", one.continueWork[0].next === "storyboard", one.continueWork[0].next);
check("…and a button label", one.continueWork[0].nextLabel === "Storyboard");
check("…and a reason a human can read",
  one.continueWork[0].reason === "Script written, no storyboard yet", one.continueWork[0].reason);
check("…and it says what it is", one.continueWork[0].kind === "script");

const both = ps.buildPipelineStatus(facts({
  nextScript: { id: "s1", title: "Script A" },
  nextStoryboard: { id: "b1", title: "Storyboard A" },
  selectedIdeas: ["An idea I picked"],
}));
check("order is script, storyboard, then the picked idea",
  both.continueWork.map((c) => c.kind).join(",") === "script,storyboard,idea",
  both.continueWork.map((c) => c.kind).join(","));
check("the picked idea routes to the Script screen",
  both.continueWork[2].next === "script", both.continueWork[2].next);
check("the picked idea says where it came from",
  both.continueWork[2].reason === "You picked this in the Ideator");

const many = ps.buildPipelineStatus(facts({
  nextScript: { id: "s1", title: "Script A" },
  nextStoryboard: { id: "b1", title: "Storyboard A" },
  selectedIdeas: ["one", "two", "three", "four"],
}));
check("the list is capped at three", many.continueWork.length === 3, String(many.continueWork.length));

const noNewest = ps.buildPipelineStatus(facts({ scriptsWaiting: 6, scripts: { count: 6, newest: 1 } }));
check("waiting rows without a newest row do not invent an entry",
  noNewest.continueWork.length === 0, JSON.stringify(noNewest.continueWork));
check("…but the stage still reports the backlog",
  noNewest.stages.find((s) => s.id === "script").waiting === 6);

console.log(`\nPASS ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log("FAILED:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
