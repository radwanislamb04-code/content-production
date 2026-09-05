import { createFileRoute } from "@tanstack/react-router";
import { VideoPrompt } from "@/components/aios/sections/VideoPrompt";

export const Route = createFileRoute("/_app/video-prompt")({
  head: () => ({
    meta: [
      { title: "JepyLabs — Video Prompt" },
      { name: "description", content: "Generate AI video prompts from your storyboard shots." },
      { property: "og:title", content: "JepyLabs — Video Prompt" },
      { property: "og:description", content: "Generate AI video prompts from your storyboard shots." },
    ],
  }),
  component: VideoPromptPage,
});

function VideoPromptPage() {
  return <VideoPrompt />;
}
