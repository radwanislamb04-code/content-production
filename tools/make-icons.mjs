// One-off: cut the chosen app icon into the sizes the app actually serves.
//
// Not part of the build, and not runnable as-is: the outputs are committed as static
// assets, and this needs `jimp` (not a project dependency — `npm i --no-save jimp`).
// Kept so the PNGs in public/ are reproducible rather than mysterious.
//
// Two flavours on purpose:
//  - the 1024 master keeps its black tile: an app icon is a tile, and Meta's form wants one
//  - the in-app mark is keyed transparent, so it sits on the sidebar (#070a08 dark, #eef2ee
//    light) without a black square around it. A tile reads fine in a browser tab; it does
//    not read fine pasted into a light sidebar.
import { Jimp } from "jimp";

const SRC = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/img-mucjmj9k-46b23256.png";
const LIME = [0xad, 0xe7, 0x2a]; // the mark's own colour, read off the master

const master = await Jimp.read(SRC);
console.log(`source ${master.bitmap.width}x${master.bitmap.height}`);

// ---- the transparent in-app mark -------------------------------------------------
const mark = master.clone();
{
  const { data, width, height } = mark.bitmap;
  const peak = Math.max(...LIME);
  let kept = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.max(data[i], data[i + 1], data[i + 2]);
    if (lum < 8) {
      data[i + 3] = 0; // flat background -> fully transparent
      continue;
    }
    // Everything else is the mark, brightness intact. Scaling by the peak channel and
    // setting the colour to the mark's own lime keeps the anti-aliased edges soft instead
    // of turning them into a hard green/black fringe.
    data[i] = LIME[0];
    data[i + 1] = LIME[1];
    data[i + 2] = LIME[2];
    data[i + 3] = Math.min(255, Math.round((lum / peak) * 255));
    kept++;
  }
  console.log(`  mark: ${kept} opaque-ish of ${width * height} px`);
}

const jobs = [
  { img: mark, out: "public/content-os-logo.png", size: 256 }, // sidebar, shown at 32px
  { img: master, out: "public/favicon.png", size: 64 }, // a tile reads better in a tab
  { img: master, out: "public/apple-touch-icon.png", size: 180 }, // home screen: tile
];
for (const j of jobs) {
  const c = j.img.clone();
  c.resize({ w: j.size, h: j.size });
  await c.write(j.out);
  console.log(`  wrote ${j.out} at ${j.size}x${j.size}`);
}

// ---- how it will actually look --------------------------------------------------
const panel = new Jimp({ width: 640, height: 200, color: 0x070a08ff }); // sidebar, dark
for (let x = 320; x < 640; x++)
  for (let y = 0; y < 200; y++) panel.setPixelColor(0xeef2eeff, x, y); // sidebar, light
const m32 = mark.clone().resize({ w: 32, h: 32 });
const m64 = mark.clone().resize({ w: 64, h: 64 });
panel.composite(m64, 24, 68);
panel.composite(m32, 104, 84);
panel.composite(m64, 344, 68);
panel.composite(m32, 424, 84);
await panel.write("/tmp/sidebar-check.png");
console.log("  wrote /tmp/sidebar-check.png (dark panel left, light panel right)");
