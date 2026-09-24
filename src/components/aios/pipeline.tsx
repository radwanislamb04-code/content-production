import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type {
  Idea,
  ScriptResult,
  StoryboardResult,
  VideoPromptResult,
} from "@/lib/content-types";

/**
 * One bullet the owner picked out of the Daily Brief, on its way to the Ideator.
 *
 * The brief is prose; the Ideator wants a source. This is the carrier between the two
 * screens — set on the brief, read (and cleared) by the Ideator, which then generates
 * from *that* line instead of the whole brief.
 */
export type BriefItem = {
  text: string;
  section: string;
  date: string;
};

type PipelineState = {
  ideas: Idea[];
  setIdeas: (ideas: Idea[]) => void;
  selectedIdea: Idea | null;
  setSelectedIdea: (idea: Idea | null) => void;
  script: ScriptResult | null;
  setScript: (script: ScriptResult | null) => void;
  storyboard: StoryboardResult | null;
  setStoryboard: (sb: StoryboardResult | null) => void;
  videoPrompt: VideoPromptResult | null;
  setVideoPrompt: (vp: VideoPromptResult | null) => void;
  briefItem: BriefItem | null;
  setBriefItem: (item: BriefItem | null) => void;
};

const PipelineContext = createContext<PipelineState | null>(null);

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [script, setScript] = useState<ScriptResult | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardResult | null>(null);
  const [videoPrompt, setVideoPrompt] = useState<VideoPromptResult | null>(null);
  const [briefItem, setBriefItem] = useState<BriefItem | null>(null);

  const value = useMemo<PipelineState>(
    () => ({
      ideas,
      setIdeas,
      selectedIdea,
      setSelectedIdea,
      script,
      setScript,
      storyboard,
      setStoryboard,
      videoPrompt,
      setVideoPrompt,
      briefItem,
      setBriefItem,
    }),
    [ideas, selectedIdea, script, storyboard, videoPrompt, briefItem],
  );

  return (
    <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>
  );
}

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used inside PipelineProvider");
  return ctx;
}
