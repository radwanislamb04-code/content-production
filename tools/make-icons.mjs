// One-off: cut the chosen app icon into the sizes the app actually serves, and lift the
// mark's brightness on the way.
//
// Not part of the build, and not runnable as-is: the outputs are committed as static
// assets and this needs `jimp` (not a project dependency — `npm i --no-save jimp`).
// Kept so the PNGs in public/ are reproducible rather than mysterious.
//
// The mark is flat — one lime colour on black — so "brighter" is a colour change, not a
// redraw. Doing it by pixel keeps the silhouette, the stroke weights and the anti-aliasing
// exactly as the owner approved them; an AI pass would re-draw the shape and lose the small
// sizes. Brightness is lifted in HSL (hue and saturation kept) so it reads as the same
// brand green, only more luminous.
import { Jimp } from "jimp";

const SRC = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/img-mucjmj9k-46b23256.png";
// A new master file rather than an overwrite: the previous one (-bright) is what the
// owner may already have handed to the Meta app form, so both stay recoverable.
const OUT_MASTER = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/img-mucjmj9k-46b23256-brighter.png";

/**
 * Where the mark lands: same hue, fully saturated, lifted lightness.
 *
 * Chosen by rendering candidates side by side and looking at them, because "brighter" is a
 * judgement, not a formula. Lifting lightness alone (#cff183) went pale and lost the punch;
 * this keeps the mark's own hue at 100% saturation, which reads brighter *and* more vivid.
 *
 * Second pass (owner asked for brighter again): 0.58 → 0.70, i.e. #beff29 (luminance 226)
 * → #d0ff66 (234). Candidates 0.64 / 0.70 / 0.76 were drawn at 32px and 96px on both the
 * dark (#070a08) and light (#eef2ee) app backgrounds — see brightness-preview.mjs and
 * media-output/logo-brightness-candidates.png. 0.70 is the last step where the 32px sidebar
 * mark still holds up on the light theme; 0.76 goes pale there.
 */
const TARGET_SATURATION = 1.0;
const TARGET_LIGHTNESS = 0.70;

/**
 * The tab icon gets its own, brighter target — and its own framing.
 *
 * The in-app mark is capped at 0.70 because it also has to sit on the light app
 * background, where anything paler washes out. A favicon never does: it is always drawn
 * on its own black tile, so that limit does not apply to it. Two things were making the
 * tab icon read dimmer than the logo next to it:
 *
 *   1. colour — at 16px the lime strokes are averaged with the black tile they sit on,
 *      so the same #d0ff66 lands visibly darker in a tab than in the sidebar;
 *   2. framing — the master leaves the mark at ~55% of the canvas, which shrinks to an
 *      8px glyph in a 16px tab.
 *
 * Hence: brighter lime, and the mark cropped to fill most of the tile.
 */
const FAVICON_LIGHTNESS = 0.82;
const FAVICON_FILL = 0.82;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/** Re-colour everything that is not background, keeping the hue it was drawn with. */
function brighten(image, lightness = TARGET_LIGHTNESS) {
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx], g = this.bitmap.data[idx + 1], b = this.bitmap.data[idx + 2];
    if (Math.max(r, g, b) < 12) return; // background stays background
    const [h] = rgbToHsl(r, g, b);
    const [nr, ng, nb] = hslToRgb(h, TARGET_SATURATION, lightness);
    this.bitmap.data[idx] = nr;
    this.bitmap.data[idx + 1] = ng;
    this.bitmap.data[idx + 2] = nb;
  });
  return image;
}

const master = brighten(await Jimp.read(SRC));
await master.write(OUT_MASTER);

/** The in-app mark: background dropped, colour kept, so it sits on any theme. */
async function transparentMark(size) {
  const copy = master.clone();
  copy.scan(0, 0, copy.bitmap.width, copy.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    const r = d[idx], g = d[idx + 1], b = d[idx + 2];
    const lum = Math.max(r, g, b);
    if (lum < 8) { d[idx + 3] = 0; return; }
    d[idx + 3] = Math.min(255, Math.round((lum / 251) * 255));
  });
  copy.resize({ w: size, h: size });
  return copy;
}

/** Where the mark sits on a canvas — everything brighter than the background. */
function markBox(image) {
  let x0 = image.bitmap.width, y0 = image.bitmap.height, x1 = -1, y1 = -1;
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    if (Math.max(d[idx], d[idx + 1], d[idx + 2]) < 100) return;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  });
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * A square tile with the mark occupying `fill` of its side, black behind it.
 * Cropping rather than scaling, so the mark keeps the exact shape it was drawn with.
 */
function tile(image, size, fill) {
  const box = markBox(image);
  const side = Math.max(box.w, box.h) / fill;
  const cx = (box.x0 + box.x1 + 1) / 2;
  const cy = (box.y0 + box.y1 + 1) / 2;
  const x = Math.round(Math.min(Math.max(cx - side / 2, 0), Math.max(image.bitmap.width - side, 0)));
  const y = Math.round(Math.min(Math.max(cy - side / 2, 0), Math.max(image.bitmap.height - side, 0)));
  const w = Math.min(Math.round(side), image.bitmap.width - x);
  const h = Math.min(Math.round(side), image.bitmap.height - y);
  return image.clone().crop({ x, y, w, h }).resize({ w: size, h: size });
}

const jobs = [
  // The sidebar mark, drawn at 32px — transparent, SAME colours as the icon.
  { out: "public/content-os-logo.png", size: 256, transparent: true },
  // The tab icon: brighter, and framed to fill the tile (see FAVICON_* above).
  { out: "public/favicon.png", size: 64, tile: FAVICON_FILL, lightness: FAVICON_LIGHTNESS },
  // Still the app's colour and the app's framing — an iOS home screen icon is large
  // enough to read without either change, and it was signed off as it is.
  { out: "public/apple-touch-icon.png", size: 180, transparent: false },
];

for (const job of jobs) {
  const source = job.lightness ? brighten(await Jimp.read(SRC), job.lightness) : master;
  const img = job.tile
    ? tile(source, job.size, job.tile)
    : job.transparent
      ? await transparentMark(job.size)
      : source.clone().resize({ w: job.size, h: job.size });
  await img.write(job.out);
  console.log(`  wrote ${job.out} (${job.size}x${job.size})`);
}
console.log(`  wrote ${OUT_MASTER} (1024x1024 master, for the Meta app form)`);
