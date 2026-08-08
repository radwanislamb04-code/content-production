import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type {
  Idea,
  ScriptResult,
  StoryboardResult,
  VideoPromptResult,
} from "@/lib/content-types";

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
};

const PipelineContext = createContext<PipelineState | null>(null);

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [script, setScript] = useState<ScriptResult | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardResult | null>(null);
  const [videoPrompt, setVideoPrompt] = useState<VideoPromptResult | null>(null);

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
    }),
    [ideas, selectedIdea, script, storyboard, videoPrompt],
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
