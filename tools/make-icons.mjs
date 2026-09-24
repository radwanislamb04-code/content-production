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
const OUT_MASTER = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/img-mucjmj9k-46b23256-bright.png";

/**
 * Where the mark lands: same hue, fully saturated, lifted lightness.
 *
 * Chosen by rendering candidates side by side and looking at them, because "brighter" is a
 * judgement, not a formula. Lifting lightness alone (#cff183) went pale and lost the punch;
 * this keeps the mark's own hue at 100% saturation, which reads brighter *and* more vivid.
 */
const TARGET_SATURATION = 1.0;
const TARGET_LIGHTNESS = 0.58;

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
function brighten(image) {
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx], g = this.bitmap.data[idx + 1], b = this.bitmap.data[idx + 2];
    if (Math.max(r, g, b) < 12) return; // background stays background
    const [h] = rgbToHsl(r, g, b);
    const [nr, ng, nb] = hslToRgb(h, TARGET_SATURATION, TARGET_LIGHTNESS);
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

const jobs = [
  // The sidebar mark, drawn at 32px — transparent, SAME colours as the icon.
  { out: "public/content-os-logo.png", size: 256, transparent: true },
  // A favicon is a tile: it must read on a light tab bar and a dark one.
  { out: "public/favicon.png", size: 64, transparent: false },
  { out: "public/apple-touch-icon.png", size: 180, transparent: false },
];

for (const job of jobs) {
  const img = job.transparent ? await transparentMark(job.size) : master.clone().resize({ w: job.size, h: job.size });
  await img.write(job.out);
  console.log(`  wrote ${job.out} (${job.size}x${job.size})`);
}
console.log(`  wrote ${OUT_MASTER} (1024x1024 master, for the Meta app form)`);
