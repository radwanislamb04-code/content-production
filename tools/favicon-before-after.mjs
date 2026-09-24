// One-off: the tab icon, before and after this change, at the size a tab actually draws
// it. "Before" is rebuilt from the master rather than kept as a file: the old favicon was
// the master resized with no crop and no brightness override (see make-icons.mjs).
//
// Run: node tools/favicon-before-after.mjs   (needs `npm i --no-save jimp`)
import { Jimp } from "jimp";

const ROOT = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project";
const OUT = `${ROOT}/media-output/favicon-before-after.png`;
const SRC = `${ROOT}/media-output/img-mucjmj9k-46b23256-brighter.png`;
const TAB = { light: 0xf1f3f4ff, dark: 0x202124ff };

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

function recolour(image, lightness) {
  const out = image.clone();
  out.scan(0, 0, out.bitmap.width, out.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    if (Math.max(d[idx], d[idx + 1], d[idx + 2]) < 12) return;
    const [nr, ng, nb] = hslToRgb(rgbToHsl(d[idx], d[idx + 1], d[idx + 2])[0], 1.0, lightness);
    d[idx] = nr; d[idx + 1] = ng; d[idx + 2] = nb;
  });
  return out;
}

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

const master = await Jimp.read(SRC);
const before = recolour(master, 0.70).resize({ w: 64, h: 64 });   // as shipped yesterday
const after = tile(recolour(master, 0.82), 64, 0.82);             // as shipped now

const rows = [["before  #d0ff66, mark 55%", before], ["after   #e3ffa3, mark 81%", after]];
const LABEL_W = 230, COL = 110, ROW = 96;
const canvas = new Jimp({ width: LABEL_W + COL * 4, height: ROW * rows.length, color: 0x3a3a3aff });
for (const [i, [, image]] of rows.entries()) {
  const sizes = [[16, TAB.light], [32, TAB.light], [16, TAB.dark], [32, TAB.dark]];
  for (const [col, [size, bg]] of sizes.entries()) {
    const cell = new Jimp({ width: COL, height: ROW, color: bg });
    cell.composite(image.clone().resize({ w: size, h: size }),
      Math.round((COL - size) / 2), Math.round((ROW - size) / 2));
    canvas.composite(cell, LABEL_W + COL * col, ROW * i);
  }
}
await canvas.write(OUT);
console.log(`wrote ${OUT}`);
console.log("columns: 16px light tab · 32px light tab · 16px dark tab · 32px dark tab");
