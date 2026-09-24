import { Jimp } from "jimp";
const SRC = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/img-mucjmj9k-46b23256.png";
const OUT = "/home/wuying/.accio/accounts/7098022703/agents/DID-82AD6B-9282AD6BU1789667-8704-896742/project/media-output/logo-small-light-zoom.png";
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b);let h=0,s=0;const l=(max+min)/2;if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);if(max===r)h=((g-b)/d+(g<b?6:0))/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6;}return[h,s,l];}
function hslToRgb(h,s,l){if(s===0){const v=Math.round(l*255);return[v,v,v];}const q=l<0.5?l*(1+s):l+s-l*s;const p=2*l-q;const f=(t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};return[Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];}
const src = await Jimp.read(SRC);
async function mark(l, bg) {
  const img = src.clone();
  img.scan(0,0,img.bitmap.width,img.bitmap.height,function(x,y,idx){const d=this.bitmap.data;const r=d[idx],g=d[idx+1],b=d[idx+2];if(Math.max(r,g,b)<12)return;const[h]=rgbToHsl(r,g,b);const[nr,ng,nb]=hslToRgb(h,1.0,l);d[idx]=nr;d[idx+1]=ng;d[idx+2]=nb;});
  img.scan(0,0,img.bitmap.width,img.bitmap.height,function(x,y,idx){const d=this.bitmap.data;const lum=Math.max(d[idx],d[idx+1],d[idx+2]);if(lum<8){d[idx+3]=0;return;}d[idx+3]=Math.min(255,Math.round((lum/251)*255));});
  img.resize({w:32,h:32});
  const tile = new Jimp({width:180,height:180,color:bg});
  tile.composite(img.resize({w:128,h:128}),26,26);
  return tile;
}
const canvas = new Jimp({width:360,height:360,color:0x00000000});
canvas.composite(await mark(0.58,0xeef2eeff),0,0);
canvas.composite(await mark(0.70,0xeef2eeff),180,0);
canvas.composite(await mark(0.58,0x070a08ff),0,180);
canvas.composite(await mark(0.70,0x070a08ff),180,180);
await canvas.write(OUT);
console.log("wrote", OUT, "— top row: L58 | L70 on LIGHT, bottom row: same on DARK (all drawn at 32px then magnified 4x)");
