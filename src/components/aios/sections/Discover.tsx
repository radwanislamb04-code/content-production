import { useState } from "react";
import { Card, Pill, PrimaryBtn, GhostBtn, Input, EmptyState } from "../ui";
import { Lightbulb, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import type { Idea } from "@/lib/content-types";
import { usePipeline } from "../pipeline";
import type { SectionId } from "../Sidebar";

const SOURCES = [
  { id: "my_posts", label: "My Posts", hint: "Ideas derived from your best performing posts." },
  { id: "competitor", label: "Competitors", hint: "Add competitor handles to mine for angles." },
  { id: "trend", label: "Trends", hint: "Add trending keywords or hashtags." },
] as const;

type Source = (typeof SOURCES)[number]["id"];

export function Discover({ onNav }: { onNav: (id: SectionId) => void }) {
  const { ideas, setIdeas, selectedIdea, setSelectedIdea } = usePipeline();
  const [source, setSource] = useState<Source>("my_posts");
  const [entries, setEntries] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "sourcing" | "generating">("idle");

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
      try {
        const res = await apiGet<unknown[]>(
          `/api/trends?platform=youtube&category=${encodeURIComponent(keyword)}`,
        );
        if (Array.isArray(res)) all.push({ keyword, trends: res });
      } catch (err) {
        toast.error(`${keyword}: ${errorMessage(err)}`);
      }
    }
    return all;
  };

  const generate = async () => {
    setLoading(true);
    try {
      let sourceData: unknown[] = [];
      if (source !== "my_posts") {
        setStep("sourcing");
        sourceData =
          source === "competitor"
            ? await collectCompetitorData()
            : await collectTrendData();
        if (sourceData.length === 0) {
          toast.error("No source data found — try different entries.");
          return;
        }
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
        <h1 className="text-[clamp(1.5rem,6vw,1.75rem)] font-semibold text-fg">
          Ideator
        </h1>
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
          <div className="mt-3 inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-warn">
            Coming soon — full analytics integration
          </div>
        )}

        {source !== "my_posts" && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addEntry();
                }}
                placeholder={
                  source === "competitor" ? "@handle" : "trending keyword"
                }
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
                      onClick={() =>
                        setEntries((prev) => prev.filter((x) => x !== e))
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
        )}

        <PrimaryBtn
          className="mt-5 w-full"
          onClick={generate}
          loading={loading}
          disabled={source !== "my_posts" && entries.length === 0}
        >
          {step === "sourcing"
            ? source === "competitor"
              ? "Fetching competitor data…"
              : "Fetching trend data…"
            : step === "generating"
              ? "Generating ideas…"
              : "Generate Ideas"}
        </PrimaryBtn>

      </Card>

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
                  isSel
                    ? "border-lime shadow-[0_0_16px_rgba(82,255,46,0.2)]"
                    : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {idea.format && <Pill variant="accent">{idea.format}</Pill>}
                  {idea.content_pillar && <Pill>{idea.content_pillar}</Pill>}
                  {idea.status && <Pill>{idea.status}</Pill>}
                </div>
                <div className="mt-3 text-[15px] font-semibold text-fg">
                  {idea.title}
                </div>
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
                <div className="mt-4 flex justify-end">
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
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-lime bg-surface px-4 py-3 backdrop-blur sm:px-6 lg:left-[200px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm text-fg">
              <span className="text-mute">Selected:</span>{" "}
              <span className="break-words text-fg">{selectedIdea.title}</span>
            </div>
            <PrimaryBtn onClick={() => onNav("script")}>
              Open Script →
            </PrimaryBtn>
          </div>
        </div>
      )}
    </div>
  );
}
