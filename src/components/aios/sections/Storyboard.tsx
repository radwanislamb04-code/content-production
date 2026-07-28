import { useState } from "react";
import { Card, PrimaryBtn, GhostBtn, Textarea, Select, Input } from "../ui";
import { Plus, GripVertical, Copy, RefreshCw } from "lucide-react";

const SHOTS = [
  {
    n: 1,
    duration: "0-5s",
    portion: "You've been planning your week wrong.",
    visual: "Creator sits at desk, looks at scattered notes, frustrated",
    prompt: "cinematic wide, moody desk, scattered notes, single window light, film grain",
    overlay: "PLANNING WRONG?",
    voice: "You've been planning your week wrong.",
    mood: "Reflective",
  },
  {
    n: 2,
    duration: "5-15s",
    portion: "Here's the 20-minute ritual I use every Sunday.",
    visual: "Overhead of notebook with clean weekly grid being filled in",
    prompt: "overhead shot, hands writing weekly plan, clean minimal desk, warm light",
    overlay: "20-MIN RITUAL",
    voice: "Here's the 20-minute ritual…",
    mood: "Focused",
  },
  {
    n: 3,
    duration: "15-30s",
    portion: "Every post for the week planned in advance.",
    visual: "Zoom on completed plan, creator smiles, closes notebook",
    prompt: "close-up notebook with weekly plan, hands close book, warm cinematic",
    overlay: "DONE. WEEK PLANNED.",
    voice: "Every post for the week — planned.",
    mood: "Satisfied",
  },
];

export function Storyboard() {
  const [chars] = useState([
    { name: "Enzo (host)", active: true },
    { name: "Guest expert", active: false },
  ]);
  const [generated, setGenerated] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-l-[3px] border-l-lime bg-[rgba(82,255,46,0.05)] px-4 py-3 text-sm text-fg2">
        Script imported from Hook + Script.{" "}
        <button className="ml-2 text-lime hover:text-lime2">View Full</button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-fg">Characters</div>
            <button className="grid h-7 w-7 place-items-center rounded-md bg-surface text-lime hover:bg-[rgba(82,255,46,0.08)]">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-2">
            {chars.map((c) => (
              <div key={c.name} className="rounded-lg border border-line bg-cardx p-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-line" />
                  <div className="flex-1 text-[13px] text-fg">{c.name}</div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-mute">In use</span>
                  <button
                    className={`h-5 w-9 rounded-full transition ${
                      c.active ? "bg-lime" : "bg-line"
                    }`}
                  >
                    <span
                      className={`block h-4 w-4 rounded-full bg-app transition ${
                        c.active ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
            <button className="grid w-full place-items-center rounded-lg border border-dashed border-line2 py-4 text-mute hover:border-lime hover:text-lime">
              <Plus size={16} />
              <span className="mt-1 text-xs">Add New</span>
            </button>
          </div>
        </Card>

        <div>
          {!generated ? (
            <Card className="p-10 text-center">
              <div className="text-sm text-fg2">
                AI will decide shot count based on script length.
              </div>
              <PrimaryBtn className="mt-4" onClick={() => setGenerated(true)}>
                Generate Shots
              </PrimaryBtn>
            </Card>
          ) : (
            <div className="space-y-4">
              {SHOTS.map((s) => (
                <Card key={s.n} className="overflow-hidden">
                  <div className="flex items-center justify-between bg-surface px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-lime px-2 py-0.5 text-xs font-bold text-app">
                        Shot {s.n}
                      </span>
                      <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-mute">
                        {s.duration}
                      </span>
                    </div>
                    <GripVertical size={16} className="text-mute" />
                  </div>
                  <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
                    <div className="space-y-3">
                      <Field label="Script Portion">
                        <div className="rounded-lg bg-[#070A08] p-2.5 text-[13px] text-fg2">
                          {s.portion}
                        </div>
                      </Field>
                      <Field label="Visual Description">
                        <Textarea defaultValue={s.visual} style={{ minHeight: 70 }} />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Camera Angle">
                          <Select defaultValue="Wide">
                            <option>Wide</option>
                            <option>Medium</option>
                            <option>Close-up</option>
                            <option>Overhead</option>
                          </Select>
                        </Field>
                        <Field label="Transition">
                          <Select defaultValue="Cut">
                            <option>Cut</option>
                            <option>Fade</option>
                            <option>Whip pan</option>
                          </Select>
                        </Field>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Field label="Image Prompt (Midjourney/Flux)">
                        <div className="relative">
                          <Textarea defaultValue={s.prompt} style={{ minHeight: 90 }} />
                          <button className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-cardx text-mute hover:text-lime">
                            <Copy size={13} />
                          </button>
                        </div>
                      </Field>
                      <Field label="Text Overlay">
                        <Input defaultValue={s.overlay} />
                      </Field>
                      <div className="flex gap-2">
                        {["Top", "Center", "Bottom"].map((p, i) => (
                          <button
                            key={p}
                            className={`h-8 flex-1 rounded-md text-xs ${
                              i === 1
                                ? "bg-lime font-bold text-app"
                                : "border border-line text-fg2"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                      <Field label="Voiceover">
                        <Textarea defaultValue={s.voice} style={{ minHeight: 60 }} />
                      </Field>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-surface px-4 py-2">
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg2">
                      {s.mood}
                    </span>
                    <GhostBtn>
                      <RefreshCw size={12} /> Regenerate Shot
                    </GhostBtn>
                  </div>
                </Card>
              ))}
              <PrimaryBtn className="h-12 w-full">
                Send All to Video Prompt →
              </PrimaryBtn>
            </div>
          )}
        </div>
      </div>
    </div>
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
