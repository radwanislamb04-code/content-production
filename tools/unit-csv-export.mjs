/**
 * Unit checks for the project CSV export.
 *
 * The interesting failure of a CSV is silent: a comma or a quote inside an image prompt
 * shifts every later column, and the file still opens. So this parses the produced file
 * back and compares values, instead of only looking for substrings.
 *
 * Run from the repo root:  node tools/unit-csv-export.mjs
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

const build = await rolldown({ input: "src/lib/csv-export.ts" });
const { output } = await build.generate({ format: "cjs" });
const mod = { exports: {} };
new Function("module", "exports", "require", output[0].code)(mod, mod.exports, () => {
  throw new Error("unexpected require");
});
const csv = mod.exports;

console.log("=== csvCell ===");
check("plain text is untouched", csv.csvCell("hello") === "hello", csv.csvCell("hello"));
check("a comma gets quotes", csv.csvCell("a, b") === '"a, b"', csv.csvCell("a, b"));
check("a quote is doubled", csv.csvCell('say "hi"') === '"say ""hi"""', csv.csvCell('say "hi"'));
check("a newline gets quotes", csv.csvCell("one\ntwo") === '"one\ntwo"', csv.csvCell("one\ntwo"));
check("a CRLF gets quotes", csv.csvCell("one\r\ntwo") === '"one\r\ntwo"', csv.csvCell("one\r\ntwo"));
check("padded text gets quotes", csv.csvCell(" pad ") === '" pad "', csv.csvCell(" pad "));
check("null and undefined are empty", csv.csvCell(null) === "" && csv.csvCell(undefined) === "");
check("zero is kept, not treated as empty", csv.csvCell(0) === "0", csv.csvCell(0));
check("numbers become text", csv.csvCell(42) === "42", csv.csvCell(42));

/** Minimal RFC 4180 reader, only as strict as the writer it checks. */
function parse(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // what a CSV reader does
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const shots = [
  {
    shot_number: 1,
    duration: "0-3s",
    script_portion: 'Everyone says "AI panic" — but the data says otherwise.',
    visual_description: "Close-up of a news terminal, red PANIC headlines, then a calm face.",
    image_prompt:
      "Cinematic film still, 9:16\nvertical aspect ratio, close-up of a news ticker\nwith blurred red headlines",
    text_overlay: "Panic or strategy?",
    text_overlay_position: "bottom",
    voiceover: "Everyone's panicking online.",
  },
  {
    shot_number: 2,
    duration: "3-8s",
    script_portion: "Here is the number nobody shows you.",
    visual_description: "Screen recording of a timeline, then a clean chart.",
    image_prompt: "UI design mockup, 9:16 vertical, split screen: chaotic timeline, clean chart.",
    text_overlay: "",
    voiceover: "Watch this number.",
  },
];
const prompts = [
  { shot_number: 2, video_prompt: "Shot 2 prompt, with a comma.", negative_prompt: "text, watermark" },
  { shot_number: 1, video_prompt: "Shot 1 prompt", negative_prompt: "blur", camera_motion: "slow push in" },
];
const script = {
  id: "scr_1",
  title: "The Researcher Who Quit OpenAI — Bangla: রিসার্চার",
  hook: "Everyone says this is AI panic.",
  body: "beat one\nbeat two",
  voiceover: "spoken one",
  cta: "Comment AHEAD",
};

const file = csv.buildProjectCsv({ script, shots, prompts, model: "seedance", aspectRatio: "9:16", quality: "high", exportedAt: Date.UTC(2026, 8, 25) });
const rows = parse(file);

console.log("=== the file itself ===");
check("a UTF-8 BOM leads, for Excel and Bangla text", file.startsWith("\ufeff"), file.slice(0, 6));
check("rows are CRLF separated", file.includes("\r\n"));
check("header + one row per shot", rows.length === 3, `rows=${rows.length}`);
check("header names the per-shot columns first",
  rows[0][0] === "shot_number" && rows[0][4] === "image_prompt", rows[0].join("|"));
check("header ends with the script-level columns",
  rows[0].includes("script_title") && rows[0].includes("script_voiceover"), rows[0].join("|"));
check("every row has the same number of columns",
  new Set(rows.map((r) => r.length)).size === 1, rows.map((r) => r.length).join(","));

const idx = (name) => rows[0].indexOf(name);
const cell = (row, name) => rows[row][idx(name)];

console.log("=== values survive the round trip ===");
check("shot 1 script text with quotes intact",
  cell(1, "script_portion") === shots[0].script_portion, JSON.stringify(cell(1, "script_portion")));
check("shot 1 multi-line image prompt intact",
  cell(1, "image_prompt") === shots[0].image_prompt, JSON.stringify(cell(1, "image_prompt")).slice(0, 80));
check("text overlay keeps its position",
  cell(1, "text_overlay") === "Panic or strategy? (bottom)", cell(1, "text_overlay"));
check("an empty overlay stays empty", cell(2, "text_overlay") === "", JSON.stringify(cell(2, "text_overlay")));
check("prompts are matched by shot number, not by order",
  cell(1, "video_prompt") === "Shot 1 prompt" && cell(2, "video_prompt") === "Shot 2 prompt, with a comma.",
  `${cell(1, "video_prompt")} | ${cell(2, "video_prompt")}`);
check("negative prompt lands in its own column",
  cell(2, "negative_prompt") === "text, watermark", cell(2, "negative_prompt"));
check("camera motion lands in its own column",
  cell(1, "camera_motion") === "slow push in", cell(1, "camera_motion"));
check("settings ride along on every row",
  cell(1, "model") === "seedance" && cell(2, "aspect_ratio") === "9:16" && cell(2, "quality") === "high",
  [cell(1, "model"), cell(2, "aspect_ratio"), cell(2, "quality")].join(","));
check("the script title (with Bangla) is on every row",
  cell(1, "script_title") === script.title && cell(2, "script_title") === script.title,
  cell(1, "script_title"));
check("the hook is on every row", cell(1, "hook") === script.hook);
check("the full body and voiceover travel with the shots",
  cell(1, "script_body") === script.body && cell(2, "script_voiceover") === script.voiceover,
  JSON.stringify(cell(1, "script_body")));
check("the export timestamp is recorded", cell(1, "exported_at").startsWith("2026-09-25"),
  cell(1, "exported_at"));

console.log("=== edge cases ===");
const scriptOnly = csv.buildProjectCsv({ script, shots: [], prompts: [] });
const soloRows = parse(scriptOnly);
check("a script with no storyboard still exports one row", soloRows.length === 2, `rows=${soloRows.length}`);
check("…and that row carries the script", soloRows[1][soloRows[0].indexOf("script_body")] === script.body);
const positional = parse(csv.buildProjectCsv({ script, shots, prompts: [
  { video_prompt: "first" }, { video_prompt: "second" },
] }));
check("unnumbered prompts fall back to shot order",
  positional[1][positional[0].indexOf("video_prompt")] === "first" &&
    positional[2][positional[0].indexOf("video_prompt")] === "second");

console.log("=== the filename ===");
check("names the job and the day",
  csv.csvFileName("The Researcher Who Quit OpenAI", Date.UTC(2026, 8, 25)) ===
    "content-os-the-researcher-who-quit-openai-2026-09-25.csv",
  csv.csvFileName("The Researcher Who Quit OpenAI", Date.UTC(2026, 8, 25)));
check("no slashes or spaces that break a download",
  !/[/\\ ]/.test(csv.csvFileName("a/b c", Date.UTC(2026, 8, 25))), csv.csvFileName("a/b c", Date.UTC(2026, 8, 25)));
check("a long title truncated mid-dash does not end on one",
  !csv.csvFileName("Script: The Researcher Who Quit OpenAI & Anthropic in One Week — Here's Why He's Not Panicking", Date.UTC(2026, 8, 24)).includes("--"),
  csv.csvFileName("Script: The Researcher Who Quit OpenAI & Anthropic in One Week — Here's Why He's Not Panicking", Date.UTC(2026, 8, 24)));
check("an empty title still gives a usable name",
  csv.csvFileName(undefined, Date.UTC(2026, 8, 25)) === "content-os-job-2026-09-25.csv",
  csv.csvFileName(undefined, Date.UTC(2026, 8, 25)));

console.log(`\nPASS ${pass}/${pass + fails.length}`);
if (fails.length) {
  console.log("FAILED:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
