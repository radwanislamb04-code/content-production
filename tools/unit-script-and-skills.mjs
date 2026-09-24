/**
 * Unit checks for the two rules this round added:
 *   1. `src/lib/script-body.ts` — the hook that opens a script, and what gets spoken
 *   2. `src/lib/skills.ts`     — which account may receive the niche-bound skill
 *
 * The modules are bundled with the same bundler Vite uses (rolldown) and executed
 * directly, so this tests the real source, not a copy. `.md?raw` imports are stubbed:
 * the gating logic never looks at the markdown, only at which file it came from.
 *
 * Run from the repo root:  node tools/unit-script-and-skills.mjs
 */
import { rolldown } from "rolldown";
import { readFileSync } from "node:fs";

let pass = 0;
const fails = [];
const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fails.push(`${name}${extra ? ` — ${extra}` : ""}`);
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

async function bundle(entry, stub = false) {
  const build = await rolldown({
    input: entry,
    plugins: stub
      ? [
          {
            name: "raw-md-stub",
            resolveId: (id) => (id.includes(".md?raw") ? id : null),
            load: (id) =>
              id.includes(".md?raw") ? `export default "STUBBED SKILL TEXT";` : null,
          },
        ]
      : [],
  });
  const { output } = await build.generate({ format: "cjs" });
  const code = output[0].code;
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(module, module.exports, () => {
    throw new Error("unexpected require");
  });
  return module.exports;
}

/* ------------------------------------------------------- script-body.ts */
console.log("=== script-body: which hook opens the script ===");
const sb = await bundle("src/lib/script-body.ts");

const hooks = [
  { spoken: "Hook one.", formula: "Result-first", visual: "V1", text_overlay: "T1" },
  { spoken: "Hook two?", formula: "Question", visual: "V2", text_overlay: "T2" },
  { spoken: "Hook three.", formula: "Challenge", visual: "", text_overlay: "T3" },
];
const body = [
  '[0-3s] HOOK: "Hook one." | Visual: V1 | Text: T1',
  "[3-8s] SETUP: \"Some setup.\" | Visual: B-roll",
  '[35-40s] CTA: "Comment FIX." | Visual: pointing down',
].join("\n");

const applied = sb.applyHookToBody(body, hooks[1]);
check("chosen hook replaces the old beat", applied.includes('HOOK: "Hook two?"'), applied.split("\n")[0]);
check("the chosen hook's visual rides along", applied.includes("Visual: V2"));
check("the chosen hook's overlay rides along", applied.includes("Text: T2"));
check("the original timestamp is kept", applied.startsWith("[0-3s] HOOK:"), applied.split("\n")[0]);
check("the first hook is gone from the body", !applied.includes("Hook one."));
check("later beats are untouched", applied.includes("[3-8s] SETUP") && applied.includes("[35-40s] CTA"));
check("beat count is unchanged", applied.split("\n").length === body.split("\n").length);

const noBeat = sb.applyHookToBody("[3-8s] SETUP: \"just setup\"", hooks[2]);
check("no hook beat → one is inserted first", noBeat.startsWith('[0-3s] HOOK: "Hook three."'), noBeat);
check("the original line survives the insert", noBeat.includes("[3-8s] SETUP"));
check("empty visuals are simply omitted", !noBeat.includes("Visual: |"));

const voiced = sb.voiceoverFor(hooks[1], applied, "Comment FIX.");
check("voiceover opens with the chosen hook", voiced.startsWith("Hook two?"), voiced.slice(0, 40));
check("spoken text has no stage directions", !voiced.includes("Visual") && !voiced.includes("[0-3s]"), voiced);
check("the hook is not spoken twice", voiced.split("Hook two?").length === 2, voiced);
check("the other hooks are not spoken at all", !voiced.includes("Hook one") && !voiced.includes("Hook three"), voiced);
check("the cta closes it", voiced.trim().endsWith("Comment FIX."), voiced);

console.log("=== script-body: a one-line body is not a script ===");
check("a full body is not thin", !sb.isThinBody(body), `${sb.bodyBeatCount(body)} beats`);
check("a single-beat body is thin", sb.isThinBody('[0-3s] HOOK: "only this"'));
check("blank lines do not count as beats", sb.bodyBeatCount("a\n\n\nb") === 2, String(sb.bodyBeatCount("a\n\n\nb")));
check("the floor is three beats", sb.MIN_SCRIPT_BEATS === 3, String(sb.MIN_SCRIPT_BEATS));

const picked = sb.selectHook({ hooks, body, cta: "Comment FIX." }, 2);
check("selectHook records the index", picked.selected_hook_index === 2, String(picked.selected_hook_index));
check("selectHook rewrites the body's opening", picked.body.includes('HOOK: "Hook three."'));
check("selectHook rebuilds the voiceover", picked.voiceover_script.startsWith("Hook three."), picked.voiceover_script.slice(0, 30));
check("selectHook keeps the other fields", picked.cta === "Comment FIX." && picked.body.includes("[35-40s] CTA"));
check("out-of-range index clamps instead of throwing", sb.selectHook({ hooks, body }, 9).selected_hook_index === 2);
check("negative index clamps to the first hook", sb.selectHook({ hooks, body }, -4).selected_hook_index === 0);
check("a script with no hooks is left alone", sb.selectHook({ body: "x" }, 1).body === "x");
check("missing selection reads as hook 0", sb.selectedHookIndex({ hooks }) === 0);
check("selection is readable back", sb.selectedHook({ hooks, selected_hook_index: 1 })?.spoken === "Hook two?");

const full = sb.fullScriptText({ body: applied, cta: "Comment FIX." });
check("full script does not print the cta twice", full.split("Comment FIX.").length === 2, full);
const fullNoCta = sb.fullScriptText({ body: '[0-3s] HOOK: "x"', cta: "Follow for more." });
check("a body without the cta gets it appended", fullNoCta.endsWith("Follow for more."), fullNoCta);
check("an empty body falls back to the cta", sb.fullScriptText({ cta: "Only cta." }) === "Only cta.");

/* ------------------------------------------------------- brief-parse.ts */
console.log("=== brief-parse: a bulleted brief still has sections ===");
const bp = await bundle("src/lib/brief-parse.ts");

// Exactly the shape the live brief arrived in on 2026-09-24 — headings carried the
// bullet, which is what collapsed the whole page into one paragraph.
const bulleted = [
  "- TODAY'S PICKS",
  "- Google Trends Bangladesh: weather is #1 at 20K",
  "- YouTube trending top pick: A24's trailer has 2.9M views",
  "",
  "- TRENDING NOW",
  "- Google Gemini Omni update: rivals are raving",
  "- JioPC launch by Mukesh Ambani: browser-based cloud computer",
].join("\n");
const parsed = bp.parseBrief(bulleted);
check("bulleted headings are recognised", parsed.sections.length === 2,
  JSON.stringify(parsed.sections.map((s) => s.title)));
check("the first section is TODAY'S PICKS", parsed.sections[0]?.title === "TODAY'S PICKS",
  parsed.sections[0]?.title);
check("its bullets became items", parsed.sections[0]?.items.length === 2,
  JSON.stringify(parsed.sections[0]?.items));
check("nothing leaked into the intro", parsed.intro.length === 0, JSON.stringify(parsed.intro));

const bare = bp.parseBrief("TODAY'S PICKS\n- one\nTRENDING NOW:\n- two");
check("bare headings still work", bare.sections.length === 2, JSON.stringify(bare.sections));
const decorated = bp.parseBrief("**HOOK IDEAS**\n- a\n## ACTION ITEMS:\n- b");
check("bold and hash headings work", decorated.sections.length === 2,
  JSON.stringify(decorated.sections.map((s) => s.title)));
const withIntro = bp.parseBrief("Two lines before any heading.\nTODAY'S PICKS\n- x");
check("prose before the first heading is the intro", withIntro.intro.length === 1 && withIntro.sections.length === 1,
  JSON.stringify(withIntro.intro));
check("an item that only looks like a heading is not one",
  bp.parseBrief("TODAY'S PICKS\n- Trending now is a phrase I use\n- next").sections[0]?.items.length === 2,
  JSON.stringify(bp.parseBrief("TODAY'S PICKS\n- Trending now is a phrase I use\n- next").sections[0]?.items));
check("empty markdown yields nothing", bp.parseBrief("").sections.length === 0);
check("preview still works", typeof bp.briefPreview(bulleted) === "string" && bp.briefPreview(bulleted).length > 0,
  bp.briefPreview(bulleted));

// And the same check against the brief that is actually live right now.
try {
  const token = JSON.parse(readFileSync("../.secrets/access-service-token.json", "utf8"));
  const res = await fetch("https://content-production-worker.radwanislamb04.workers.dev/api/brief", {
    headers: {
      "CF-Access-Client-Id": token.client_id,
      "CF-Access-Client-Secret": token.client_secret,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  const body = await res.json();
  const live = bp.parseBrief(body?.brief?.markdown ?? "");
  console.log(`  --- live brief ${body?.brief?.date}: ${live.sections.length} sections, ` +
    `${live.sections.reduce((n, s) => n + s.items.length, 0)} items, ${live.intro.length} intro lines`);
  check("the live brief parses into sections", live.sections.length >= 3,
    JSON.stringify(live.sections.map((s) => `${s.title}:${s.items.length}`)));
  check("every live section has items", live.sections.every((s) => s.items.length > 0),
    JSON.stringify(live.sections.map((s) => `${s.title}:${s.items.length}`)));
  check("the live brief is not one blob", live.intro.length <= 1, String(live.intro.length));
} catch (e) {
  check("live brief readable (a limit, not a failure)", false, String(e).slice(0, 120));
}

/* ----------------------------------------------------------- skills.ts */
console.log("=== skills: who may receive the niche-bound playbook ===");
const sk = await bundle("src/lib/skills.ts", true);
// Read the real owner id from the real module rather than typing it in here.
const { OWNER_ID: OWNER } = await bundle("src/lib/owner.ts");

check("the hook skill declares its niche", sk.ACCOUNT_SKILLS.hook_script.niche === "AI updates & tools", String(sk.ACCOUNT_SKILLS.hook_script.niche));
check("the storyboard skill is technique-only", sk.ACCOUNT_SKILLS.storyboard.niche === null);
check("the video skill is technique-only", sk.ACCOUNT_SKILLS.video_prompt.niche === null);

check("& and 'and' compare equal", sk.nicheMatches("AI Updates & Tools", "ai updates and tools"));
check("a reworded niche still matches", sk.nicheMatches("AI tools", "AI updates and tools"));
check("word order does not matter", sk.nicheMatches("AI tools & updates", "AI updates and tools"));
// Containment is the loose branch on purpose: "AI" is the same lane written shorter.
check("a narrower phrase still matches", sk.nicheMatches("AI", "AI updates and tools"));
check("a partially overlapping niche does NOT match",
  !sk.nicheMatches("AI tools for creators", "AI updates and tools"));
// Only shared words are not enough — "fitness" shares none, and would have to share
// every word of the shorter side to pass the token branch.
check("an unrelated single word does not match", !sk.nicheMatches("fitness", "AI updates and tools"));
check("an unrelated two-word niche does not match", !sk.nicheMatches("home fitness", "AI updates and tools"));
check("an unrelated niche does not", !sk.nicheMatches("home fitness", "AI updates and tools"));
check("empty never matches", !sk.nicheMatches("", "AI updates and tools"));

const ownerAiTools = await sk.skillForAccount({}, OWNER, "hook_script", { niche: "AI updates & tools" });
check("owner + AI niche → the skill", ownerAiTools.applies && typeof ownerAiTools.text === "string", ownerAiTools.reason);
check("…and says why", ownerAiTools.reason === "applies", ownerAiTools.reason);

const ownerMoved = await sk.skillForAccount({}, OWNER, "hook_script", { niche: "home fitness" });
check("owner who moved niche → no skill", !ownerMoved.applies && ownerMoved.text === null, ownerMoved.reason);
check("…reason is different-niche", ownerMoved.reason === "different-niche", ownerMoved.reason);

const second = await sk.skillForAccount({}, "usr_someone_else", "hook_script", { niche: "AI updates & tools" });
check("another account → no skill, even in the same niche", !second.applies && second.text === null, second.reason);
check("…reason is not-the-owner", second.reason === "not-the-owner", second.reason);

const secondStoryboard = await sk.skillForAccount({}, "usr_someone_else", "storyboard", { niche: "home fitness" });
check("another account still gets the technique file", secondStoryboard.applies && !!secondStoryboard.text, secondStoryboard.reason);

const generic = sk.GENERIC_SCRIPT_SYSTEM_PROMPT;
check("the fallback prompt exists and is substantial", typeof generic === "string" && generic.length > 300, String(generic?.length));
for (const leak of ["AI updates", "AI tools", "Simone", "Rourke", "Vaibhav", "Mansilla", "enzorico", "Content OS"]) {
  check(`fallback prompt does not leak "${leak}"`, !generic.toLowerCase().includes(leak.toLowerCase()));
}
check("fallback asks for 3 hook options", /3 hook options/i.test(generic));

console.log(`\nPASS ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log("FAILED:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
