import { useState } from "react";
import { Card, PrimaryBtn, OutlineBtn, GhostBtn, Textarea, Select, Input } from "../ui";
import { RefreshCw, Copy, Star, X } from "lucide-react";

const LENGTHS = ["15 sec", "30 sec", "60 sec", "Custom"];
const HOOKS = [
  { style: "Curiosity", text: "You've been planning your week wrong.", why: "Pattern interrupt + implied fix" },
  { style: "Contrarian", text: "Stop batch-editing. Try this 20-min ritual.", why: "Rejects common advice", recommended: true },
  { style: "Story", text: "I lost 3 months until this one change…", why: "Personal stakes hook" },
];

export function ScriptHook() {
  const [len, setLen] = useState("30 sec");
  const [selHook, setSelHook] = useState(1);
  const [tags, setTags] = useState(["#creator", "#weeklyplan", "#workflow"]);
  const [tagAdd, setTagAdd] = useState("");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-cardx px-4 py-3 text-sm">
        <span className="text-mute">Selected Idea:</span>{" "}
        <span className="italic text-lime">
          The 20-minute weekly planning ritual for solo creators
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase text-mute">Idea</div>
          <div className="mt-2 rounded-lg border border-line bg-surface p-3 text-sm text-fg">
            The 20-minute weekly planning ritual for solo creators
          </div>
          <button className="mt-1 text-[11px] text-mute hover:text-fg2">Change Idea</button>

          <div className="mt-5 space-y-3">
            <div>
              <div className="mb-1 text-xs text-mute">Voice / Tone</div>
              <Select defaultValue="Educational">
                <option>Casual</option>
                <option>Educational</option>
                <option>Motivational</option>
                <option>Storytelling</option>
                <option>Shocking</option>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs text-mute">Script Length</div>
              <div className="flex flex-wrap gap-2">
                {LENGTHS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLen(l)}
                    className={`h-9 rounded-full px-3 text-xs ${
                      len === l
                        ? "bg-lime font-bold text-app"
                        : "border border-line text-fg2 hover:border-lime hover:text-lime"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-mute">Language</div>
              <Select defaultValue="English">
                <option>English</option>
                <option>Bengali</option>
                <option>Spanish</option>
                <option>French</option>
              </Select>
            </div>
          </div>

          <PrimaryBtn className="mt-5 w-full">Generate Everything</PrimaryBtn>

          <div className="my-4 h-px bg-line" />
          <div className="mb-2 text-xs text-mute">Regenerate Individual Sections</div>
          <div className="grid grid-cols-2 gap-2">
            {["Hooks", "Script", "Title", "Desc", "Tags"].map((s) => (
              <OutlineBtn key={s} className="h-9 px-2 text-xs">
                <RefreshCw size={12} /> {s}
              </OutlineBtn>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-fg">🎣 Hooks</div>
              <div className="flex gap-1">
                <IconBtn><RefreshCw size={14} /></IconBtn>
                <IconBtn><Copy size={14} /></IconBtn>
              </div>
            </div>
            <div className="space-y-2">
              {HOOKS.map((h, i) => {
                const isSel = i === selHook;
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-3.5 transition-all ${
                      isSel
                        ? "border-lime shadow-[0_0_16px_rgba(82,255,46,0.2)] bg-surface"
                        : "border-line bg-surface"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-lime text-xs font-bold text-app">
                        {i + 1}
                      </span>
                      <span className="rounded-full border border-line bg-cardx px-2 py-0.5 text-[11px] text-fg2">
                        {h.style}
                      </span>
                      {h.recommended && (
                        <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-lime">
                          <Star size={12} fill="#52FF2E" /> Recommended
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-[15px] text-fg">{h.text}</div>
                    <div className="mt-1 text-xs italic text-fg2">Why it works: {h.why}</div>
                    <div className="mt-3 flex justify-end gap-2">
                      <GhostBtn className="text-fg2 hover:text-fg">Copy</GhostBtn>
                      <button
                        onClick={() => setSelHook(i)}
                        className="h-9 rounded-md bg-[rgba(82,255,46,0.08)] px-3 text-sm font-semibold text-lime"
                      >
                        {isSel ? "✓ Selected" : "Use This"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-fg">📝 Full Script</div>
              <div className="flex gap-1">
                <IconBtn><RefreshCw size={14} /></IconBtn>
                <IconBtn><Copy size={14} /></IconBtn>
              </div>
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              className="min-h-[200px] rounded-lg border border-line bg-surface p-4 text-sm leading-relaxed text-fg outline-none focus:border-lime"
            >
              You've been planning your week wrong.{" "}
              <span className="rounded bg-[rgba(82,255,46,0.1)] px-1 text-lime">[PAUSE]</span>{" "}
              Here's the 20-minute ritual I use every Sunday to plan{" "}
              <span className="rounded bg-[rgba(246,196,83,0.1)] px-1 text-warn">[EMPHASIZE]</span>{" "}
              every single post for the week ahead.
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="rounded-full border border-lime px-2 py-0.5 text-lime">~30s</span>
              <span className="text-mute">96 words</span>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-2 text-sm font-semibold text-fg">🏷 Title</div>
            <Input defaultValue="The 20-Minute Weekly Ritual That Fixed My Content Plan" />
          </Card>

          <Card className="p-5">
            <div className="mb-2 text-sm font-semibold text-fg">📖 Description</div>
            <Textarea
              defaultValue="A short weekly ritual to plan a full content week in 20 minutes and stay consistent…"
              style={{ minHeight: 150 }}
            />
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold text-fg">#️⃣ Hashtags</div>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs text-lime"
                >
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="text-mute hover:text-err"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                value={tagAdd}
                onChange={(e) => setTagAdd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagAdd) {
                    setTags([...tags, tagAdd.startsWith("#") ? tagAdd : `#${tagAdd}`]);
                    setTagAdd("");
                  }
                }}
                placeholder="+ Add"
                className="h-7 rounded-full border border-line bg-surface px-3 text-xs text-fg outline-none focus:border-lime"
              />
            </div>
            <OutlineBtn className="mt-3 w-full">Copy All Tags</OutlineBtn>
          </Card>

          <div className="sticky bottom-4">
            <PrimaryBtn className="h-12 w-full text-base">
              Finalize Script → Send to Storyboard
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="grid h-8 w-8 place-items-center rounded-md text-lime hover:bg-[rgba(82,255,46,0.08)]">
      {children}
    </button>
  );
}
