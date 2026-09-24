// One-off: how the tab icon actually reads at tab size, so "brighten the favicon" can
// be decided by looking instead of by picking a number.
//
// The app's mark and the tab icon are not the same problem. The mark sits at 32px in the
// sidebar on a surface you chose; the favicon is a 64px tile that the browser shrinks to
// 16px and draws on whatever colour the tab bar happens to be — so thin lime strokes get
// averaged with their own black background and land much dimmer than the same colour
// looks in the app.
//
// Run: node tools/favicon-preview.mjs   (needs `npm i --no-save jimp`)
import { Jimp } from "jimp";

const ROOT = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project";
const SRC_MASTER = `${ROOT}/media-output/img-mucjmj9k-46b23256-brighter.png`;
const OUT = `${ROOT}/media-output/favicon-candidates.png`;

const TAB_LIGHT = 0xf1f3f4ff; // Chrome's light tab strip
const TAB_DARK = 0x202124ff; // Chrome's dark tab strip

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

/** Recolour just the mark: everything brighter than the black tile. */
function recolour(image, lightness, white = false) {
  const out = image.clone();
  out.scan(0, 0, out.bitmap.width, out.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    const r = d[idx], g = d[idx + 1], b = d[idx + 2];
    if (Math.max(r, g, b) < 12) return;
    const [nr, ng, nb] = white ? [255, 255, 255] : hslToRgb(rgbToHsl(r, g, b)[0], 1.0, lightness);
    d[idx] = nr; d[idx + 1] = ng; d[idx + 2] = nb;
  });
  return out;
}

/** Drop the black tile, keeping the mark. */
function transparent(image) {
  const out = image.clone();
  out.scan(0, 0, out.bitmap.width, out.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    const lum = Math.max(d[idx], d[idx + 1], d[idx + 2]);
    if (lum < 8) { d[idx + 3] = 0; return; }
    d[idx + 3] = Math.min(255, Math.round((lum / 251) * 255));
  });
  return out;
}

/** Fatten the mark by one pixel: a 3x3 pass that keeps the brightest opaque pixel. */
function fatten(image) {
  const { width, height } = image.bitmap;
  const src = Buffer.from(image.bitmap.data);
  const out = image.clone();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = null, bestScore = -1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const i = (ny * width + nx) * 4;
          if (src[i + 3] < 40) continue;
          const score = src[i] + src[i + 1] + src[i + 2];
          if (score > bestScore) { bestScore = score; best = i; }
        }
      }
      const o = (y * width + x) * 4;
      if (best === null) continue;
      out.bitmap.data[o] = src[best];
      out.bitmap.data[o + 1] = src[best + 1];
      out.bitmap.data[o + 2] = src[best + 2];
      out.bitmap.data[o + 3] = Math.max(src[o + 3], 255);
    }
  }
  return out;
}

const master = await Jimp.read(SRC_MASTER);
const tile = (image) => image.resize({ w: 64, h: 64 });

const VARIANTS = [
  { label: "now  #d0ff66 tile", img: () => tile(recolour(master, 0.70)) },
  { label: "L82   tile", img: () => tile(recolour(master, 0.82)) },
  { label: "L92   tile", img: () => tile(recolour(master, 0.92)) },
  { label: "white tile", img: () => tile(recolour(master, 1, true)) },
  { label: "L82   fatten", img: () => tile(fatten(recolour(master, 0.82))) },
  { label: "L82   no tile", img: () => tile(transparent(recolour(master, 0.82))) },
];

const LABEL_W = 170;
const COL = 110;
const ROW = 96;
const canvas = new Jimp({ width: LABEL_W + COL * 4, height: ROW * VARIANTS.length, color: 0x3a3a3aff });

for (const [row, variant] of VARIANTS.entries()) {
  const image = variant.img();
  for (const [col, [size, bg]] of [
    [16, TAB_LIGHT], [32, TAB_LIGHT], [16, TAB_DARK], [32, TAB_DARK],
  ].entries()) {
    const cell = new Jimp({ width: COL, height: ROW, color: bg });
    cell.composite(image.clone().resize({ w: size, h: size }),
      Math.round((COL - size) / 2), Math.round((ROW - size) / 2));
    canvas.composite(cell, LABEL_W + COL * col, ROW * row);
  }
}

await canvas.write(OUT);
console.log(`wrote ${OUT}`);
console.log("columns: 16px light tab · 32px light tab · 16px dark tab · 32px dark tab");
for (const v of VARIANTS) console.log("  row:", v.label);
