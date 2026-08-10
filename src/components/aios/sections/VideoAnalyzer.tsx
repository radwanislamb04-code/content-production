import { useState } from "react";
import { Card, PrimaryBtn, GhostBtn, Textarea, SectionHeader, Input } from "../ui";
import type { SectionId } from "../Sidebar";
import { toast } from "sonner";
import { apiPost, errorMessage } from "@/lib/api";
import {
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

const OUT_TABS = [
  "Hooks",
  "Full Script",
  "Voiceover",
  "Title",
  "Description",
  "Hashtags",
] as const;
type OTab = (typeof OUT_TABS)[number];

type Idea = { id: number; text: string; finalized: boolean };

type AnalyzerHook = {
  spoken: string;
  formula: string;
  visual: string;
  text_overlay: string;
};

type AnalyzerResult = {
  hooks: AnalyzerHook[];
  full_script: string;
  voiceover_script: string;
  title: string;
  description: string;
  hashtags: string[];
};

export function VideoAnalyzer({ onNav }: { onNav?: (id: SectionId) => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzerResult | null>(null);
  const [otab, setOtab] = useState<OTab>("Hooks");

  const copy = (value: string) => {
    navigator.clipboard.writeText(value).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Could not copy"),
    );
  };

  const analyze = async (opts?: { keepTab?: boolean }) => {
    if (!text.trim()) {
      toast.error("Paste a transcript or script first");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost<AnalyzerResult>("/api/video-analyzer", {
        input_type: "transcript",
        content: text.trim(),
      });
      setResult({
        hooks: Array.isArray(res?.hooks) ? res.hooks : [],
        full_script: res?.full_script ?? "",
        voiceover_script: res?.voiceover_script ?? "",
        title: res?.title ?? "",
        description: res?.description ?? "",
        hashtags: Array.isArray(res?.hashtags) ? res.hashtags : [],
      });
      if (!opts?.keepTab) setOtab("Hooks");
      toast.success("Content generated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Video Analyzer"
        subtitle="Paste a transcript or script reference to generate content"
      />

      <div className="mx-auto w-full max-w-[800px]">
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
          <PrimaryBtn
            onClick={analyze}
            loading={loading}
            disabled={!text.trim()}
            className="mt-3 h-12 w-full"
          >
            {loading ? "Analyzing…" : "Analyze & Generate Content"}
          </PrimaryBtn>
          <div className="my-4 flex items-center gap-3 text-xs text-mute">
            <div className="h-px flex-1 bg-line" />
            or
            <div className="h-px flex-1 bg-line" />
          </div>
          <button
            onClick={() => {
              setText("");
              setResult(null);
            }}
            className="mx-auto block text-xs text-mute hover:text-fg2"
          >
            Clear
          </button>
        </Card>

        <CustomIdeas onNav={onNav} />
      </div>

      {result && (
        <div className="mx-auto w-full max-w-[800px] space-y-4">
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
            <OutCard title="Hooks" Icon={FileText} onCopy={() => copy(result.hooks.map((h) => h.spoken).join("\n"))}>
              <div className="space-y-2">
                {result.hooks.length === 0 && (
                  <div className="text-sm text-mute">No hooks returned.</div>
                )}
                {result.hooks.map((h, i) => (
                  <div key={i} className="rounded-lg border border-line bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-lime text-xs font-bold text-app">
                        {i + 1}
                      </span>
                      {h.formula && (
                        <span className="rounded-full border border-line bg-cardx px-2 py-0.5 text-[11px] text-fg2">
                          {h.formula}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-fg">{h.spoken}</div>
                    {h.visual && (
                      <div className="mt-1 text-xs text-mute">Visual: {h.visual}</div>
                    )}
                    {h.text_overlay && (
                      <div className="mt-1 text-xs text-mute">
                        Overlay: {h.text_overlay}
                      </div>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      <GhostBtn
                        className="text-fg2 hover:text-fg"
                        onClick={() => copy(h.spoken)}
                      >
                        <Copy size={13} /> Copy
                      </GhostBtn>
                    </div>
                  </div>
                ))}
              </div>
            </OutCard>
          )}

          {otab === "Full Script" && (
            <OutCard
              title="Full Script"
              Icon={FileText}
              onCopy={() => copy(result.full_script)}
            >
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-fg2">
                {result.full_script || "No script returned."}
              </pre>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-mute">
                  {result.full_script.trim()
                    ? result.full_script.trim().split(/\s+/).length
                    : 0}{" "}
                  words
                </span>
              </div>
            </OutCard>
          )}

          {otab === "Title" && (
            <OutCard title="Title" Icon={Type} onCopy={() => copy(result.title)}>
              <div className="text-sm text-fg">{result.title || "No title returned."}</div>
            </OutCard>
          )}

          {otab === "Description" && (
            <OutCard
              title="Description"
              Icon={MessageSquare}
              onCopy={() => copy(result.description)}
            >
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-fg2">
                {result.description || "No description returned."}
              </pre>
            </OutCard>
          )}

          {otab === "Hashtags" && (
            <OutCard
              title="Hashtags"
              Icon={Hash}
              onCopy={() => copy(result.hashtags.join(" "))}
            >
              <div className="flex flex-wrap gap-2">
                {result.hashtags.length === 0 && (
                  <span className="text-sm text-mute">No hashtags returned.</span>
                )}
                {result.hashtags.map((h) => (
                  <span
                    key={h}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-lime"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </OutCard>
          )}

          <PrimaryBtn className="w-full" onClick={() => onNav?.("script")}>
            <Video size={16} /> Send to Script Section →
          </PrimaryBtn>
        </div>
      )}
    </div>
  );
}

function CustomIdeas({ onNav }: { onNav?: (id: SectionId) => void }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [nextId, setNextId] = useState(1);
  const [sending, setSending] = useState(false);

  const finalized = ideas.filter((i) => i.finalized && i.text.trim());

  const add = () => {
    setIdeas((prev) => [...prev, { id: nextId, text: "", finalized: false }]);
    setNextId((n) => n + 1);
  };

  const send = async () => {
    setSending(true);
    try {
      await fetch("/api/workspace/selected_idea", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas: finalized.map((i) => i.text.trim()) }),
      });
    } catch {
      /* offline-safe: still move the user forward */
    }
    setSending(false);
    onNav?.("storyboard");
  };

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">Custom Ideas</h2>
        <GhostBtn onClick={add}>
          <Plus size={14} /> Add idea
        </GhostBtn>
      </div>

      <div className="mt-4 space-y-2">
        {ideas.length === 0 && (
          <p className="text-sm text-mute">
            No ideas yet — add one to send it through to Storyboard.
          </p>
        )}
        {ideas.map((idea) => (
          <div key={idea.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                value={idea.text}
                readOnly={idea.finalized}
                placeholder="Describe your idea..."
                onChange={(e) =>
                  setIdeas((prev) =>
                    prev.map((i) =>
                      i.id === idea.id ? { ...i, text: e.target.value } : i,
                    ),
                  )
                }
              />
            </div>
            {idea.finalized ? (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[rgba(82,255,46,0.3)] bg-[rgba(82,255,46,0.1)] text-lime">
                <Check size={16} />
              </span>
            ) : (
              <button
                onClick={() =>
                  setIdeas((prev) =>
                    prev.map((i) =>
                      i.id === idea.id && i.text.trim()
                        ? { ...i, finalized: true }
                        : i,
                    ),
                  )
                }
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-lime px-3 text-xs font-bold text-app hover:bg-lime2"
              >
                <Check size={14} /> Finalize
              </button>
            )}
            <button
              onClick={() =>
                setIdeas((prev) => prev.filter((i) => i.id !== idea.id))
              }
              aria-label="Remove idea"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-err transition-colors hover:bg-[rgba(255,93,93,0.1)]"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {finalized.length > 0 && (
        <button
          onClick={send}
          disabled={sending}
          className="mt-4 h-12 w-full rounded-lg bg-lime text-sm font-bold text-app transition-colors hover:bg-lime2 disabled:opacity-60"
        >
          {sending ? "Saving..." : "Send to Storyboard →"}
        </button>
      )}
    </Card>
  );
}

function OutCard({
  title,
  Icon,
  children,
  onCopy,
}: {
  title: string;
  Icon: typeof FileText;
  children: React.ReactNode;
  onCopy?: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon size={16} className="text-lime" />
          {title}
        </div>
        <div className="flex gap-1">
          <button
            onClick={onCopy}
            aria-label="Copy"
            className="grid h-8 w-8 place-items-center rounded-md text-mute hover:text-lime"
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
      {children}
    </Card>
  );
}
