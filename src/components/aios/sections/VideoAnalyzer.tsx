import { useState } from "react";
import { Card, PrimaryBtn, GhostBtn, Textarea, SectionHeader, Input } from "../ui";
import type { SectionId } from "../Sidebar";
import {
  RefreshCw,
  Copy,
  FileText,
  Hash,
  Video,
  Type,
  MessageSquare,
  Plus,
  Check,
  X,
} from "lucide-react";

const OUT_TABS = ["Hooks", "Full Script", "Title", "Description", "Hashtags"] as const;
type OTab = (typeof OUT_TABS)[number];

type Idea = { id: number; text: string; finalized: boolean };

export function VideoAnalyzer({ onNav }: { onNav?: (id: SectionId) => void }) {
  const [text, setText] = useState("");
  const [gen, setGen] = useState(false);
  const [otab, setOtab] = useState<OTab>("Hooks");

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Video Analyzer"
        subtitle="Paste a transcript or script reference to generate content"
      />

      <div className="mx-auto max-w-[800px]">
        <Card className="p-6">

          <div className="mb-2 text-xs text-fg2">Reference Transcript or Script</div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 5000))}
            placeholder="Paste a video transcript, script reference, or any text content here. AI will analyze it and generate hooks, scripts, titles, descriptions, and hashtags..."
            style={{ minHeight: 240, resize: "vertical" }}
          />
          <div className="mt-1 text-right text-[11px] text-mute">
            {text.length} / 5000
          </div>
          <button
            onClick={() => setGen(true)}
            className="mt-3 h-12 w-full rounded-lg bg-lime text-sm font-bold text-app hover:bg-lime2"
          >
            Analyze &amp; Generate Content
          </button>
          <div className="my-4 flex items-center gap-3 text-xs text-mute">
            <div className="h-px flex-1 bg-line" />
            or
            <div className="h-px flex-1 bg-line" />
          </div>
          <button
            onClick={() => {
              setText("");
              setGen(false);
            }}
            className="mx-auto block text-xs text-mute hover:text-fg2"
          >
            Clear
          </button>
        </Card>
      </div>

      {gen && (
        <div className="mx-auto max-w-[800px] space-y-4">
          <div className="flex flex-wrap gap-2">
            {OUT_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setOtab(t)}
                className={`h-9 rounded-full px-4 text-sm ${
                  otab === t
                    ? "bg-lime font-bold text-app"
                    : "border border-line text-fg2 hover:border-lime hover:text-lime"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {otab === "Hooks" && (
            <OutCard title="Hooks" Icon={FileText}>
              <div className="space-y-2">
                {[
                  { style: "Curiosity", text: "You've been planning your week wrong (here's the fix)" },
                  { style: "Contrarian", text: "Stop batch-editing. Do this 20-minute ritual instead." },
                  { style: "Story", text: "I lost 3 months of momentum until this one change." },
                ].map((h, i) => (
                  <div key={i} className="rounded-lg border border-line bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-lime text-xs font-bold text-app">
                        {i + 1}
                      </span>
                      <span className="rounded-full border border-line bg-cardx px-2 py-0.5 text-[11px] text-fg2">
                        {h.style}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-fg">{h.text}</div>
                    <div className="mt-2 flex justify-end gap-2">
                      <GhostBtn className="text-fg2 hover:text-fg">
                        <Copy size={13} /> Copy
                      </GhostBtn>
                      <GhostBtn>Use This Hook</GhostBtn>
                    </div>
                  </div>
                ))}
              </div>
            </OutCard>
          )}

          {otab === "Full Script" && (
            <OutCard title="Full Script" Icon={FileText}>
              <Textarea
                defaultValue="Hook: You've been planning your week wrong.\n\n[PAUSE]\n\nHere's the 20-minute ritual I use every Sunday…"
                style={{ minHeight: 200 }}
              />
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="rounded-full border border-lime px-2 py-0.5 text-lime">
                  ~42s
                </span>
                <span className="text-mute">128 words</span>
              </div>
            </OutCard>
          )}

          {otab === "Title" && (
            <OutCard title="Title" Icon={Type}>
              <Textarea
                defaultValue="The 20-Minute Weekly Ritual That Fixed My Content Plan"
                style={{ minHeight: 60 }}
              />
            </OutCard>
          )}

          {otab === "Description" && (
            <OutCard title="Description" Icon={MessageSquare}>
              <Textarea
                defaultValue="A short weekly ritual to plan content in 20 minutes and stay consistent…"
                style={{ minHeight: 150 }}
              />
            </OutCard>
          )}

          {otab === "Hashtags" && (
            <OutCard title="Hashtags" Icon={Hash}>
              <div className="flex flex-wrap gap-2">
                {["#creator", "#weeklyplan", "#contentstrategy", "#reelstips", "#workflow"].map(
                  (h) => (
                    <span
                      key={h}
                      className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-lime"
                    >
                      {h}
                    </span>
                  ),
                )}
              </div>
            </OutCard>
          )}

          <PrimaryBtn className="w-full">
            <Video size={16} /> Send to Script Section →
          </PrimaryBtn>
        </div>
      )}
    </div>
  );
}

function OutCard({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon size={16} className="text-lime" />
          {title}
        </div>
        <div className="flex gap-1">
          <button className="grid h-8 w-8 place-items-center rounded-md text-lime hover:bg-[rgba(82,255,46,0.08)]">
            <RefreshCw size={14} />
          </button>
          <button className="grid h-8 w-8 place-items-center rounded-md text-mute hover:text-lime">
            <Copy size={14} />
          </button>
        </div>
      </div>
      {children}
    </Card>
  );
}
