/**
 * Unit checks for slot fallback: which token to try, and when a failure means "try the
 * next one".
 *
 * Run from the repo root:  node tools/unit-apify-slots.mjs
 */
import { rolldown } from "rolldown";

let pass = 0;
const fails = [];
const check = (name, cond, extra = "") => {
  if (cond) pass++;
  else {
    fails.push(`${name}${extra ? ` — ${extra}` : ""}`);
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const build = await rolldown({ input: "src/lib/apify-slots.ts" });
const { output } = await build.generate({ format: "cjs" });
const mod = { exports: {} };
new Function("module", "exports", "require", output[0].code)(mod, mod.exports, () => {
  throw new Error("unexpected require");
});
const slots = mod.exports;

const slot = (id, label, job, token, cap = 4.5) => ({ id, label, job, token, cap });

const config = [
  slot(0, "Radwan", "Instagram competitor", "tok_dead"),
  slot(1, "redwahb", "Instagram competitor", "tok_alive"),
  slot(2, "Trends", "Trend lookup", "tok_trends"),
  slot(3, "Empty", "Instagram competitor", "   "),
];

/* ------------------------------------------------------------- ordering */
const ordered = slots.orderSlots(config, "Instagram competitor");
check("job-matching slots come first", ordered[0].label === "Radwan" && ordered[1].label === "redwahb",
  JSON.stringify(ordered.map((s) => s.label)));
check("a slot with a blank token is dropped", !ordered.some((s) => s.label === "Empty"),
  JSON.stringify(ordered.map((s) => s.label)));
check("slots for other jobs are still kept as fallbacks",
  ordered.some((s) => s.label === "Trends"), JSON.stringify(ordered.map((s) => s.label)));
check("every usable slot is offered, not just the first match", ordered.length === 3,
  String(ordered.length));
check("tokens are trimmed", slots.orderSlots([slot(0, "x", "j", "  tok  ")], "j")[0].token === "tok",
  slots.orderSlots([slot(0, "x", "j", "  tok  ")], "j")[0].token);
check("a blank label becomes a readable name",
  slots.orderSlots([slot(7, "", "j", "tok")], "j")[0].label === "slot 7",
  slots.orderSlots([slot(7, "", "j", "tok")], "j")[0].label);
check("no slots → no candidates", slots.orderSlots([], "Instagram competitor").length === 0);
check("undefined slots do not throw", slots.orderSlots(undefined, "x").length === 0);
check("a slot with a different job still ranks below a matching one",
  slots.orderSlots([slot(0, "other", "Something else", "a"), slot(1, "match", "Instagram competitor", "b")],
    "Instagram competitor")[0].label === "match");

/* ------------------------------------------- when to try the next token */
check("402 means out of allowance", slots.isAllowanceFailure(402) === true);
check("403 means the token is not allowed", slots.isAllowanceFailure(403) === true);
check("400 is a bad request — not a reason to spend another token",
  slots.isAllowanceFailure(400) === false);
check("500 is their problem, not the token's", slots.isAllowanceFailure(500) === false);
check("a network error (no status) is not an allowance failure",
  slots.isAllowanceFailure(null) === false && slots.isAllowanceFailure(undefined) === false);
check("200 is not a failure", slots.isAllowanceFailure(200) === false);

/* ------------------------------------------- reporting a scrape honestly */
const healthy = slots.scrapeStepOutcome(["a: 12", "b: 10"], [], ["redwahb"]);
check("a clean scrape is ok", healthy.ok === true, JSON.stringify(healthy));
check("…and names the slot it used", healthy.detail.includes("via redwahb"), healthy.detail);

const degraded = slots.scrapeStepOutcome(["a: 12"], ["b: Apify error: 502"], ["redwahb"]);
check("one failed handle makes the step fail", degraded.ok === false, JSON.stringify(degraded));
check("…and the failure is named in the line",
  degraded.detail.includes("FAILED: b: Apify error: 502"), degraded.detail);
check("…without hiding the slots tried", degraded.detail.includes("via redwahb"), degraded.detail);

const empty = slots.scrapeStepOutcome(["a: 0"], [], []);
check("zero posts with no error is a real answer, not a failure", empty.ok === true, JSON.stringify(empty));
const allFailed = slots.scrapeStepOutcome([], ["a: Apify error: 402", "b: Apify error: 402"], []);
check("every handle failing fails the step", allFailed.ok === false);
check("…with no misleading 'via' when nothing answered", !allFailed.detail.includes("via"), allFailed.detail);

console.log(`\nPASS ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log("FAILED:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
