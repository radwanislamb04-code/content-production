// One-off: render the logo at several lightness steps, on both themes, so "brighter"
// can be judged by looking rather than by a number.
//
// Not part of the build. Needs `jimp` (`npm i --no-save jimp`), like make-icons.mjs.
//
// Output: media-output/logo-brightness-candidates.png — rows are lightness steps, and
// each row shows the mark at sidebar size (32px) and icon size (96px) on the app's dark
// background (#070a08) and its light one (#eef2ee), which is where a pale lime dies.
import { Jimp } from "jimp";

const SRC = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/img-mucjmj9k-46b23256.png";
const OUT = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/logo-brightness-candidates.png";

const DARK = 0x070a08ff;
const LIGHT = 0xeef2eeff;
const STEPS = [
  { label: "now L58", lightness: 0.58 },
  { label: "L64", lightness: 0.64 },
  { label: "L70", lightness: 0.70 },
  { label: "L76", lightness: 0.76 },
];

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

function recolour(image, lightness) {
  const out = image.clone();
  out.scan(0, 0, out.bitmap.width, out.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    const r = d[idx], g = d[idx + 1], b = d[idx + 2];
    if (Math.max(r, g, b) < 12) return; // background stays background
    const [h] = rgbToHsl(r, g, b);
    const [nr, ng, nb] = hslToRgb(h, 1.0, lightness);
    d[idx] = nr; d[idx + 1] = ng; d[idx + 2] = nb;
  });
  return out;
}

/** Alpha from luminance, exactly as make-icons.mjs does it. */
function transparent(image) {
  const copy = image.clone();
  copy.scan(0, 0, copy.bitmap.width, copy.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    const lum = Math.max(d[idx], d[idx + 1], d[idx + 2]);
    if (lum < 8) { d[idx + 3] = 0; return; }
    d[idx + 3] = Math.min(255, Math.round((lum / 251) * 255));
  });
  return copy;
}

const src = await Jimp.read(SRC);

// Canvas: label column + 4 marks per row (32 dark, 96 dark, 32 light, 96 light)
const LABEL_W = 90;
const COL = 150;
const ROW = 150;
const canvas = new Jimp({ width: LABEL_W + COL * 4, height: ROW * STEPS.length, color: 0x1a1a1aff });

const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
const luminance = (rgb) => Math.round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
/** The fill colour: the most common fully-opaque pixel, not the brightest one. */
const luminanceOf = (image) => {
  const counts = new Map();
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    if (d[idx + 3] < 250 || Math.max(d[idx], d[idx+1], d[idx+2]) < 100) return;
    const key = `${d[idx]},${d[idx + 1]},${d[idx + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return (top?.[0] ?? "0,0,0").split(",").map(Number);
};

for (const [row, step] of STEPS.entries()) {
  const coloured = recolour(src, step.lightness);
  const sample = luminanceOf(coloured);
  console.log(`${step.label.padEnd(9)} ${hex(sample)}  relative luminance ${luminance(sample)}`);

  const pieces = [
    { img: transparent(coloured).resize({ w: 32, h: 32 }), bg: DARK },
    { img: transparent(coloured).resize({ w: 96, h: 96 }), bg: DARK },
    { img: transparent(coloured).resize({ w: 32, h: 32 }), bg: LIGHT },
    { img: transparent(coloured).resize({ w: 96, h: 96 }), bg: LIGHT },
  ];
  for (const [col, piece] of pieces.entries()) {
    const tile = new Jimp({ width: COL, height: ROW, color: piece.bg });
    const x = Math.round((COL - piece.img.bitmap.width) / 2);
    const y = Math.round((ROW - piece.img.bitmap.height) / 2);
    tile.composite(piece.img, x, y);
    canvas.composite(tile, LABEL_W + COL * col, ROW * row);
  }
}

await canvas.write(OUT);
console.log(`wrote ${OUT}`);
