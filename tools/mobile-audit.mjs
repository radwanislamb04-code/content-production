/**
 * Mobile audit at a real phone viewport.
 *
 * The browser sub-agent cannot resize its window, and every mobile claim made without a
 * 390px viewport is worthless — so this drives its own headless Chrome over CDP, emulates
 * a phone, injects the Cloudflare Access service-token headers, measures each page, and
 * keeps a screenshot of every one.
 *
 * Output: media-output/mobile-shots/<page>.png plus a JSON summary on stdout.
 *
 * Run from the repo root:  node tools/mobile-audit.mjs [path ...]
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const REPO = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/repo-check";
const OUT = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/mobile-shots";
const BASE = "https://content-production-worker.radwanislamb04.workers.dev";
// 9333 is taken by the browser tooling in this container; 9444 is free.
const PORT = 9444;
const WIDTH = Number(process.env.AUDIT_WIDTH || 390);
const HEIGHT = WIDTH >= 1000 ? 900 : WIDTH >= 700 ? 1024 : 844;

const token = JSON.parse(readFileSync(`${REPO}/../.secrets/access-service-token.json`, "utf8"));
const PATHS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "/",
      "/daily-brief",
      "/ideator",
      "/video-analyzer",
      "/script",
      "/storyboard",
      "/video-prompt",
      "/thumbnail-studio",
      "/calendar",
      "/board",
      "/projects",
      "/brief-history",
      "/library",
      "/templates",
      "/resources",
      "/characters",
      "/performance",
      "/content-score",
      "/hook-scoreboard",
      "/series",
      "/dm-manager",
      "/sources",
      "/autopilot",
      "/settings",
    ];

mkdirSync(OUT, { recursive: true });

import { openSync } from "node:fs";
const chromeLog = openSync("/tmp/chrome-mobile.log", "a");
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    `--user-data-dir=/tmp/chrome-mobile-${PORT}`,
    "about:blank",
  ],
  { stdio: ["ignore", chromeLog, chromeLog], detached: false },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function debuggerUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const json = await res.json();
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("headless Chrome did not expose a debugger in time (see /tmp/chrome-mobile.log)");
}

/** Minimal CDP client: send(method, params) over one flattened session. */
function client(ws) {
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
    } else if (msg.method === "Page.loadEventFired") {
      waiters.splice(0).forEach((w) => w());
    }
  });
  return {
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const message = { id: ++id, method, params };
        if (sessionId) message.sessionId = sessionId;
        pending.set(message.id, { resolve, reject });
        ws.send(JSON.stringify(message));
      }),
    onceLoad: (timeout = 25000) =>
      new Promise((resolve) => {
        const t = setTimeout(resolve, timeout);
        waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      }),
    close: () => ws.close(),
  };
}

const MEASURE = `(() => {
  const w = innerWidth;
  const inScroller = (el) => { let p = el.parentElement; while (p) { const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll") return true; p = p.parentElement; } return false; };
  const offenders = []; const small = [];
  document.querySelectorAll("main *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const cs = getComputedStyle(el);
    // Deliberate truncation (text-overflow: ellipsis) is not a layout bug — the design
    // says "cut this off with an ellipsis". Anything else past the edge is unreachable.
    let truncated = cs.textOverflow === "ellipsis" || el.classList.contains("truncate");
    if (!truncated) { let t = el.parentElement; let hops = 0;
      while (t && hops < 4) { const ts = getComputedStyle(t);
        if (ts.overflowX === "hidden" && ts.textOverflow === "ellipsis") { truncated = true; break; }
        t = t.parentElement; hops++; } }
    if (r.right > w + 1 && cs.position !== "fixed" && !inScroller(el) && !truncated) {
      const chain = []; let q = el.parentElement;
      while (q && chain.length < 4) { chain.push(String(q.className || q.tagName).slice(0, 30) + "{" + getComputedStyle(q).overflowX + "}"); q = q.parentElement; }
      offenders.push(el.tagName.toLowerCase() + "|[." + String(el.className).slice(0, 40) + "]|right=" + Math.round(r.right) + "| up: " + chain.join(" < "));
    }
    if ((el.tagName === "BUTTON" || el.tagName === "A") && r.height < 30) {
      small.push(Math.round(r.height) + "px|" + String(el.textContent || "").trim().slice(0, 20));
    }
  });
  const seen = new Map();
  small.forEach((s) => seen.set(s, (seen.get(s) || 0) + 1));
  return JSON.stringify({
    page: location.pathname,
    w: innerWidth,
    docScroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
    offenderCount: offenders.length,
    offenders: offenders.slice(0, 5),
    smallTaps: [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    smallTapTotal: small.length,
    mainText: (document.querySelector("main")?.innerText ?? "").replace(/\\s+/g, " ").slice(0, 90),
  });
})()`;

const url = await debuggerUrl();
const ws = new WebSocket(url);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", reject);
});
const cdp = client(ws);

const { targetInfos } = await cdp.send("Target.getTargets");
const page = targetInfos.find((t) => t.type === "page");
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });

await cdp.send("Page.enable", {}, sessionId);
await cdp.send("Runtime.enable", {}, sessionId);
// Without Network.enable the extra headers below are accepted and then ignored, and the
// navigation lands on the Cloudflare Access login page (which is what a first attempt did).
await cdp.send("Network.enable", {}, sessionId);
await cdp.send(
  "Emulation.setDeviceMetricsOverride",
  { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 700 },
  sessionId,
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
await cdp.send(
  "Network.setUserAgentOverride",
  { userAgent: UA, acceptLanguage: "en-US,en;q=0.9", platform: "MacIntel" },
  sessionId,
);
await cdp.send(
  "Network.setExtraHTTPHeaders",
  {
    headers: {
      "CF-Access-Client-Id": token.client_id,
      "CF-Access-Client-Secret": token.client_secret,
    },
  },
  sessionId,
);

const results = [];
for (const path of PATHS) {
  const loaded = cdp.onceLoad();
  await cdp.send("Page.navigate", { url: `${BASE}${path}` }, sessionId);
  await loaded;
  await sleep(2500); // let the page's own fetches land
  const { result } = await cdp.send(
    "Runtime.evaluate",
    { expression: MEASURE, returnByValue: true },
    sessionId,
  );
  const data = JSON.parse(result.value);
  if (data.page.startsWith("/cdn-cgi/")) {
    console.error(`  !! ${path} landed on the Access login page — headers did not apply`);
  }
  results.push(data);

  const shot = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: true },
    sessionId,
  );
  const slug = path === "/" ? "dashboard" : path.replace(/^\//, "").replace(/\//g, "-");
  writeFileSync(`${OUT}/${slug}.png`, Buffer.from(shot.data, "base64"));

  const flag = data.docScroll > data.w + 1 || data.offenderCount > 0 ? "  <-- OVERFLOW" : "";
  console.log(
    `${path.padEnd(20)} doc=${String(data.docScroll).padStart(4)} w=${data.w} offenders=${data.offenderCount} smallTaps=${data.smallTapTotal}${flag}`,
  );
  if (data.offenderCount) for (const o of data.offenders) console.log(`    ${o}`);
}

writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 2));
console.log(`\nscreenshots + summary.json -> ${OUT}`);
cdp.close();
chrome.kill("SIGTERM");
process.exit(0);
