import { useEffect, useRef, useState } from "react";
import { Card, Pill, PrimaryBtn, GhostBtn, Input, EmptyState } from "../ui";
import { Lightbulb, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiFetch, apiGet, apiPost, errorMessage } from "@/lib/api";
import type { Idea } from "@/lib/content-types";
import { usePipeline } from "../pipeline";
import type { SectionId } from "../Sidebar";
import { useSidebarOpen } from "@/lib/sidebar";

const SOURCES = [
  {
    id: "brief",
    label: "From Today's Brief",
    hint: "One click: the brief where your trends, your competitors' recent posts and your own picks were already analysed together.",
  },
  { id: "my_posts", label: "My Posts", hint: "Ideas derived from your best performing posts." },
  { id: "competitor", label: "Competitors", hint: "Add competitor handles to mine for angles." },
  { id: "trend", label: "Trends", hint: "Add trending keywords or hashtags." },
] as const;

type Source = (typeof SOURCES)[number]["id"];

type MyPost = {
  hook: string;
  likes: number;
  comments: number;
  engagement: number;
  posted_at: string;
  url: string;
};

export function Discover({ onNav }: { onNav: (id: SectionId) => void }) {
  const { ideas, setIdeas, selectedIdea, setSelectedIdea, briefItem, setBriefItem } =
    usePipeline();
  // The selection bar is fixed to the bottom of the viewport, so it has to follow
  // the sidebar exactly like the header does.
  const [sidebarOpen] = useSidebarOpen();
  const [source, setSource] = useState<Source>("my_posts");
  const [entries, setEntries] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "sourcing" | "generating">("idle");
  const [myPosts, setMyPosts] = useState<MyPost[] | null>(null);
  /** The brief line these ideas came from, kept on screen so the batch is traceable. */
  const [pickedFrom, setPickedFrom] = useState<{ text: string; section: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [deletingIdea, setDeletingIdea] = useState<string | null>(null);

  // Load the real scraped posts as soon as "My Posts" is selected, so the panel
  // shows what will actually feed the idea generator.
  useEffect(() => {
    if (source !== "my_posts" || myPosts !== null) return;
    let cancelled = false;
    apiGet<{ published?: MyPost[] }>("/api/hooks")
      .then((res) => {
        if (!cancelled) setMyPosts(res?.published ?? []);
      })
      .catch(() => {
        if (!cancelled) setMyPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [source, myPosts]);

  /**
   * A line sent over from the Daily Brief.
   *
   * That screen only carries the sentence; the generation happens here so the owner
   * lands on the results with the source tabs already pointing at "From Today's Brief".
   *
   * The "already dispatched" ref is load-bearing. Clearing `briefItem` is part of this
   * effect, so the effect runs a second time the moment it clears — and an ordinary
   * `cancelled` flag would then cancel the request that is still in flight, leaving the
   * screen on "Generating…" forever with no ideas and no error. The ref says which line
   * has already been sent, so the second run is a no-op instead of a cancellation.
   */
  const dispatchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!briefItem) return;
    if (dispatchedRef.current === briefItem.text) return;
    dispatchedRef.current = briefItem.text;

    const picked = briefItem;
    setBriefItem(null);
    setSource("brief");
    setPicking(true);
    (async () => {
      try {
        const res = await apiPost<{ ideas: Idea[] }>("/api/ideator-generate", {
          source: "brief",
          source_data: [
            {
              picked_from_brief: true,
              date: picked.date,
              section: picked.section,
              markdown: `- ${picked.text}`,
            },
          ],
        });
        setIdeas(res.ideas ?? []);
        setPickedFrom({ text: picked.text, section: picked.section });
        toast.success(`Generated ${res.ideas?.length ?? 0} ideas from that brief line`);
      } catch (err) {
        toast.error(errorMessage(err));
        // Let the same line be retried instead of silently swallowing it.
        dispatchedRef.current = null;
      } finally {
        setPicking(false);
      }
    })();
  }, [briefItem, setBriefItem, setIdeas]);

  /**
   * Remember which idea is selected, server-side.
   *
   * The pick used to live only in React state, so nothing else could see it — the
   * Dashboard's "Continue Working" reads these workspace rows, and only the video
   * analyser ever wrote them, which is why that card said "Nothing in progress" no matter
   * how much was actually in progress.
   */
  useEffect(() => {
    const title = selectedIdea?.title?.trim();
    if (!title) return;
    void apiFetch("/api/workspace/selected_idea", {
      method: "PUT",
      body: JSON.stringify({ ideas: [title] }),
    }).catch(() => {
      /* the pick still works for this session; only the Dashboard hand-off is lost */
    });
  }, [selectedIdea?.title]);

  /** Delete an idea — a batch of five that only needed one still has to be clearable. */
  const removeIdea = async (id: string) => {
    setDeletingIdea(id);
    try {
      await apiDelete(`/api/library/idea/${id}`);
      setIdeas(ideas.filter((i) => i.id !== id));
      if (selectedIdea?.id === id) setSelectedIdea(null);
      toast.success("Idea deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeletingIdea(null);
    }
  };

  const active = SOURCES.find((s) => s.id === source)!;

  const addEntry = () => {
    const v = draft.trim();
    if (!v) return;
    setEntries((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setDraft("");
  };

  const collectCompetitorData = async () => {
    const all: unknown[] = [];
    for (const handle of entries) {
      try {
        const res = await apiPost<{ posts?: unknown[] }>("/api/scrape-competitor", {
          handle: handle.replace(/^@/, ""),
          platform: "instagram",
        });
        if (Array.isArray(res?.posts)) {
          all.push({ handle, posts: res.posts });
        }
      } catch (err) {
        toast.error(`${handle}: ${errorMessage(err)}`);
      }
    }
    return all;
  };

  const collectTrendData = async () => {
    const all: unknown[] = [];
    for (const keyword of entries) {
      let trends: unknown[] | null = null;

      // 1) YouTube trends for the keyword
      try {
        const res = await apiGet<unknown>(
          `/api/trends?platform=youtube&category=${encodeURIComponent(keyword)}&q=${encodeURIComponent(keyword)}`,
        );
        if (Array.isArray(res) && res.length > 0) trends = res;
      } catch {
        /* fall through to next source */
      }

      // 2) Trend-spy insights as a fallback
      if (!trends) {
        try {
          const res = await apiPost<{ insights?: unknown[] }>("/api/trend-spy", {
            category: keyword,
          });
          if (Array.isArray(res?.insights) && res.insights.length > 0) {
            trends = res.insights;
          }
        } catch {
          /* fall through */
        }
      }

      // 3) Worst case, still pass the keyword itself so generation can proceed
      all.push({ keyword, trends: trends ?? [{ title: keyword, source: "keyword" }] });
    }
    return all;
  };

  /**
   * Your own posts, from the last scrape — the same rows the Performance and
   * Hook Scoreboard pages read. This branch used to send an empty array, so
   * "ideas from my best performing posts" was generated from nothing.
   */
  const collectMyPostData = async () => {
    const res = await apiGet<{ published?: MyPost[] }>("/api/hooks");
    return (res?.published ?? []).slice(0, 10);
  };

  const generate = async () => {
    setLoading(true);
    try {
      let sourceData: unknown[] = [];
      if (source === "brief") {
        // Nothing to collect: the brief already holds the analysis. This is the button the
        // owner kept asking for — one click instead of generating trends and competitors
        // separately and reading them side by side.
        setStep("sourcing");
      } else if (source !== "my_posts") {
        setStep("sourcing");
        sourceData =
          source === "competitor" ? await collectCompetitorData() : await collectTrendData();
        if (sourceData.length === 0) {
          toast.error("No source data found — try different entries.");
          return;
        }
      } else {
        setStep("sourcing");
        const mine = await collectMyPostData();
        if (mine.length === 0) {
          toast.error(
            "No posts of yours are tracked yet — add your handle in Settings → Instagram, then run the scrape in Sources.",
          );
          return;
        }
        sourceData = mine;
      }
      setStep("generating");
      const res = await apiPost<{ ideas: Idea[] }>("/api/ideator-generate", {
        source,
        source_data: sourceData,
      });
      setIdeas(res.ideas ?? []);
      toast.success(`Generated ${res.ideas?.length ?? 0} ideas`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStep("idle");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-semibold text-fg">Ideator</h1>
        <p className="mt-1 text-sm text-mute">
          Generate fresh content ideas from your posts, competitors, or trends.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            className={`h-9 rounded-full px-4 text-sm transition ${
              source === s.id
                ? "bg-lime font-bold text-app"
                : "border border-line bg-transparent text-fg2 hover:border-lime hover:text-lime"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Card className="p-5">
        <div className="text-sm text-fg2">{active.hint}</div>

        {source === "my_posts" && (
          <div className="mt-3">
            {myPosts === null ? (
              <p className="text-sm text-mute">Loading your tracked posts…</p>
            ) : myPosts.length === 0 ? (
              <div className="rounded-lg border border-line bg-surface p-4">
                <p className="text-sm text-fg2">
                  No posts of yours are tracked yet, so there is nothing to derive ideas from.
                </p>
                <p className="mt-1.5 text-xs text-mute">
                  Add your Instagram handle in Settings → Instagram, then run the scrape from
                  Sources. Your posts then appear here, in Performance and on the Hook Scoreboard.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-sm text-fg2">
                  {myPosts.length} of your posts from the last scrape will feed the generator, most
                  engagement first.
                </div>
                <ul className="mt-3 space-y-1.5">
                  {myPosts.slice(0, 5).map((p, i) => (
                    <li key={`${p.posted_at}-${i}`} className="flex gap-2 text-xs">
                      <span className="text-mute">{p.engagement}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {p.hook || "(no caption text)"}
                      </span>
                      <span className="shrink-0 text-mute">{p.posted_at || ""}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] text-mute">
                  Instagram hides like counts from scrapers, so engagement here is a floor, not a
                  score.
                </p>
              </div>
            )}
          </div>
        )}

        {source === "brief" && (
          <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-xs text-mute">
            Reads the latest saved brief — no handles or keywords to add. Ideas come out
            tagged with the trend and competitor evidence behind them.
          </div>
        )}

        {source !== "my_posts" && source !== "brief" && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addEntry();
                }}
                placeholder={source === "competitor" ? "@handle" : "trending keyword"}
              />
              <button
                onClick={addEntry}
                aria-label="Add"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-lime text-app"
              >
                <Plus size={16} />
              </button>
            </div>
            {entries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {entries.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs text-lime"
                  >
                    {e}
                    <button
                      onClick={() => setEntries((prev) => prev.filter((x) => x !== e))}
                      className="text-mute hover:text-err"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <PrimaryBtn
          className="mt-5 w-full"
          onClick={generate}
          loading={loading || picking}
          disabled={
            picking || ((source === "competitor" || source === "trend") && entries.length === 0)
          }
        >
          {picking
            ? "Generating from that brief line…"
            : step === "sourcing"
            ? source === "competitor"
              ? "Fetching competitor data…"
              : source === "my_posts"
                ? "Loading your posts…"
                : source === "brief"
                  ? "Reading the brief…"
                  : "Fetching trend data…"
            : step === "generating"
              ? "Generating ideas…"
              : "Generate Ideas"}
        </PrimaryBtn>
      </Card>

      {pickedFrom && (
        <Card className="border-lime p-4">
          <div className="text-[11px] uppercase tracking-wide text-mute">
            Ideas generated from this line ({pickedFrom.section})
          </div>
          <div className="mt-1 text-sm text-fg2">{pickedFrom.text}</div>
          <button
            onClick={() => setPickedFrom(null)}
            className="mt-2 text-xs text-mute underline hover:text-fg"
          >
            hide
          </button>
        </Card>
      )}

      {ideas.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={22} />}
          message="No ideas yet — pick a source and generate your first batch."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => {
            const isSel = selectedIdea?.id === idea.id;
            return (
              <Card
                key={idea.id}
                className={`p-5 transition-all ${
                  isSel ? "border-lime shadow-[0_0_16px_rgba(82,255,46,0.2)]" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {idea.format && <Pill variant="accent">{idea.format}</Pill>}
                  {idea.content_pillar && <Pill>{idea.content_pillar}</Pill>}
                  {idea.status && <Pill>{idea.status}</Pill>}
                </div>
                <div className="mt-3 text-[15px] font-semibold text-fg">{idea.title}</div>
                {idea.why_it_works && (
                  <div className="mt-2 text-xs italic text-fg2">
                    Why it works: {idea.why_it_works}
                  </div>
                )}
                {idea.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {idea.tags.map((t) => (
                      <Pill key={t}>{t}</Pill>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <GhostBtn
                    onClick={() => void removeIdea(idea.id)}
                    disabled={deletingIdea === idea.id}
                  >
                    <Trash2 size={13} /> {deletingIdea === idea.id ? "Deleting…" : "Delete"}
                  </GhostBtn>
                  <GhostBtn onClick={() => setSelectedIdea(idea)}>
                    {isSel ? "✓ Selected" : "Select This Idea →"}
                  </GhostBtn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selectedIdea && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-20 border-t border-lime bg-surface px-4 py-3 backdrop-blur sm:px-6 ${
            sidebarOpen ? "lg:left-[200px]" : "lg:left-0"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm text-fg">
              <span className="text-mute">Selected:</span>{" "}
              <span className="break-words text-fg">{selectedIdea.title}</span>
            </div>
            <PrimaryBtn onClick={() => onNav("script")}>Open Script →</PrimaryBtn>
          </div>
        </div>
      )}
    </div>
  );
}
