import { useEffect, useRef, useState } from "react";
import { Card, Pill, PrimaryBtn, GhostBtn, OutlineBtn, Select, EmptyState } from "../ui";
import { Film, Copy, RefreshCw, Trash2, LayoutPanelLeft } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost, errorMessage } from "@/lib/api";
import type { LibraryRow, StoryboardResult, VideoPromptResult } from "@/lib/content-types";
import { usePipeline } from "../pipeline";

const MODELS = ["seedance", "omni", "veo3"] as const;
const RATIOS = ["9:16", "16:9", "1:1"] as const;
const QUALITIES = ["standard", "high", "cinematic"] as const;

/**
 * Storyboard → video prompts.
 *
 * This page used to be a dead end after a reload. It read the storyboard out of the shared
 * in-memory state and nothing else — `VideoPrompt.tsx` had no fetch of its own — so a
 * refresh left it saying "No storyboard yet" with the Generate button disabled, and the
 * only way back was to regenerate the storyboard in the previous section. Every other page
 * in the chain reopens its own newest row; this one now does too, and lets any saved
 * storyboard be picked instead.
 */
export function VideoPrompt() {
  const { storyboard, setStoryboard, videoPrompt, setVideoPrompt } = usePipeline();
  const [model, setModel] = useState<string>(MODELS[0]);
  const [aspect, setAspect] = useState<string>(RATIOS[0]);
  const [quality, setQuality] = useState<string>(QUALITIES[1]);
  const [loading, setLoading] = useState(false);

  const [boards, setBoards] = useState<LibraryRow[]>([]);
  const [saved, setSaved] = useState<LibraryRow[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const autoOpened = useRef(false);

  /** Reopen a stored storyboard — its content is the same `{ shots }` the generator wrote. */
  const openStoryboard = async (id: string, quiet = false) => {
    setOpeningId(id);
    try {
      const row = await apiGet<any>(`/api/library/storyboard/${id}`);
      const parsed = typeof row?.content === "string" ? JSON.parse(row.content) : row?.content;
      const shots = Array.isArray(parsed?.shots) ? parsed.shots : [];
      setStoryboard({
        storyboard_id: row.id,
        script_id: row.source_id ?? "",
        shot_count: shots.length,
        shots,
      } as StoryboardResult);
      if (!quiet) toast.success(`Storyboard loaded — ${shots.length} shots`);
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err));
    } finally {
      setOpeningId(null);
    }
  };

  /** Reopen a stored set of prompts. */
  const openVideoPrompt = async (id: string) => {
    setOpeningId(id);
    try {
      const row = await apiGet<any>(`/api/library/video_prompt/${id}`);
      const parsed = typeof row?.content === "string" ? JSON.parse(row.content) : row?.content;
      setVideoPrompt({
        video_prompt_id: row.id,
        storyboard_id: parsed?.storyboard_id ?? row.source_id ?? "",
        model: parsed?.model ?? MODELS[0],
        aspect_ratio: parsed?.aspect_ratio ?? RATIOS[0],
        quality: parsed?.quality ?? QUALITIES[1],
        prompts: Array.isArray(parsed?.prompts) ? parsed.prompts : [],
      } as VideoPromptResult);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setOpeningId(null);
    }
  };

  const refresh = async () => {
    try {
      const [boardRows, promptRows] = await Promise.all([
        apiGet<LibraryRow[]>("/api/scripts-list?type=storyboard"),
        apiGet<LibraryRow[]>("/api/scripts-list?type=video_prompt"),
      ]);
      setBoards(Array.isArray(boardRows) ? boardRows : []);
      setSaved(Array.isArray(promptRows) ? promptRows : []);
      return Array.isArray(boardRows) ? boardRows : [];
    } catch (err) {
      toast.error(errorMessage(err));
      return [];
    } finally {
      setListsLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const boardRows = await refresh();
      // Open the newest storyboard once, so the page is usable straight after a reload
      // instead of asking the owner to go back a step.
      if (!autoOpened.current && !storyboard && boardRows.length > 0) {
        autoOpened.current = true;
        await openStoryboard(boardRows[0].id, true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      void refresh();
      toast.success("Video prompts generated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const removePrompt = async (id: string) => {
    setDeleting(id);
    try {
      await apiDelete(`/api/library/video_prompt/${id}`);
      setSaved((prev) => prev.filter((s) => s.id !== id));
      if (videoPrompt?.video_prompt_id === id) setVideoPrompt(null);
      toast.success("Video prompt deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Could not copy"),
    );
  };

  const stamp = (at?: number) => {
    if (!at) return "";
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / (60 * 24))}d ago`;
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

      {boards.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-mute">
              Pick a storyboard ({boards.length})
            </div>
            <GhostBtn onClick={() => void refresh()}>
              <RefreshCw size={13} /> Refresh
            </GhostBtn>
          </div>
          <div className="mt-3 max-h-44 space-y-1 overflow-y-auto aios-scroll">
            {boards.map((b) => {
              const isOpen = storyboard?.storyboard_id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => void openStoryboard(b.id)}
                  disabled={openingId === b.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    isOpen ? "border-lime text-lime" : "border-line text-fg2 hover:border-lime hover:text-lime"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <LayoutPanelLeft size={13} className="shrink-0 text-mute" />
                    <span className="truncate">{b.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-mute">
                    {openingId === b.id ? "opening…" : stamp(b.created_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <div className="rounded-lg border-l-[3px] border-l-lime bg-[rgba(82,255,46,0.05)] px-4 py-3 text-sm text-fg2">
        {storyboard
          ? `Storyboard ready — ${storyboard.shot_count} shots`
          : listsLoading
            ? "Looking for your storyboards…"
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

      {saved.length > 0 && (
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wide text-mute">
            Saved prompts ({saved.length})
          </div>
          <div className="mt-3 max-h-44 space-y-1 overflow-y-auto aios-scroll">
            {saved.map((s) => {
              const isOpen = videoPrompt?.video_prompt_id === s.id;
              return (
                <div key={s.id} className="flex items-center gap-1">
                  <button
                    onClick={() => void openVideoPrompt(s.id)}
                    disabled={openingId === s.id}
                    className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      isOpen ? "border-lime text-lime" : "border-line text-fg2 hover:border-lime hover:text-lime"
                    }`}
                  >
                    <span className="truncate">{s.title}</span>
                    <span className="shrink-0 text-xs text-mute">
                      {openingId === s.id ? "opening…" : stamp(s.created_at)}
                    </span>
                  </button>
                  <button
                    onClick={() => void removePrompt(s.id)}
                    disabled={deleting === s.id}
                    aria-label={`Delete ${s.title}`}
                    title="Delete these prompts"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-mute transition hover:border-err hover:text-err disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
