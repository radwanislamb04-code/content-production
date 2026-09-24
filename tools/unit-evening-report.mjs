/**
 * Unit checks for the 20:00 message. It is the only thing the evening run produces now,
 * so it has to say something true and useful — and say nothing when there is nothing.
 *
 * Run from the repo root:  node tools/unit-evening-report.mjs
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

const build = await rolldown({ input: "src/lib/evening-report.ts" });
const { output } = await build.generate({ format: "cjs" });
const mod = { exports: {} };
new Function("module", "exports", "require", output[0].code)(mod, mod.exports, () => {
  throw new Error("unexpected require");
});
const er = mod.exports;

const base = (over = {}) => ({
  dateKey: "2026-09-24",
  counts: { ideas: 97, scripts: 18, storyboards: 10, prompts: 7 },
  waiting: { scripts: 12, storyboards: 4 },
  next: null,
  tasks: { open: 0, next: [] },
  unscored: 0,
  credit: [],
  instagram: { connected: false, username: null, automations: 0 },
  ...over,
});

/* ------------------------------------------------------------- credit rules */
check("nothing left is a stop, not a whisper",
  (er.creditWarning({ label: "Radwan", remainingUsd: 0, allowanceUsd: 10, state: "blocked" }) ?? "")
    .startsWith("🛑"), String(er.creditWarning({ label: "Radwan", remainingUsd: 0, allowanceUsd: 10, state: "blocked" })));
check("the last quarter is a warning",
  (er.creditWarning({ label: "redwahb", remainingUsd: 1.2, allowanceUsd: 5, state: "ok" }) ?? "")
    .includes("$1.20 of $5.00"), String(er.creditWarning({ label: "redwahb", remainingUsd: 1.2, allowanceUsd: 5, state: "ok" })));
check("two thirds left is not a warning",
  er.creditWarning({ label: "redwahb", remainingUsd: 3.3, allowanceUsd: 5, state: "ok" }) === null,
  String(er.creditWarning({ label: "redwahb", remainingUsd: 3.3, allowanceUsd: 5, state: "ok" })));
check("exactly at the threshold warns", er.creditWarning({ label: "x", remainingUsd: 1.25, allowanceUsd: 5, state: "ok" }) !== null);
check("an unreadable token is reported, not ignored",
  (er.creditWarning({ label: "x", remainingUsd: null, allowanceUsd: null, state: "error" }) ?? "").includes("could not be read"));
check("a slot with no token says nothing at all",
  er.creditWarning({ label: "x", remainingUsd: null, allowanceUsd: null, state: "no-token" }) === null);
check("the reset date rides along",
  (er.creditWarning({ label: "x", remainingUsd: 0.5, allowanceUsd: 5, state: "ok", resetsAt: "2026-10-14" }) ?? "")
    .includes("resets 2026-10-14"));

/* ------------------------------------------------------------------ the message */
const quiet = er.buildEveningReport(base({ waiting: { scripts: 0, storyboards: 0 }, instagram: { connected: true, username: "enzorico.ai", automations: 2 } }));
check("an all-clear day says so", quiet.includes("Nothing is waiting. All clear."), quiet);
check("…and still reports the totals", quiet.includes("97 ideas · 18 scripts · 10 storyboards · 7 prompts"), quiet);
check("…and does not invent backlog lines", !quiet.includes("no storyboard yet"), quiet);
check("a connected account is stated plainly", quiet.includes("Instagram @enzorico.ai · 2 automations on"), quiet);

const busy = er.buildEveningReport(base({
  tasks: { open: 7, next: [{ time: "21:00", text: "Post REEL" }, { time: null, text: "Reply to Tester" }] },
  unscored: 132,
  credit: [{ label: "redwahb", remainingUsd: 0.4, allowanceUsd: 5, state: "ok", resetsAt: "2026-10-14" }],
  next: { title: "Script: three AI editors", needs: "storyboard" },
}));
check("open tasks are counted", busy.includes("📋 7 tasks still open"), busy);
check("…with their times", busy.includes("• 21:00 — Post REEL"), busy);
check("…and ones without a time are still listed", busy.includes("• Reply to Tester"), busy);
check("the backlog is named", busy.includes("✍️ 12 scripts with no storyboard yet"), busy);
check("…and the storyboard backlog too", busy.includes("🎬 4 storyboards with no video prompt yet"), busy);
check("the single next thing is named", busy.includes("▶️ Next up (storyboard): Script: three AI editors"), busy);
check("un-scored items are named", busy.includes("⭐ 132 items never scored"), busy);
check("a low balance is warned about along with the reset", busy.includes("$0.40 of $5.00") && busy.includes("resets 2026-10-14"), busy);
check("no Instagram is a warning, not a silent gap", busy.includes("No Instagram account is connected"), busy);
check("an all-clear line is NOT printed on a busy day", !busy.includes("All clear"), busy);

const singular = er.buildEveningReport(base({ waiting: { scripts: 1, storyboards: 1 }, unscored: 1, tasks: { open: 1, next: [{ text: "one thing" }] } }));
check("one task reads singular", singular.includes("📋 1 task still open"), singular);
check("one script reads singular", singular.includes("✍️ 1 script with no storyboard yet"), singular);
check("one storyboard reads singular", singular.includes("🎬 1 storyboard with no video prompt yet"), singular);
check("one un-scored item reads singular", singular.includes("⭐ 1 item never scored"), singular);

const many = er.buildEveningReport(base({
  tasks: { open: 9, next: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }, { text: "e" }] },
}));
check("only five tasks are listed", many.split("\n").filter((l) => l.startsWith("• ")).length === 5, many);
check("…and the rest are summed up", many.includes("…and 4 more"), many);

const long = er.buildEveningReport(base({
  next: { title: "x".repeat(300), needs: "storyboard" },
  tasks: { open: 1, next: [{ text: "y".repeat(500) }] },
}));
check("a long title is clipped, not dumped in full", !long.includes("x".repeat(200)), "title not clipped");
check("…and a long task too", !long.includes("y".repeat(200)), "task not clipped");
check("the message stays comfortably inside one Telegram message", long.length < 4096, String(long.length));

console.log(`\nPASS ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log("FAILED:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
