import { useState } from "react";
import { Card, Pill, PrimaryBtn, GhostBtn, EmptyState, Input } from "../ui";
import { LayoutPanelLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { apiPost, errorMessage } from "@/lib/api";
import type { StoryboardResult } from "@/lib/content-types";
import { usePipeline } from "../pipeline";
import type { SectionId } from "../Sidebar";

type Character = { name: string; description: string };

export function Storyboard({ onNav }: { onNav: (id: SectionId) => void }) {
  const { script, storyboard, setStoryboard } = usePipeline();
  const [loading, setLoading] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const addCharacter = () => {
    const n = name.trim();
    if (!n) return;
    setCharacters((prev) => [...prev, { name: n, description: desc.trim() }]);
    setName("");
    setDesc("");
  };

  const generate = async () => {
    if (!script) return;
    setLoading(true);
    try {
      const res = await apiPost<StoryboardResult>("/api/visual-storyboard", {
        script_id: script.id,
        ...(characters.length ? { characters } : {}),
      });
      setStoryboard(res);
      toast.success(`Storyboard ready — ${res.shot_count} shots`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-semibold text-fg">
          Storyboard
        </h1>
        <p className="mt-1 text-sm text-mute">
          Break your script into shot-by-shot visuals.
        </p>
      </div>

      <Card className="p-5">
        {script ? (
          <>
            <div className="text-[11px] uppercase tracking-wide text-mute">
              Source Script
            </div>
            <div className="mt-1 text-[15px] font-semibold text-fg">
              {script.title}
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-mute">
                Characters (optional)
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                />
                <Input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Description"
                />
                <button
                  onClick={addCharacter}
                  aria-label="Add character"
                  className="grid h-10 w-full place-items-center rounded-lg bg-lime text-app sm:w-10"
                >
                  <Plus size={16} />
                </button>
              </div>
              {characters.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {characters.map((c, i) => (
                    <span
                      key={`${c.name}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs text-lime"
                    >
                      {c.name}
                      <button
                        onClick={() =>
                          setCharacters((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="text-mute hover:text-err"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <PrimaryBtn
              className="mt-5 w-full sm:w-auto"
              onClick={generate}
              loading={loading}
            >
              {loading ? "Building…" : "Generate Storyboard"}
            </PrimaryBtn>
          </>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-fg2">
              Generate a script first to build its storyboard.
            </div>
            <GhostBtn onClick={() => onNav("script")}>
              Go to Script &amp; Hook →
            </GhostBtn>
          </div>
        )}
      </Card>

      {!storyboard ? (
        <EmptyState
          icon={<LayoutPanelLeft size={22} />}
          message="No storyboard yet — generate one from your script."
        />
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-fg2">
            {storyboard.shot_count} shots
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {storyboard.shots.map((s) => (
              <Card key={s.shot_number} className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-lime px-2 py-0.5 text-xs font-bold text-app">
                    Shot {s.shot_number}
                  </span>
                  {s.duration && <Pill>{s.duration}</Pill>}
                  {s.camera_angle && <Pill variant="accent">{s.camera_angle}</Pill>}
                  {s.transition && <Pill>{s.transition}</Pill>}
                </div>
                <Row label="Script" value={s.script_portion} />
                <Row label="Visual" value={s.visual_description} />
                <Row label="Image Prompt" value={s.image_prompt} />
                <Row
                  label="Text Overlay"
                  value={
                    s.text_overlay
                      ? `${s.text_overlay}${
                          s.text_overlay_position
                            ? ` (${s.text_overlay_position})`
                            : ""
                        }`
                      : ""
                  }
                />
                <Row label="Voiceover" value={s.voiceover} />
              </Card>
            ))}
          </div>

          <PrimaryBtn className="w-full" onClick={() => onNav("prompt")}>
            Continue to Video Prompt →
          </PrimaryBtn>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="mt-2">
      <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
      <div className="break-words text-sm text-fg2">{value}</div>
    </div>
  );
}
