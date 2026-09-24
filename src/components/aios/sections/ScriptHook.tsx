import { useEffect, useState } from "react";
import { Card, Pill, PrimaryBtn, GhostBtn, EmptyState } from "../ui";
import { PenLine, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import type { ScriptResult } from "@/lib/content-types";
import { usePipeline } from "../pipeline";
import type { SectionId } from "../Sidebar";

/** A row of `/api/scripts-list` — enough to show a dated list without loading the bodies. */
type SavedScript = {
  id: string;
  title: string;
  content_pillar: string | null;
  created_at: number;
};

/** "24 Sep, 9:15 PM" — the list is browsed by when it was written. */
function stamp(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "unknown date";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ScriptHook({ onNav }: { onNav: (id: SectionId) => void }) {
  const { selectedIdea, script, setScript } = usePipeline();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"Script" | "Voiceover">("Script");
  const [saved, setSaved] = useState<SavedScript[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  /**
   * Open a script that was written on an earlier day.
   *
   * The library held seventeen scripts while this screen insisted "No script yet": the only
   * way to see one was to hold its idea in memory from the Ideator. The list is the missing
   * door — the row's `content` is the same JSON the writer returned, so it reopens exactly
   * as it was.
   */
  const openScript = async (id: string) => {
    setOpeningId(id);
    try {
      const row = await apiGet<any>(`/api/library/script/${id}`);
      const parsed = typeof row?.content === "string" ? JSON.parse(row.content) : row?.content;
      setScript({
        id: row.id,
        title: row.title,
        content_pillar: row.content_pillar ?? null,
        script: parsed,
      } as ScriptResult);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setOpeningId(null);
    }
  };

  useEffect(() => {
    let alive = true;
    apiGet<SavedScript[]>("/api/scripts-list?type=script")
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        if (!alive) return;
        setSaved(list);
        // Show the latest one rather than an empty page — there is no reason to make the
        // owner click before seeing their own most recent script.
        if (!script && list.length > 0) void openScript(list[0].id);
      })
      .catch(() => {
        /* the generate flow still works if the list cannot be read */
      })
      .finally(() => {
        if (alive) setSavedLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshSaved = async () => {
    try {
      const rows = await apiGet<SavedScript[]>("/api/scripts-list?type=script");
      setSaved(Array.isArray(rows) ? rows : []);
    } catch {
      /* the list is a convenience; a failure here must not look like a failed generation */
    }
  };

  const generate = async () => {
    if (!selectedIdea) return;
    setLoading(true);
    try {
      const res = await apiPost<ScriptResult>("/api/hook-script-writer", {
        idea_id: selectedIdea.id,
      });
      setScript(res);
      void refreshSaved();
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

      {savedLoading ? (
        <div className="text-sm text-mute">Loading your saved scripts…</div>
      ) : saved.length > 0 ? (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-mute">
              Saved scripts ({saved.length})
            </div>
            <GhostBtn onClick={() => void refreshSaved()}>
              <RefreshCw size={13} /> Refresh
            </GhostBtn>
          </div>
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
            {saved.map((s) => {
              const isOpen = script?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => void openScript(s.id)}
                  disabled={openingId === s.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    isOpen
                      ? "border-lime text-lime"
                      : "border-line text-fg2 hover:border-lime hover:text-lime"
                  }`}
                >
                  <span className="truncate">{s.title}</span>
                  <span className="shrink-0 text-xs text-mute">
                    {openingId === s.id ? "opening…" : stamp(s.created_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

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

          <div className="flex flex-wrap gap-2">
            {(["Script", "Voiceover"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`h-9 rounded-full px-4 text-sm ${
                  tab === t
                    ? "bg-lime font-bold text-app"
                    : "border border-line text-fg2 hover:border-lime hover:text-lime"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "Voiceover" ? (
            <>
              <Card className="p-5">
                <div className="mb-2 text-[11px] uppercase tracking-wide text-mute">
                  Voiceover Script
                </div>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-fg2">
                  {script.script?.voiceover_script ||
                    "No voiceover script returned."}
                </pre>
                <div className="mt-2 text-xs text-mute">
                  Clean spoken-only text — no visual or overlay directions.
                </div>
              </Card>
              <div className="flex flex-wrap justify-end gap-2">
                <GhostBtn
                  onClick={() => copy(script.script?.voiceover_script ?? "")}
                >
                  <Copy size={13} /> Copy Voiceover
                </GhostBtn>
                <GhostBtn onClick={generate} disabled={loading}>
                  <RefreshCw size={13} className={loading ? "animate-spin" : undefined} />
                  {loading ? "Regenerating…" : "Regenerate"}
                </GhostBtn>
              </div>
            </>
          ) : (
            <>
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

              <div className="flex flex-wrap justify-end gap-2">
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
                <GhostBtn onClick={generate} disabled={loading}>
                  <RefreshCw size={13} className={loading ? "animate-spin" : undefined} />
                  {loading ? "Regenerating…" : "Regenerate"}
                </GhostBtn>
              </div>
            </>
          )}

          <PrimaryBtn className="w-full" onClick={() => onNav("storyboard")}>
            Continue to Storyboard →
          </PrimaryBtn>
        </div>
      )}
    </div>
  );
}
