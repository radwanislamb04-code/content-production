import { useState } from "react";
import { Card, PrimaryBtn, OutlineBtn, Textarea, Select } from "../ui";
import { Copy, RefreshCw, ChevronDown } from "lucide-react";

const PLATFORMS = ["Runway Gen-3", "Kling AI", "Pika Labs"];
const SHOTS = [
  {
    n: 1,
    desc: "Creator at desk, frustrated with scattered notes",
    prompt: "cinematic wide shot, creator at wooden desk, scattered notes, window light, film grain, muted color palette, slow dolly in",
    neg: "cartoon, plastic, oversaturated",
    motion: "Dolly In",
  },
  {
    n: 2,
    desc: "Overhead of notebook being written in",
    prompt: "overhead top-down shot, hands writing on notebook grid, warm desk lamp, minimal props, slow zoom",
    neg: "text glitch, extra fingers",
    motion: "Zoom Out",
  },
  {
    n: 3,
    desc: "Close-up notebook closes, creator smiles",
    prompt: "close-up notebook closing, hands, subtle smile in bokeh background, warm cinematic tone",
    neg: "harsh lighting, blur",
    motion: "Static",
  },
];

export function VideoPrompt() {
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border-l-[3px] border-l-lime bg-[rgba(82,255,46,0.05)] px-4 py-3 text-sm text-fg2">
        Storyboard imported — 3 shots ready
      </div>

      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`h-9 rounded-full px-4 text-sm ${
              platform === p
                ? "bg-lime font-bold text-app"
                : "border border-line text-fg2 hover:border-lime hover:text-lime"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Aspect Ratio">
            <Select defaultValue="9:16">
              <option>9:16</option>
              <option>16:9</option>
              <option>1:1</option>
            </Select>
          </Field>
          <Field label="Duration">
            <Select defaultValue="5s">
              <option>5s</option>
              <option>10s</option>
            </Select>
          </Field>
          <Field label="Quality">
            <Select defaultValue="High">
              <option>Standard</option>
              <option>High</option>
              <option>Cinematic</option>
            </Select>
          </Field>
          <Field label="Camera Motion">
            <Select defaultValue="Dolly In">
              <option>Static</option>
              <option>Dolly In</option>
              <option>Pan</option>
              <option>Zoom</option>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="space-y-3">
        {SHOTS.map((s) => (
          <ShotCard key={s.n} shot={s} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <OutlineBtn className="w-full">Copy All Prompts</OutlineBtn>
        <button className="text-xs text-mute hover:text-fg2">Export as Text File</button>
      </div>
    </div>
  );
}

function ShotCard({ shot }: { shot: (typeof SHOTS)[number] }) {
  const [neg, setNeg] = useState(false);
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="rounded-md bg-lime px-2 py-0.5 text-xs font-bold text-app">
          Shot {shot.n}
        </span>
        <div className="truncate text-xs text-mute">{shot.desc}</div>
      </div>
      <div className="relative">
        <Textarea defaultValue={shot.prompt} style={{ minHeight: 100 }} />
        <div className="absolute right-2 top-2 flex gap-1">
          <button className="grid h-7 w-7 place-items-center rounded-md bg-cardx text-mute hover:text-lime">
            <Copy size={13} />
          </button>
          <button className="grid h-7 w-7 place-items-center rounded-md bg-cardx text-mute hover:text-lime">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      <button
        onClick={() => setNeg(!neg)}
        className="mt-2 flex items-center gap-1 text-xs text-mute hover:text-fg2"
      >
        <ChevronDown size={14} className={neg ? "rotate-180" : ""} /> Negative Prompt
      </button>
      {neg && (
        <div className="mt-2">
          <Textarea defaultValue={shot.neg} style={{ minHeight: 60 }} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-[rgba(82,255,46,0.3)] bg-[rgba(82,255,46,0.05)] px-2 py-1 text-[11px] text-lime">
          9:16 · 5s
        </span>
        <span className="rounded-full border border-[rgba(82,255,46,0.3)] bg-[rgba(82,255,46,0.05)] px-2 py-1 text-[11px] text-lime">
          {shot.motion}
        </span>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-mute">{label}</div>
      {children}
    </div>
  );
}
