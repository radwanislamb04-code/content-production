import { createFileRoute } from "@tanstack/react-router";
import { VideoPrompt } from "@/components/aios/sections/VideoPrompt";

export const Route = createFileRoute("/_app/video-prompt")({
  head: () => ({
    meta: [
      { title: "Video Prompt — JepyLabs" },
      { name: "description", content: "Generate AI video prompts from your storyboard shots." },
      { property: "og:title", content: "Video Prompt — JepyLabs" },
      { property: "og:description", content: "Generate AI video prompts from your storyboard shots." },
    ],
  }),
  component: VideoPromptPage,
});

function VideoPromptPage() {
  return <VideoPrompt />;
}
