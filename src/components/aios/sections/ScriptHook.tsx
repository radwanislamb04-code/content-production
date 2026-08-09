import { useState } from "react";
import { Card, Pill, PrimaryBtn, GhostBtn, EmptyState } from "../ui";
import { PenLine, Copy } from "lucide-react";
import { toast } from "sonner";
import { apiPost, errorMessage } from "@/lib/api";
import type { ScriptResult } from "@/lib/content-types";
import { usePipeline } from "../pipeline";
import type { SectionId } from "../Sidebar";

export function ScriptHook({ onNav }: { onNav: (id: SectionId) => void }) {
  const { selectedIdea, script, setScript } = usePipeline();
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!selectedIdea) return;
    setLoading(true);
    try {
      const res = await apiPost<ScriptResult>("/api/hook-script-writer", {
        idea_id: selectedIdea.id,
      });
      setScript(res);
      toast.success("Script generated");
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
    <div className="space-y-6">
      <div>
        <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-semibold text-fg">
          Script &amp; Hook
        </h1>
        <p className="mt-1 text-sm text-mute">
          Turn a selected idea into hooks, body and CTA.
        </p>
      </div>

      <Card className="p-5">
        {selectedIdea ? (
          <>
            <div className="text-[11px] uppercase tracking-wide text-mute">
              Selected Idea
            </div>
            <div className="mt-1 text-[15px] font-semibold text-fg">
              {selectedIdea.title}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedIdea.format && (
                <Pill variant="accent">{selectedIdea.format}</Pill>
              )}
              {selectedIdea.content_pillar && (
                <Pill>{selectedIdea.content_pillar}</Pill>
              )}
            </div>
            <PrimaryBtn
              className="mt-4 w-full sm:w-auto"
              onClick={generate}
              loading={loading}
            >
              {loading ? "Writing…" : "Generate Script"}
            </PrimaryBtn>
          </>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-fg2">
              Pick an idea in Ideator first to generate a script.
            </div>
            <GhostBtn onClick={() => onNav("discover")}>
              Go to Ideator →
            </GhostBtn>
          </div>
        )}
      </Card>

      {!script ? (
        <EmptyState
          icon={<PenLine size={22} />}
          message="No script yet — generate one from a selected idea."
        />
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-[15px] font-semibold text-fg">
              {script.title}
            </div>
            {script.content_pillar && (
              <div className="mt-2">
                <Pill>{script.content_pillar}</Pill>
              </div>
            )}
          </Card>

          <div className="space-y-3">
            {script.script?.hooks?.map((h, i) => (
              <Card key={i} className="p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-lime px-2 py-0.5 text-xs font-bold text-app">
                    Hook {i + 1}
                  </span>
                  {h.formula && <Pill>{h.formula}</Pill>}
                </div>
                <div className="text-sm text-fg">{h.spoken}</div>
                {h.visual && (
                  <div className="mt-2 text-xs text-mute">Visual: {h.visual}</div>
                )}
                {h.text_overlay && (
                  <div className="mt-1 text-xs text-mute">
                    Overlay: {h.text_overlay}
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <GhostBtn onClick={() => copy(h.spoken)}>
                    <Copy size={13} /> Copy
                  </GhostBtn>
                </div>
              </Card>
            ))}
          </div>

          {script.script?.body && (
            <Card className="p-5">
              <div className="mb-2 text-[11px] uppercase tracking-wide text-mute">
                Body
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-fg2">
                {script.script.body}
              </pre>
            </Card>
          )}

          {script.script?.cta && (
            <Card className="p-5">
              <div className="mb-2 text-[11px] uppercase tracking-wide text-mute">
                CTA
              </div>
              <div className="text-sm text-fg2">{script.script.cta}</div>
            </Card>
          )}

          <div className="flex justify-end">
            <GhostBtn
              onClick={() =>
                copy(
                  [
                    script.script?.hooks?.[0]?.spoken,
                    script.script?.body,
                    script.script?.cta,
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                )
              }
            >
              <Copy size={13} /> Copy Script
            </GhostBtn>
          </div>



          <PrimaryBtn className="w-full" onClick={() => onNav("storyboard")}>
            Continue to Storyboard →
          </PrimaryBtn>
        </div>
      )}
    </div>
  );
}
