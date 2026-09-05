import { createFileRoute } from "@tanstack/react-router";
import { VideoPrompt } from "@/components/aios/sections/VideoPrompt";

export const Route = createFileRoute("/_app/video-prompt")({
  head: () => ({
    meta: [
      { title: "Video Prompt — Jepy Labs" },
      { name: "description", content: "Generate AI video prompts from your storyboard shots." },
      { property: "og:title", content: "Video Prompt — Jepy Labs" },
      { property: "og:description", content: "Generate AI video prompts from your storyboard shots." },
    ],
  }),
  component: VideoPromptPage,
});

function VideoPromptPage() {
  return <VideoPrompt />;
}
