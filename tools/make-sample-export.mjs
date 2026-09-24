// Build a real CSV from the live newest chain, using the shipped module.
import { readFileSync, writeFileSync } from "node:fs";
import { rolldown } from "rolldown";
const repo = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/repo-check";
const out = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output";
process.chdir(repo);
const bundle = await rolldown({ input: "src/lib/csv-export.ts" });
const { output } = await bundle.generate({ format: "cjs" });
const mod = { exports: {} };
new Function("module", "exports", "require", output[0].code)(mod, mod.exports, () => {});
const { buildProjectCsv, csvFileName } = mod.exports;

const TOK = JSON.parse(readFileSync("../.secrets/access-service-token.json", "utf8"));
const H = { "CF-Access-Client-Id": TOK.client_id, "CF-Access-Client-Secret": TOK.client_secret, "User-Agent": "Mozilla/5.0", Accept: "application/json" };
const BASE = "https://content-production-worker.radwanislamb04.workers.dev";
const get = async (p) => (await fetch(BASE + p, { headers: H })).json();

const boards = await get("/api/scripts-list?type=storyboard");
const board = boards[0];
const row = await get("/api/library/storyboard/" + board.id);
const shots = (typeof row.content === "string" ? JSON.parse(row.content) : row.content)?.shots ?? [];
let scriptPart = {};
if (row.source_id) {
  const srow = await get("/api/library/script/" + row.source_id);
  const c = typeof srow.content === "string" ? JSON.parse(srow.content) : srow.content;
  const hooks = Array.isArray(c?.hooks) ? c.hooks : [];
  const i = typeof c?.selected_hook_index === "number" ? c.selected_hook_index : 0;
  scriptPart = { id: srow.id, title: srow.title, hook: hooks[i]?.spoken, body: c?.body, voiceover: c?.voiceover_script, cta: c?.cta };
}
const promptRows = await get("/api/scripts-list?type=video_prompt");
const match = promptRows.find((r) => r.source_id === board.id);
let prompts = [], model, aspectRatio, quality;
if (match) {
  const prow = await get("/api/library/video_prompt/" + match.id);
  const p = typeof prow.content === "string" ? JSON.parse(prow.content) : prow.content;
  prompts = p?.prompts ?? []; model = p?.model; aspectRatio = p?.aspect_ratio; quality = p?.quality;
}
const csv = buildProjectCsv({ script: scriptPart, shots, prompts, model, aspectRatio, quality });
const name = csvFileName(scriptPart.title);
writeFileSync(`${out}/export-sample-${name}`, csv);
console.log("storyboard:", board.title);
console.log("script row:", row.source_id ? "linked" : "none", "| shots:", shots.length, "| prompts:", prompts.length, "| model:", model ?? "-");
console.log("file:", `export-sample-${name}`, "| bytes:", Buffer.byteLength(csv), "| lines:", csv.split("\r\n").length - 1);
console.log("--- first 240 chars ---");
console.log(csv.slice(0, 240).replace(/\r?\n/g, "⏎"));
