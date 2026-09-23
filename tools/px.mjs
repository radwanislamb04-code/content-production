import { Jimp } from "jimp";
const P = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/repo-check/public/content-os-logo.png";
const im = await Jimp.read(P);
const hex = (x, y) => "#" + im.getPixelColor(x, y).toString(16).padStart(8, "0").slice(0, 6);
console.log("  corner TL", hex(0, 0), " TR", hex(255, 0), " BL", hex(0, 255), " BR", hex(255, 255));
console.log("  centre   ", hex(128, 128));
const { data } = im.bitmap;
const seen = new Map();
for (let i = 0; i < data.length; i += 4) {
  const k = [data[i], data[i + 1], data[i + 2]].join(",");
  seen.set(k, (seen.get(k) ?? 0) + 1);
}
const top = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log("  top colours:", top.map(([k, n]) => {
  const [r, g, b] = k.split(",").map(Number);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("") + ` (${n})`;
}).join("  "));
