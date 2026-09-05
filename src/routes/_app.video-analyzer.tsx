import { createFileRoute } from "@tanstack/react-router";
import { useSectionNav } from "@/lib/use-section-nav";
import { VideoAnalyzer } from "@/components/aios/sections/VideoAnalyzer";

export const Route = createFileRoute("/_app/video-analyzer")({
  head: () => ({
    meta: [
      { title: "Video Analyzer — Jepy Labs" },
      { name: "description", content: "Turn any reference video or idea into hooks, scripts and captions." },
      { property: "og:title", content: "Video Analyzer — Jepy Labs" },
      { property: "og:description", content: "Turn any reference video or idea into hooks, scripts and captions." },
    ],
  }),
  component: VideoAnalyzerPage,
});

function VideoAnalyzerPage() {
  const onNav = useSectionNav();
  return <VideoAnalyzer onNav={onNav} />;
}
