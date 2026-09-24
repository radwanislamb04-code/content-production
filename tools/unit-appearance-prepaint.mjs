/**
 * Unit checks for the pre-paint theme script and the critical background style.
 *
 * The point of both is the first frame, which no browser test can see reliably — so the
 * *shipped text* is executed here against a fake document, and the two CSS rules are
 * checked for shape. What is tested is exactly what is sent.
 *
 * Run from the repo root:  node tools/unit-appearance-prepaint.mjs
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

const build = await rolldown({ input: "src/lib/appearance.ts" });
const { output } = await build.generate({ format: "cjs" });
const mod = { exports: {} };
// appearance.ts reads nothing at import time on the server beyond defaults.
new Function("module", "exports", "require", output[0].code)(mod, mod.exports, () => {
  throw new Error("unexpected require");
});
const ap = mod.exports;

const SCRIPT = ap.APPEARANCE_PREPAINT_SCRIPT;
check("the script is a string", typeof SCRIPT === "string" && SCRIPT.length > 100, typeof SCRIPT);
check("it is self-invoking and synchronous", SCRIPT.startsWith("(function(){") && SCRIPT.trim().endsWith("})();"),
  SCRIPT.slice(0, 24));
check("it names the same storage key as the runtime", SCRIPT.includes(JSON.stringify("aios.appearance")));
check("it toggles the same class the runtime does", SCRIPT.includes(JSON.stringify(ap.DARK_CLASS)));

/** Run the shipped script with fakes; returns what it did to the document. */
function run({ stored = undefined, throws = false, prefersDark = false } = {}) {
  const classes = new Set();
  const html = {
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
    style: {},
    dataset: {},
  };
  const localStorage = {
    getItem: () => {
      if (throws) throw new Error("storage disabled");
      return stored === undefined ? null : stored;
    },
  };
  const window = { matchMedia: () => ({ matches: prefersDark }) };
  const fn = new Function("document", "localStorage", "window", SCRIPT);
  fn({ documentElement: html }, localStorage, window);
  return {
    dark: classes.has(ap.DARK_CLASS),
    colorScheme: html.style.colorScheme,
    reduceMotion: html.dataset.reduceMotion,
  };
}

console.log("=== the default is dark, and it survives bad input ===");
check("nothing stored → dark", run().dark === true, JSON.stringify(run()));
check("nothing stored → colorScheme dark", run().colorScheme === "dark", run().colorScheme);
check("nothing stored → reduce-motion off", run().reduceMotion === "false", run().reduceMotion);
check("unreadable JSON → dark, no throw", run({ stored: "{oops" }).dark === true);
check("an unknown theme value → dark", run({ stored: '{"theme":"neon"}' }).dark === true);
check("storage that throws → dark, no throw", run({ throws: true }).dark === true);
check("an empty object → dark", run({ stored: "{}" }).dark === true);

console.log("=== a stored choice wins, before the first paint ===");
check("light wins over the dark default", run({ stored: '{"theme":"light"}' }).dark === false,
  JSON.stringify(run({ stored: '{"theme":"light"}' })));
check("light also sets colorScheme light",
  run({ stored: '{"theme":"light"}' }).colorScheme === "light");
check("dark stays dark", run({ stored: '{"theme":"dark"}' }).dark === true);
check("system follows a dark OS", run({ stored: '{"theme":"system"}', prefersDark: true }).dark === true);
check("system follows a light OS", run({ stored: '{"theme":"system"}', prefersDark: false }).dark === false);
check("system with no matchMedia does not throw",
  run({ stored: '{"theme":"system"}' }).dark === false);
check("reduce-motion is carried over",
  run({ stored: '{"theme":"dark","reduceMotion":true}' }).reduceMotion === "true");
check("reduce-motion false stays false",
  run({ stored: '{"theme":"dark","reduceMotion":false}' }).reduceMotion === "false");

console.log("=== the critical background covers the gap before the stylesheet ===");
const css = ap.CRITICAL_BACKGROUND_CSS;
check("it sets a background for html", css.startsWith("html{background:"), css);
check("the default background is the dark app colour",
  css.includes(`html{background:${ap.APP_BACKGROUND.dark}}`), css);
check("the light app colour applies only without the dark class",
  css.includes(`html:not(.${ap.DARK_CLASS}){background:${ap.APP_BACKGROUND.light}}`), css);
check("the dark rule is not the one that gets overridden by :not()",
  css.indexOf("html{") < css.indexOf("html:not("), css);
check("it matches the palette in styles.css",
  ap.APP_BACKGROUND.dark === "#030504" && ap.APP_BACKGROUND.light === "#f2f5f2",
  JSON.stringify(ap.APP_BACKGROUND));

console.log(`\nPASS ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log("FAILED:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
