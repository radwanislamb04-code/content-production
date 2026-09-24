import { useEffect, useState } from "react";
import { Card, Pill, PrimaryBtn, GhostBtn, OutlineBtn, EmptyState, Input } from "../ui";
import { Check, Copy, Download, LayoutPanelLeft, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost, errorMessage } from "@/lib/api";
import type { StoryboardResult } from "@/lib/content-types";
import { usePipeline } from "../pipeline";
import type { SectionId } from "../Sidebar";
import { buildProjectCsv, csvFileName, downloadCsv } from "@/lib/csv-export";
import { copyText } from "@/lib/clipboard";

type Character = { name: string; description: string };

/** A row of `/api/scripts-list` — either a script or a storyboard. */
type LibraryRow = {
  id: string;
  title: string;
  content_pillar: string | null;
  created_at: number;
  source_id?: string | null;
};

/** "24 Sep, 9:15 PM" — these lists are browsed by date. */
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

export function Storyboard({ onNav }: { onNav: (id: SectionId) => void }) {
  const { script, setScript, storyboard, setStoryboard } = usePipeline();
  const [loading, setLoading] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  /** Everyone on file, so a character can be clicked into this storyboard. */
  const [onFile, setOnFile] = useState<Character[]>([]);
  const [exporting, setExporting] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [savedStoryboards, setSavedStoryboards] = useState<LibraryRow[]>([]);
  const [savedScripts, setSavedScripts] = useState<LibraryRow[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  /**
   * Reopen a storyboard that was generated earlier.
   *
   * Its `content` is the same `{ shots }` the generator wrote, so nothing is re-derived —
   * and its row still points at the script it came from, which is how the source script is
   * put back on screen for a regeneration.
   */
  const openStoryboard = async (id: string) => {
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
      if (!script && row.source_id) await openScript(row.source_id, true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setOpeningId(null);
    }
  };

  /**
   * Delete a saved storyboard.
   *
   * The script page and the video prompt page each had a way to clear a row; this list did
   * not, so a storyboard built from the wrong script could only be dealt with in the
   * database.
   */
  const removeStoryboard = async (id: string) => {
    setDeleting(id);
    try {
      await apiDelete(`/api/library/storyboard/${id}`);
      setSavedStoryboards((prev) => prev.filter((b) => b.id !== id));
      if (storyboard?.storyboard_id === id) setStoryboard(null);
      toast.success("Storyboard deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  const openScript = async (id: string, quiet = false) => {
    try {
      const row = await apiGet<any>(`/api/library/script/${id}`);
      const parsed = typeof row?.content === "string" ? JSON.parse(row.content) : row?.content;
      setScript({
        id: row.id,
        title: row.title,
        content_pillar: row.content_pillar ?? null,
        script: parsed,
      } as any);
      if (!quiet) toast.success("Source script selected");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  /**
   * Load what already exists.
   *
   * Ten storyboards and seventeen scripts were sitting in the library while this screen said
   * "Generate a script first" — it only ever looked at the in-memory pipeline, so a page
   * reload hid everything the owner had made.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [boards, scripts] = await Promise.all([
          apiGet<LibraryRow[]>("/api/scripts-list?type=storyboard"),
          apiGet<LibraryRow[]>("/api/scripts-list?type=script"),
        ]);
        if (!alive) return;
        const boardList = Array.isArray(boards) ? boards : [];
        const scriptList = Array.isArray(scripts) ? scripts : [];
        setSavedStoryboards(boardList);
        setSavedScripts(scriptList);
        if (!storyboard && boardList.length > 0) void openStoryboard(boardList[0].id);
        else if (!script && scriptList.length > 0) void openScript(scriptList[0].id, true);
      } catch {
        /* the generate flow still works if the lists cannot be read */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Click a name on file to put it in (or take it out of) this storyboard. */
  const toggleCharacter = (c: Character) => {
    setCharacters((prev) =>
      prev.some((x) => x.name === c.name)
        ? prev.filter((x) => x.name !== c.name)
        : [...prev, { name: c.name, description: c.description }],
    );
  };

  /** Everything a shot needs for an image or video model, minus the spoken script. */
  const shotText = (s: any) =>
    [
      `Shot ${s.shot_number}${s.duration ? ` (${s.duration})` : ""}`,
      s.visual_description && `VISUAL:\n${s.visual_description}`,
      s.image_prompt && `IMAGE PROMPT:\n${s.image_prompt}`,
      s.text_overlay &&
        `TEXT OVERLAY: ${s.text_overlay}${s.text_overlay_position ? ` (${s.text_overlay_position})` : ""}`,
      s.voiceover && `VOICEOVER:\n${s.voiceover}`,
    ]
      .filter(Boolean)
      .join("\n\n");

  /**
   * Export this job — script, shots and whatever video prompts exist for the storyboard —
   * as one CSV, so the whole thing can be handed over in a single file.
   */
  const exportCsv = async () => {
    if (!script && !storyboard) {
      toast.error("Nothing to export yet");
      return;
    }
    setExporting(true);
    try {
      let prompts: any[] = [];
      let model: string | undefined;
      let aspectRatio: string | undefined;
      let quality: string | undefined;

      if (storyboard?.storyboard_id) {
        const rows = await apiGet<LibraryRow[]>("/api/scripts-list?type=video_prompt");
        const match = (rows ?? []).find((r) => r.source_id === storyboard.storyboard_id);
        if (match) {
          const row = await apiGet<any>(`/api/library/video_prompt/${match.id}`);
          const parsed = typeof row?.content === "string" ? JSON.parse(row.content) : row?.content;
          prompts = Array.isArray(parsed?.prompts) ? parsed.prompts : [];
          model = parsed?.model;
          aspectRatio = parsed?.aspect_ratio;
          quality = parsed?.quality;
        }
      }

      const content = (script as any)?.script ?? {};
      const hooks = Array.isArray(content.hooks) ? content.hooks : [];
      const idx =
        typeof content.selected_hook_index === "number" ? content.selected_hook_index : 0;

      const csv = buildProjectCsv({
        script: {
          id: (script as any)?.id,
          title: (script as any)?.title,
          hook: hooks[idx]?.spoken,
          body: content.body,
          voiceover: content.voiceover_script,
          cta: content.cta,
        },
        shots: (storyboard as any)?.shots ?? [],
        prompts,
        model,
        aspectRatio,
        quality,
      });
      downloadCsv(csvFileName((script as any)?.title), csv);
      toast.success(
        prompts.length > 0
          ? "CSV exported — script, shots and video prompts"
          : "CSV exported — script and shots",
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const addCharacter = () => {
    const n = name.trim();
    if (!n) return;
    setCharacters((prev) => [...prev, { name: n, description: desc.trim() }]);
    setName("");
    setDesc("");
  };

  /**
   * Bring in the characters that are already on file.
   *
   * They had to be typed in again for every storyboard — the same face, described from
   * memory, each time. The descriptions that were typed here were then dropped before the
   * model saw them (names only), so this is where the character's real profile starts
   * mattering: it goes to the storyboard prompt, and its avatar is what an image model
   * needs as a reference.
   */
  useEffect(() => {
    let cancelled = false;
    apiGet<any[]>("/api/characters")
      .then((rows) => {
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
        const roster = rows
          .map((row) => {
            const c = row?.content ?? {};
            return {
              name: String(c.name ?? row?.title ?? "").trim(),
              description: String(c.description ?? "").trim(),
              inUse: c.in_use === true,
            };
          })
          .filter((c) => c.name);
        if (roster.length) {
          setOnFile(roster);
          // The character marked in use is the host, so it is the fair default. Everyone
          // else waits to be clicked: they used to be pushed in silently, which meant the
          // list already held faces nobody had chosen — and clicking one did nothing,
          // because there was nothing to click.
          setCharacters(roster.filter((c) => c.inUse).map(({ name, description }) => ({ name, description })));
        }
      })
      .catch(() => {
        /* the form still works by hand if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = async () => {
    if (!script) return;
    setLoading(true);
    try {
      const res = await apiPost<StoryboardResult>("/api/visual-storyboard", {
        script_id: script.id,
        ...(characters.length ? { characters } : {}),
      });
      setStoryboard(res);
      // Bring the new row into the list without a reload.
      apiGet<LibraryRow[]>("/api/scripts-list?type=storyboard")
        .then((rows) => setSavedStoryboards(Array.isArray(rows) ? rows : []))
        .catch(() => {
          /* the storyboard itself is already on screen */
        });
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

      {savedStoryboards.length > 0 && (
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wide text-mute">
            Saved storyboards ({savedStoryboards.length})
          </div>
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
            {savedStoryboards.map((b) => {
              const isOpen = storyboard?.storyboard_id === b.id;
              return (
                <div key={b.id} className="flex items-center gap-1">
                  <button
                    onClick={() => void openStoryboard(b.id)}
                    disabled={openingId === b.id}
                    className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      isOpen
                        ? "border-lime text-lime"
                        : "border-line text-fg2 hover:border-lime hover:text-lime"
                    }`}
                  >
                    <span className="truncate">{b.title}</span>
                    <span className="shrink-0 text-xs text-mute">
                      {openingId === b.id ? "opening…" : stamp(b.created_at)}
                    </span>
                  </button>
                  <button
                    onClick={() => void removeStoryboard(b.id)}
                    disabled={deleting === b.id}
                    aria-label={`Delete ${b.title}`}
                    title="Delete this storyboard"
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

      {savedScripts.length > 0 && (
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wide text-mute">
            Build from a saved script ({savedScripts.length})
          </div>
          <div className="mt-3 max-h-44 space-y-1 overflow-y-auto">
            {savedScripts.map((s) => {
              const isOpen = script?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => void openScript(s.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    isOpen
                      ? "border-lime text-lime"
                      : "border-line text-fg2 hover:border-lime hover:text-lime"
                  }`}
                >
                  <span className="truncate">{s.title}</span>
                  <span className="shrink-0 text-xs text-mute">{stamp(s.created_at)}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

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
                  disabled={!name.trim()}
                  aria-label="Add character"
                  title={name.trim() ? "Add this character" : "Type a name first"}
                  className="grid h-10 w-full place-items-center rounded-lg bg-lime text-app transition disabled:opacity-40 sm:w-10"
                >
                  <Plus size={16} />
                </button>
              </div>
              {onFile.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] uppercase tracking-wide text-mute">On file — click to add</span>
                  {onFile.map((c) => {
                    const added = characters.some((x) => x.name === c.name);
                    return (
                      <button
                        key={c.name}
                        onClick={() => toggleCharacter(c)}
                        title={added ? `Remove ${c.name}` : c.description || `Add ${c.name}`}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                          added
                            ? "border-lime text-lime"
                            : "border-line text-fg2 hover:border-lime hover:text-lime"
                        }`}
                      >
                        {added ? <Check size={11} /> : <Plus size={11} />} {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {characters.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {characters.map((c, i) => (
                    <span
                      key={`${c.name}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full border border-lime bg-surface px-3 py-1 text-xs text-lime"
                    >
                      {c.name}
                      <button
                        onClick={() =>
                          setCharacters((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label={`Remove ${c.name}`}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-fg2">{storyboard.shot_count} shots</div>
            <OutlineBtn onClick={() => void exportCsv()} loading={exporting}>
              <Download size={14} /> Export CSV — script + shots + prompts
            </OutlineBtn>
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
                <Row label="Visual" value={s.visual_description} copyable />
                <Row label="Image Prompt" value={s.image_prompt} copyable />
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
                <div className="mt-3 flex justify-end">
                  <GhostBtn
                    onClick={() => void copyField(shotText(s), `Shot ${s.shot_number}`)}
                    title="Copies this shot minus the Script line — Visual, Image Prompt, Text Overlay and Voiceover"
                  >
                    <Copy size={13} /> Copy shot (without script)
                  </GhostBtn>
                </div>
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

async function copyField(value: string, what: string) {
  const ok = await copyText(value);
  if (ok) toast.success(`${what} copied`);
  else toast.error("Could not copy — try again with the window in front");
}

/**
 * One labelled field of a shot, with a copy button when the text is meant to be pasted
 * somewhere — the visual description and the image prompt are written to be handed to an
 * image model, and selecting a paragraph by hand on a phone is the alternative.
 */
function Row({
  label,
  value,
  copyable,
}: {
  label: string;
  value?: string;
  copyable?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
        {copyable && (
          <button
            onClick={() => void copyField(value, label)}
            aria-label={`Copy ${label}`}
            title={`Copy ${label}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded border border-line text-mute transition hover:border-lime hover:text-lime"
          >
            <Copy size={11} />
          </button>
        )}
      </div>
      <div className="break-words text-sm text-fg2">{value}</div>
    </div>
  );
}
