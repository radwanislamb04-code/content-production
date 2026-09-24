/**
 * Unit checks for the shared copy helper.
 *
 * The case that matters is the one a browser test cannot stage on demand: the async
 * Clipboard API rejecting (it does whenever the document is not focused) must fall through
 * to the legacy path instead of reporting failure to the user.
 *
 * Run from the repo root:  node tools/unit-clipboard.mjs
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

const build = await rolldown({ input: "src/lib/clipboard.ts" });
const { output } = await build.generate({ format: "cjs" });
const mod = { exports: {} };
new Function("module", "exports", "require", output[0].code)(mod, mod.exports, () => {});
const { copyText } = mod.exports;

/** Install fake globals for one call, then put the real ones back. */
async function withEnv({ clipboard, exec, hasDocument = true }, fn) {
  // Node 22 defines `navigator` as a getter-only property, so it has to be redefined
  // rather than assigned.
  const savedNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const savedDoc = Object.getOwnPropertyDescriptor(globalThis, "document");
  const setGlobal = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const restore = (name, descriptor) => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  };
  let execCalls = 0;
  let appended = 0;
  setGlobal("navigator", clipboard === undefined ? undefined : { clipboard });
  if (hasDocument) {
    setGlobal("document", {
      createElement: () => ({ style: {}, setAttribute() {}, select() {}, remove() {} }),
      body: { appendChild: () => appended++ },
      execCommand: () => {
        execCalls++;
        return exec ?? false;
      },
    });
  } else {
    setGlobal("document", undefined);
  }
  try {
    const result = await fn();
    return { result, execCalls, appended };
  } finally {
    restore("navigator", savedNav);
    restore("document", savedDoc);
  }
}

console.log("=== the modern path ===");
{
  let written = null;
  const { result, execCalls } = await withEnv(
    { clipboard: { writeText: async (t) => ((written = t), undefined) } },
    () => copyText("হ্যালো"),
  );
  check("returns true when the Clipboard API works", result === true, String(result));
  check("…and it was given the exact text", written === "হ্যালো", JSON.stringify(written));
  check("…and the legacy path was not touched", execCalls === 0, String(execCalls));
}

console.log("=== the focus case ===");
{
  const denied = async () => {
    throw new Error("NotAllowedError: Document is not focused.");
  };
  const { result, execCalls, appended } = await withEnv(
    { clipboard: { writeText: denied }, exec: true },
    () => copyText("text"),
  );
  check("a rejected Clipboard API falls back", result === true, String(result));
  check("…and the fallback actually ran", execCalls === 1, String(execCalls));
  check("…and its textarea was cleaned up (one append)", appended === 1, String(appended));
}
{
  const denied = async () => {
    throw new Error("NotAllowedError");
  };
  const { result } = await withEnv({ clipboard: { writeText: denied }, exec: false }, () =>
    copyText("text"),
  );
  check("if the fallback also fails, the answer is false", result === false, String(result));
}

console.log("=== other shapes ===");
{
  const { result, execCalls } = await withEnv({ clipboard: undefined, exec: true }, () =>
    copyText("text"),
  );
  check("no Clipboard API at all → legacy path", result === true && execCalls === 1, String(result));
}
{
  const { result } = await withEnv({ clipboard: undefined, exec: true, hasDocument: false }, () =>
    copyText("text"),
  );
  check("no document (server render) → false, no throw", result === false, String(result));
}
{
  const { result } = await withEnv(
    { clipboard: { writeText: async () => undefined }, exec: true },
    () => copyText(""),
  );
  check("an empty string still reports success", result === true, String(result));
}

console.log(`\nPASS ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log("FAILED:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
