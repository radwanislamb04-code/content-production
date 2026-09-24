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
