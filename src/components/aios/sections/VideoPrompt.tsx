import { useState } from "react";
import { Card, Pill, PrimaryBtn, GhostBtn, OutlineBtn, Select, EmptyState } from "../ui";
import { Film, Copy } from "lucide-react";
import { toast } from "sonner";
import { apiPost, errorMessage } from "@/lib/api";
import type { VideoPromptResult } from "@/lib/content-types";
import { usePipeline } from "../pipeline";

const MODELS = ["seedance", "omni", "veo3"] as const;
const RATIOS = ["9:16", "16:9", "1:1"] as const;
const QUALITIES = ["standard", "high", "cinematic"] as const;

export function VideoPrompt() {
  const { storyboard, videoPrompt, setVideoPrompt } = usePipeline();
  const [model, setModel] = useState<string>(MODELS[0]);
  const [aspect, setAspect] = useState<string>(RATIOS[0]);
  const [quality, setQuality] = useState<string>(QUALITIES[1]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!storyboard) return;
    setLoading(true);
    try {
      const res = await apiPost<VideoPromptResult>("/api/video-gen-prompt", {
        storyboard_id: storyboard.storyboard_id,
        model,
        aspect_ratio: aspect,
        quality,
      });
      setVideoPrompt(res);
      toast.success("Video prompts generated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Could not copy"),
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-semibold text-fg">
          Video Prompt
        </h1>
        <p className="mt-1 text-sm text-mute">
          Convert storyboard shots into model-ready video prompts.
        </p>
      </div>

      <div className="rounded-lg border-l-[3px] border-l-lime bg-[rgba(82,255,46,0.05)] px-4 py-3 text-sm text-fg2">
        {storyboard
          ? `Storyboard imported — ${storyboard.shot_count} shots ready`
          : "No storyboard yet — build one in the Storyboard section first."}
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Model">
            <Select value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Aspect Ratio">
            <Select value={aspect} onChange={(e) => setAspect(e.target.value)}>
              {RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quality">
            <Select value={quality} onChange={(e) => setQuality(e.target.value)}>
              {QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <PrimaryBtn
          className="mt-5 w-full sm:w-auto"
          onClick={generate}
          loading={loading}
          disabled={!storyboard}
        >
          {loading ? "Generating…" : "Generate Video Prompt"}
        </PrimaryBtn>
      </Card>

      {!videoPrompt ? (
        <EmptyState
          icon={<Film size={22} />}
          message="No video prompts yet — pick your settings and generate."
        />
      ) : (
        <>
          <div className="space-y-3">
            {videoPrompt.prompts.map((p) => (
              <Card key={p.shot_number} className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-lime px-2 py-0.5 text-xs font-bold text-app">
                    Shot {p.shot_number}
                  </span>
                  {p.duration && <Pill>{p.duration}</Pill>}
                  {p.camera_motion && <Pill variant="accent">{p.camera_motion}</Pill>}
                  <Pill variant="accent">
                    {videoPrompt.aspect_ratio} · {videoPrompt.model}
                  </Pill>
                </div>
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-surface p-3 font-sans text-sm text-fg2">
                  {p.video_prompt}
                </pre>
                {p.negative_prompt && (
                  <div className="mt-2">
                    <div className="text-[11px] uppercase tracking-wide text-mute">
                      Negative Prompt
                    </div>
                    <div className="break-words text-xs text-fg2">
                      {p.negative_prompt}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <GhostBtn onClick={() => copy(p.video_prompt)}>
                    <Copy size={13} /> Copy
                  </GhostBtn>
                </div>
              </Card>
            ))}
          </div>

          <OutlineBtn
            className="w-full"
            onClick={() =>
              copy(
                videoPrompt.prompts
                  .map((p) => `Shot ${p.shot_number}\n${p.video_prompt}`)
                  .join("\n\n"),
              )
            }
          >
            Copy All Prompts
          </OutlineBtn>
        </>
      )}
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
