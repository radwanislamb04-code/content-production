// One-off: cut the chosen app icon into the sizes the app actually serves.
//
// Not part of the build, and not runnable as-is: the outputs are committed as static
// assets, and this needs `jimp` (not a project dependency — `npm i --no-save jimp`).
// Kept so the PNGs in public/ are reproducible rather than mysterious.
// The master is the 1024x1024 the App Store / Meta app form wants.
import { Jimp } from "jimp";

const SRC = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/img-mucjmj9k-46b23256.png";

const jobs = [
  // the sidebar mark, shown at 32px — 4x for retina
  { out: "public/content-os-logo.png", size: 256 },
  { out: "public/favicon.png", size: 64 },
  { out: "public/apple-touch-icon.png", size: 180 },
];

const img = await Jimp.read(SRC);
console.log(`source ${img.bitmap.width}x${img.bitmap.height}`);
for (const j of jobs) {
  const copy = img.clone();
  copy.resize({ w: j.size, h: j.size });
  await copy.write(j.out);
  console.log(`  wrote ${j.out} at ${j.size}x${j.size}`);
}
